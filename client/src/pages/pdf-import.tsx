import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, Check, X, AlertCircle, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface ParsedLesson {
  className: string;
  semester: number;
  subject: string;
  hours: number;
  teacherShortName: string;
  isSupplementary?: boolean;
}

interface ImportMatch {
  className: string;
  classId: string | null;
  teacherShortName: string;
  teacherId: string | null;
  subjectName: string;
  subjectId: string | null;
}

interface ImportConflict {
  type: 'class_not_found' | 'teacher_not_found' | 'subject_not_found' | 'duplicate_assignment' | 'intelligent_mapping_conflict';
  message: string;
  suggestion?: string;
  data: any;
  mappingConflict?: MappingConflict;
}

interface SubjectMapping {
  id: string;
  pdfSubjectName: string;
  normalizedName: string;
  systemSubjectId: string;
  confidence: number;
  usedCount: number;
  lastUsedAt?: string;
}

interface MappingConflict {
  id: string;
  pdfSubjectName: string;
  normalizedName: string;
  possibleMatches: {
    subject: any;
    confidence: number;
    reason: string;
  }[];
}

interface IntelligentMappingResult {
  subjectId: string | null;
  conflict?: MappingConflict;
  autoResolved: boolean;
  mappingUsed?: SubjectMapping;
}

interface ImportPreview {
  matches: ImportMatch[];
  conflicts: ImportConflict[];
  lessons: ParsedLesson[];
  intelligentMappings?: {
    autoResolved: IntelligentMappingResult[];
    conflicts: MappingConflict[];
  };
  summary: {
    totalLessons: number;
    matchedClasses: number;
    matchedTeachers: number;
    matchedSubjects: number;
    autoResolvedSubjects?: number;
    conflicts: number;
  };
}

export default function PdfImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<{ [key: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current school year
  const { data: currentSchoolYear } = useQuery({
    queryKey: ['/api/school-years/current']
  });

  // Get existing data for resolution dropdowns
  const { data: classes } = useQuery({
    queryKey: ['/api/classes'],
    enabled: !!currentSchoolYear
  });

  const { data: teachers } = useQuery({
    queryKey: ['/api/teachers'],
    enabled: !!currentSchoolYear
  });

  const { data: subjects } = useQuery({
    queryKey: ['/api/subjects'],
    enabled: !!currentSchoolYear
  });

  // Get existing subject mappings for display
  const { data: existingMappings } = useQuery({
    queryKey: ['/api/subject-mappings'],
    enabled: !!currentSchoolYear
  });

  // Mutation for resolving mapping conflicts
  const resolveMappingMutation = useMutation({
    mutationFn: async ({ pdfSubjectName, subjectId }: { pdfSubjectName: string; subjectId: string }) => {
      return await apiRequest("POST", "/api/subject-mappings/resolve", {
        pdfSubjectName,
        selectedSubjectId: subjectId
      });
    },
    onSuccess: () => {
      toast({
        title: "Mapping erstellt",
        description: "Die Fach-Zuordnung wurde gespeichert und wird künftig automatisch verwendet.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subject-mappings'] });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Speichern",
        description: (error as Error).message,
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setPreview(null);
      setResolutions({});
    } else {
      toast({
        title: "Ungültige Datei",
        description: "Bitte wählen Sie eine PDF-Datei aus.",
        variant: "destructive"
      });
    }
  };

  const handlePreview = async () => {
    if (!file || !currentSchoolYear) {
      toast({
        title: "Fehler",
        description: "Datei und Schuljahr erforderlich.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('schoolYearId', (currentSchoolYear as any).id);

      const response = await fetch('/api/import/lesson-distribution/pdf-preview', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload fehlgeschlagen');
      }

      const result = await response.json();
      setPreview(result.preview);
      
      toast({
        title: "Vorschau erstellt",
        description: `${result.preview.summary.totalLessons} Unterrichtsstunden gefunden. ${result.preview.summary.conflicts} Konflikte zu lösen.`
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "PDF-Analyse fehlgeschlagen: " + (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || !currentSchoolYear) return;

    setIsApplying(true);
    try {
      const response = await fetch('/api/import/lesson-distribution/pdf-apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lessons: preview.lessons,
          resolutions,
          schoolYearId: (currentSchoolYear as any).id
        })
      });

      if (!response.ok) {
        throw new Error('Import fehlgeschlagen');
      }

      const result = await response.json();

      await queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
      
      toast({
        title: "Import erfolgreich",
        description: `${result.imported} Zuweisungen importiert, ${result.skipped} übersprungen.`
      });

      // Reset form
      setFile(null);
      setPreview(null);
      setResolutions({});
      
    } catch (error) {
      toast({
        title: "Import fehlgeschlagen",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsApplying(false);
    }
  };

  const updateResolution = (key: string, value: string) => {
    setResolutions(prev => ({ ...prev, [key]: value }));
  };

  const handleMappingResolve = async (pdfSubjectName: string, subjectId: string) => {
    try {
      await resolveMappingMutation.mutateAsync({ pdfSubjectName, subjectId });
      // Remove this conflict from the preview
      if (preview) {
        const updatedConflicts = preview.conflicts.filter(
          c => !(
            (c.type === 'subject_not_found' && c.data.subjectName === pdfSubjectName) ||
            (c.type === 'intelligent_mapping_conflict' && c.mappingConflict?.pdfSubjectName === pdfSubjectName)
          )
        );
        setPreview({
          ...preview,
          conflicts: updatedConflicts,
          summary: {
            ...preview.summary,
            conflicts: updatedConflicts.length
          }
        });
      }
    } catch (error) {
      console.error('Failed to resolve mapping:', error);
    }
  };

  const getConflictsByType = (type: ImportConflict['type']) => {
    return preview?.conflicts.filter(c => c.type === type) || [];
  };

  const canApply = preview && (() => {
    // Check if we have any conflicts left
    if (preview.conflicts.length === 0) return true;
    
    // Check if all remaining conflicts have resolutions
    const unresolvedConflicts = preview.conflicts.filter(conflict => {
      switch (conflict.type) {
        case 'class_not_found':
          return !resolutions[`class_${conflict.data.className}`];
        case 'teacher_not_found':
          return !resolutions[`teacher_${conflict.data.teacherShortName}`];
        case 'subject_not_found':
          return !resolutions[`subject_${conflict.data.subjectName}`];
        case 'intelligent_mapping_conflict':
          return false; // These are already handled by handleMappingResolve
        case 'duplicate_assignment':
          return false; // These are automatically handled by skipping duplicates
        default:
          return true;
      }
    });
    
    return unresolvedConflicts.length === 0;
  })();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PDF-Import</h1>
          <p className="text-muted-foreground">
            Stundenverteilung aus PDF-Dateien importieren
          </p>
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            PDF-Datei hochladen
          </CardTitle>
          <CardDescription>
            Wählen Sie eine PDF-Datei mit Stundenverteilungen zum Import aus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pdf-file">PDF-Datei</Label>
            <Input
              id="pdf-file"
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              data-testid="input-pdf-file"
            />
          </div>
          
          {file && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">{file.name}</span>
              <Badge variant="light">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>
            </div>
          )}

          <Button
            onClick={handlePreview}
            disabled={!file || isUploading}
            data-testid="button-preview"
          >
            {isUploading ? 'Analysiere...' : 'Vorschau erstellen'}
          </Button>
        </CardContent>
      </Card>

      {/* Preview Section */}
      {preview && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Importvorschau</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{preview.summary.totalLessons}</div>
                  <div className="text-sm text-muted-foreground">Stunden gesamt</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{preview.summary.matchedClasses}</div>
                  <div className="text-sm text-muted-foreground">Klassen gefunden</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{preview.summary.matchedTeachers}</div>
                  <div className="text-sm text-muted-foreground">Lehrer gefunden</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{preview.summary.matchedSubjects}</div>
                  <div className="text-sm text-muted-foreground">Fächer gefunden</div>
                </div>
                {preview.summary.autoResolvedSubjects !== undefined && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{preview.summary.autoResolvedSubjects}</div>
                    <div className="text-sm text-muted-foreground">Automatisch zugeordnet</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{preview.summary.conflicts}</div>
                  <div className="text-sm text-muted-foreground">Konflikte</div>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Traditional Conflicts Resolution */}
          {preview.conflicts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Konflikte lösen
                </CardTitle>
                <CardDescription>
                  Lösen Sie die folgenden Konflikte, bevor Sie den Import durchführen können.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {getConflictsByType('class_not_found').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Klassen nicht gefunden</h3>
                    {getConflictsByType('class_not_found').map((conflict, index) => (
                      <Alert key={index} className="mb-2">
                        <AlertDescription>
                          <div className="flex items-center justify-between">
                            <span>{conflict.message}</span>
                            <Select onValueChange={(value) => updateResolution(`class_${conflict.data.className}`, value)}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Klasse zuordnen" />
                              </SelectTrigger>
                              <SelectContent>
                                {(classes as any[])?.map((cls: any) => (
                                  <SelectItem key={cls.id} value={cls.name}>
                                    {cls.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                {getConflictsByType('teacher_not_found').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Lehrer nicht gefunden</h3>
                    {getConflictsByType('teacher_not_found').map((conflict, index) => (
                      <Alert key={index} className="mb-2">
                        <AlertDescription>
                          <div className="flex items-center justify-between">
                            <span>{conflict.message}</span>
                            <Select onValueChange={(value) => updateResolution(`teacher_${conflict.data.teacherShortName}`, value)}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Lehrer zuordnen" />
                              </SelectTrigger>
                              <SelectContent>
                                {(teachers as any[])?.map((teacher: any) => (
                                  <SelectItem key={teacher.id} value={teacher.shortName}>
                                    {teacher.shortName} - {teacher.firstName} {teacher.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                {getConflictsByType('subject_not_found').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Fächer nicht gefunden</h3>
                    {getConflictsByType('subject_not_found').map((conflict, index) => (
                      <Alert key={index} className="mb-2">
                        <AlertDescription>
                          <div className="flex items-center justify-between">
                            <span>{conflict.message}</span>
                            <Select onValueChange={(value) => updateResolution(`subject_${conflict.data.subjectName}`, value)}>
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Fach zuordnen" />
                              </SelectTrigger>
                              <SelectContent>
                                {(subjects as any[])?.map((subject: any) => (
                                  <SelectItem key={subject.id} value={subject.name}>
                                    {subject.shortName ? `${subject.shortName} - ${subject.name}` : subject.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                {getConflictsByType('intelligent_mapping_conflict').length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Intelligente Fach-Zuordnung</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Diese Fächer konnten nicht automatisch zugeordnet werden. Wählen Sie die beste Option:
                    </p>
                    {getConflictsByType('intelligent_mapping_conflict').map((conflict, index) => {
                      const mappingConflict = conflict.mappingConflict;
                      if (!mappingConflict) return null;
                      
                      return (
                        <div key={index} className="border rounded-lg p-4 mb-3">
                          <div className="mb-3">
                            <h4 className="font-medium">PDF-Fach: "{mappingConflict.pdfSubjectName}"</h4>
                            <p className="text-sm text-muted-foreground">
                              Normalisiert als: {mappingConflict.normalizedName}
                            </p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Mögliche Zuordnungen (nach Ähnlichkeit sortiert):</Label>
                            <div className="space-y-2">
                              {mappingConflict.possibleMatches.map((match, matchIndex) => (
                                <div key={matchIndex} className="flex items-center justify-between p-2 border rounded hover:bg-muted">
                                  <div className="flex items-center gap-3">
                                    <div>
                                      <div className="font-medium">{match.subject.name}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {match.reason} ({Math.round(match.confidence * 100)}% Ähnlichkeit)
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleMappingResolve(mappingConflict.pdfSubjectName, match.subject.id)}
                                    disabled={resolveMappingMutation.isPending}
                                    data-testid={`button-resolve-${mappingConflict.id}-${matchIndex}`}
                                  >
                                    Zuordnen
                                  </Button>
                                </div>
                              ))}
                            </div>
                            
                            <Separator />
                            
                            <div className="flex items-center gap-2">
                              <Label>Oder wählen Sie manuell:</Label>
                              <Select onValueChange={(value) => handleMappingResolve(mappingConflict.pdfSubjectName, value)}>
                                <SelectTrigger className="w-64">
                                  <SelectValue placeholder="Anderes Fach wählen..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {(subjects as any[])?.map((subject: any) => (
                                    <SelectItem key={subject.id} value={subject.id}>
                                      {subject.shortName ? `${subject.shortName} - ${subject.name}` : subject.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lessons Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Gefundene Unterrichtsstunden</CardTitle>
              <CardDescription>
                Überprüfen Sie die erkannten Unterrichtszuweisungen vor dem Import.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Klasse</TableHead>
                      <TableHead>Fach</TableHead>
                      <TableHead>Lehrer</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Stunden</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lessons.map((lesson, index) => {
                      const match = preview.matches[index];
                      const hasIssues = !match?.classId || !match?.teacherId || !match?.subjectId;
                      
                      return (
                        <TableRow key={index} data-testid={`row-lesson-${index}`}>
                          <TableCell className="font-medium">{lesson.className}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {lesson.subject}
                              {lesson.isSupplementary && (
                                <Badge variant="light" className="text-xs">Förder</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{lesson.teacherShortName}</TableCell>
                          <TableCell>{lesson.semester}. Halbjahr</TableCell>
                          <TableCell>{lesson.hours}</TableCell>
                          <TableCell>
                            {hasIssues ? (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <X className="h-3 w-3" />
                                Konflikt
                              </Badge>
                            ) : (
                              <Badge variant="light" className="flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Bereit
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Apply Section */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Import durchführen</h3>
                  <p className="text-sm text-muted-foreground">
                    {canApply 
                      ? 'Alle Konflikte gelöst. Import kann durchgeführt werden.'
                      : 'Lösen Sie alle Konflikte, bevor Sie den Import durchführen können.'
                    }
                  </p>
                </div>
                <Button
                  onClick={handleApply}
                  disabled={!canApply || isApplying}
                  data-testid="button-apply"
                >
                  {isApplying ? 'Importiere...' : 'Import durchführen'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}