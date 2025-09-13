import { useState, useCallback, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Download, Save, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { safeFormulaParser } from '@/lib/safe-formula-parser';
import { apiRequest } from '@/lib/queryClient';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface CellData {
  value: string;
  formula?: string;
  computed?: number;
}

interface TableData {
  id: string;
  name: string;
  headers: string[];
  rows: CellData[][];
  formulas: { [key: string]: string };
}

interface PDFTableUploaderProps {
  onTableUpdate?: (tables: TableData[]) => void;
  initialTables?: TableData[];
  maxFileSize?: number; // in bytes
}

export const PDFTableUploader = ({ onTableUpdate, initialTables = [], maxFileSize = 10 * 1024 * 1024 }: PDFTableUploaderProps) => {
  const [tables, setTables] = useState<TableData[]>(initialTables);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{tableId: string, row: number, col: number} | null>(null);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Create PDF import mutation
  const createImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await apiRequest('POST', '/api/pdf-imports', formData);
      
      if (!response.ok) {
        throw new Error('Failed to upload PDF');
      }
      
      return response.json();
    },
    onSuccess: (importData) => {
      setCurrentImportId(importData.id);
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-imports'] });
    },
  });

  // Create PDF table mutation
  const createTableMutation = useMutation({
    mutationFn: async (tableData: TableData & { importId: string }) => {
      const response = await apiRequest('POST', '/api/pdf-tables', tableData);
      if (!response.ok) {
        throw new Error('Failed to save table');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-tables'] });
      if (currentImportId) {
        queryClient.invalidateQueries({ queryKey: ['/api/pdf-imports', currentImportId, 'tables'] });
      }
    },
  });

  // Calculate formula values using safe parser
  const calculateFormula = (formula: string, tableData: TableData): number => {
    return safeFormulaParser.evaluateFormula(formula, tableData);
  };

  // Extract text with coordinates from PDF
  const extractTextWithCoordinates = async (pdfDocument: any, pageNum: number) => {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    return textContent.items
      .filter((item: any): item is TextItem => 'str' in item && item.str.trim() !== '')
      .map((item: TextItem) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }));
  };

  // Group text into table structure
  const groupTextIntoTable = (textItems: any[]) => {
    const sortedItems = textItems.sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y);
      if (yDiff < 8) { // Same row if Y coordinates are within 8 units
        return a.x - b.x;
      }
      return b.y - a.y; // Top to bottom
    });

    const rows: string[][] = [];
    let currentRow: any[] = [];
    let lastY = -1;
    const yTolerance = 8;

    sortedItems.forEach(item => {
      if (lastY === -1 || Math.abs(item.y - lastY) < yTolerance) {
        currentRow.push(item);
      } else {
        if (currentRow.length > 0) {
          const rowText = currentRow
            .sort((a, b) => a.x - b.x)
            .map(item => item.text);
          if (rowText.length > 1) {
            rows.push(rowText);
          }
        }
        currentRow = [item];
      }
      lastY = item.y;
    });

    if (currentRow.length > 0) {
      const rowText = currentRow
        .sort((a, b) => a.x - b.x)
        .map(item => item.text);
      if (rowText.length > 1) {
        rows.push(rowText);
      }
    }

    return rows.filter(row => row.length > 1);
  };

  // Extract tables from PDF
  const extractTablesFromPDF = useCallback(async (file: File, importId: string) => {
    try {
      const fileArrayBuffer = await file.arrayBuffer();
      const pdfDocument = await pdfjs.getDocument({ data: fileArrayBuffer }).promise;
      const numPages = pdfDocument.numPages;
      const extractedTables: TableData[] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const textItems = await extractTextWithCoordinates(pdfDocument, pageNum);
        const tableRows = groupTextIntoTable(textItems);
        
        if (tableRows.length > 1) { // At least header + 1 data row
          const headers = tableRows[0];
          const dataRows = tableRows.slice(1);
          
          const tableData: TableData = {
            id: `pdf-table-${pageNum}-${Date.now()}`,
            name: `Lehrerplanstellen Seite ${pageNum}`,
            headers,
            rows: dataRows.map(row => 
              row.map(cell => ({
                value: cell,
                formula: cell.startsWith('=') ? cell : undefined,
                computed: !isNaN(Number(cell)) ? Number(cell) : undefined
              }))
            ),
            formulas: {}
          };

          extractedTables.push(tableData);
          
          // Save each table to backend
          try {
            await createTableMutation.mutateAsync({
              ...tableData,
              importId,
            });
          } catch (err) {
            console.error('Failed to save table:', err);
            // Continue with other tables even if one fails
          }
        }
      }

      setTables(prev => [...prev, ...extractedTables]);
      onTableUpdate?.([...tables, ...extractedTables]);
      
      toast({
        title: "PDF erfolgreich verarbeitet",
        description: `${extractedTables.length} Tabelle(n) aus ${numPages} Seite(n) extrahiert und gespeichert.`,
      });

    } catch (err) {
      const errorMessage = `Fehler beim Verarbeiten der PDF: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`;
      setError(errorMessage);
      toast({
        title: "Fehler",
        description: errorMessage,
        variant: "destructive",
      });
      throw err; // Re-throw to be caught by uploadAndExtractTables
    }
  }, [tables, onTableUpdate, toast, createTableMutation]);

  // Handle file upload with validation
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) return;
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      toast({
        title: "Ungültiger Dateityp",
        description: "Bitte wählen Sie eine PDF-Datei aus.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate file size
    if (file.size > maxFileSize) {
      toast({
        title: "Datei zu groß",
        description: `Die Datei ist größer als ${Math.round(maxFileSize / (1024 * 1024))}MB. Bitte wählen Sie eine kleinere Datei aus.`,
        variant: "destructive",
      });
      return;
    }
    
    // First upload to backend, then extract tables
    uploadAndExtractTables(file);
  };

  // Upload PDF and extract tables
  const uploadAndExtractTables = async (file: File) => {
    setLoading(true);
    setError('');
    
    try {
      // First upload to backend
      const importData = await createImportMutation.mutateAsync(file);
      
      // Then extract tables from PDF
      await extractTablesFromPDF(file, importData.id);
      
    } catch (err) {
      const errorMessage = `Fehler beim Hochladen der PDF: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`;
      setError(errorMessage);
      toast({
        title: "Fehler",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  // Update cell value
  const updateCellValue = (tableId: string, rowIndex: number, colIndex: number, value: string) => {
    setTables(prev => prev.map(table => {
      if (table.id === tableId) {
        const newRows = [...table.rows];
        if (!newRows[rowIndex]) {
          newRows[rowIndex] = [];
        }
        if (!newRows[rowIndex][colIndex]) {
          newRows[rowIndex][colIndex] = { value: '' };
        }
        
        newRows[rowIndex][colIndex] = {
          value,
          formula: value.startsWith('=') ? value : undefined,
          computed: !isNaN(Number(value)) ? Number(value) : calculateFormula(value, table)
        };

        const updatedTable = { ...table, rows: newRows };
        return updatedTable;
      }
      return table;
    }));
  };

  // Add new row
  const addRow = (tableId: string) => {
    setTables(prev => prev.map(table => {
      if (table.id === tableId) {
        const newRow = new Array(table.headers.length).fill(null).map(() => ({ value: '' }));
        return { ...table, rows: [...table.rows, newRow] };
      }
      return table;
    }));
  };

  // Delete row
  const deleteRow = (tableId: string, rowIndex: number) => {
    setTables(prev => prev.map(table => {
      if (table.id === tableId) {
        const newRows = table.rows.filter((_, index) => index !== rowIndex);
        return { ...table, rows: newRows };
      }
      return table;
    }));
  };

  // Export to CSV
  const exportToCSV = (table: TableData) => {
    const csvContent = [
      table.headers.join(','),
      ...table.rows.map(row => 
        row.map(cell => `"${cell.value}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card data-testid="card-pdf-upload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            PDF Lehrerplanstellen Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Klicken Sie zum Upload</span> oder ziehen Sie eine PDF-Datei hier hin
                  </p>
                  <p className="text-xs text-muted-foreground">PDF (MAX. {Math.round(maxFileSize / (1024 * 1024))}MB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-pdf-file"
                />
              </label>
            </div>
            
            {(loading || createImportMutation.isPending || createTableMutation.isPending) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                {createImportMutation.isPending && 'PDF wird hochgeladen...'}
                {createTableMutation.isPending && 'Tabellen werden gespeichert...'}
                {loading && !createImportMutation.isPending && !createTableMutation.isPending && 'PDF wird verarbeitet...'}
              </div>
            )}
            
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tables Section */}
      {tables.map((table) => (
        <Card key={table.id} data-testid={`card-table-${table.id}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {table.name}
                <Badge variant="light" className="ml-2">
                  {table.rows.length} Zeilen
                </Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRow(table.id)}
                  data-testid={`button-add-row-${table.id}`}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Zeile hinzufügen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportToCSV(table)}
                  data-testid={`button-export-${table.id}`}
                >
                  <Download className="w-4 h-4 mr-1" />
                  CSV Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full border-collapse border border-border">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border p-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      #
                    </th>
                    {table.headers.map((header, index) => (
                      <th
                        key={index}
                        className="border border-border p-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        data-testid={`header-${table.id}-${index}`}
                      >
                        {header}
                      </th>
                    ))}
                    <th className="border border-border p-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-muted/30">
                      <td className="border border-border p-2 text-sm font-medium text-muted-foreground">
                        {rowIndex + 1}
                      </td>
                      {row.map((cell, colIndex) => (
                        <td
                          key={colIndex}
                          className="border border-border p-1"
                          data-testid={`cell-${table.id}-${rowIndex}-${colIndex}`}
                        >
                          {editingCell?.tableId === table.id && 
                           editingCell?.row === rowIndex && 
                           editingCell?.col === colIndex ? (
                            <Input
                              value={cell.value}
                              onChange={(e) => updateCellValue(table.id, rowIndex, colIndex, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full h-8 text-sm"
                              autoFocus
                            />
                          ) : (
                            <div
                              className="p-2 min-h-[32px] cursor-pointer hover:bg-muted/50 rounded text-sm"
                              onClick={() => setEditingCell({tableId: table.id, row: rowIndex, col: colIndex})}
                            >
                              {cell.formula && (
                                <div className="text-xs text-blue-600 font-mono mb-1">
                                  {cell.formula}
                                </div>
                              )}
                              <div className={cell.computed !== undefined ? 'font-medium' : ''}>
                                {cell.computed !== undefined ? Number(cell.computed).toFixed(1) : cell.value}
                              </div>
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="border border-border p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRow(table.id, rowIndex)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-row-${table.id}-${rowIndex}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PDFTableUploader;