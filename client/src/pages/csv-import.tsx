import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ImportResult {
  message: string;
  count: number;
}

export default function CSVImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dataType, setDataType] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dataType", type);

      const response = await apiRequest("POST", "/api/import/csv", formData);
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      toast({
        title: "Import erfolgreich",
        description: data.message,
      });
      setSelectedFile(null);
      setDataType("");
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Import fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
      } else {
        toast({
          title: "Ungültiger Dateityp",
          description: "Bitte wählen Sie eine CSV-Datei aus.",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
      } else {
        toast({
          title: "Ungültiger Dateityp",
          description: "Bitte wählen Sie eine CSV-Datei aus.",
          variant: "destructive",
        });
      }
    }
  };

  const handleImport = () => {
    if (!selectedFile || !dataType) {
      toast({
        title: "Unvollständige Angaben",
        description: "Bitte wählen Sie eine Datei und einen Datentyp aus.",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate({ file: selectedFile, type: dataType });
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">CSV Import</h2>
            <p className="text-muted-foreground">SCHILD NRW Daten importieren</p>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Import Form */}
            <Card data-testid="card-import-form">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Upload className="mr-2" />
                  Daten importieren
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Data Type Selection */}
                <div className="space-y-2">
                  <Label htmlFor="data-type">Datentyp auswählen</Label>
                  <Select value={dataType} onValueChange={setDataType}>
                    <SelectTrigger data-testid="select-data-type">
                      <SelectValue placeholder="Datentyp auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teachers">Lehrkräfte</SelectItem>
                      <SelectItem value="students">Schüler</SelectItem>
                      <SelectItem value="classes">Klassen</SelectItem>
                      <SelectItem value="subjects">Fächer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label>CSV Datei</Label>
                  <div className="relative">
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                        dragActive
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-primary/50"
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('file-input')?.click()}
                      data-testid="file-upload-area"
                    >
                      {selectedFile ? (
                        <div className="flex items-center justify-center space-x-2">
                          <FileText className="text-primary h-8 w-8" />
                          <div>
                            <p className="font-medium text-foreground">{selectedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                          <p className="text-sm text-muted-foreground mb-2">
                            Datei hier ablegen oder klicken zum Auswählen
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Nur CSV-Dateien werden unterstützt
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      id="file-input"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-file"
                    />
                  </div>
                </div>

                {/* Import Button */}
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile || !dataType || importMutation.isPending}
                  className="w-full"
                  data-testid="button-import"
                >
                  {importMutation.isPending ? (
                    "Importiere..."
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importieren
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card data-testid="card-instructions">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="mr-2" />
                  CSV Format Anforderungen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Bitte stellen Sie sicher, dass Ihre CSV-Dateien dem SCHILD NRW Format entsprechen.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Lehrkräfte</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      <strong>Spalten (in dieser Reihenfolge):</strong>
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>1. Vorname</li>
                      <li>2. Nachname</li>
                      <li>3. Kürzel</li>
                      <li>4. E-Mail</li>
                      <li>5. Fächer (;-getrennt)</li>
                      <li>6. Max. Stunden/Woche (Dezimalzahl, z.B. 25.5)</li>
                      <li>7. Aktuelle Stunden/Woche (Dezimalzahl, z.B. 20.5)</li>
                      <li>8. Geburtsdatum (YYYY-MM-DD)</li>
                      <li>9. Qualifikationen (;-getrennt)</li>
                      <li>10. Notizen (optional)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">
                      <strong>Beispiel:</strong> Max Mustermann,MM,max.mustermann@schule.de,Deutsch;Mathe,25.5,22.0,1975-03-15,Lehramt;Fachleitung,Klassenlehrer 5A
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Schüler</h4>
                    <p className="text-sm text-muted-foreground">
                      Spalten: Vorname, Nachname, Klassen-ID, Jahrgangsstufe
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Klassen</h4>
                    <p className="text-sm text-muted-foreground">
                      Spalten: Klassenname, Jahrgangsstufe, Schüleranzahl
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Fächer</h4>
                    <p className="text-sm text-muted-foreground">
                      Spalten: Fachname, Kürzel, Kategorie
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Success/Error Messages */}
          {importMutation.isSuccess && (
            <Alert className="mt-6">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Import erfolgreich abgeschlossen.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </main>
    </div>
  );
}
