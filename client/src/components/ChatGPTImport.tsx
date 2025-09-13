import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, MessageSquare, Upload, CheckCircle, AlertCircle, Users, GraduationCap, BookOpen, Calendar } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ParsedScheduleData {
  teachers: Array<{
    name: string;
    shortName: string;
    qualifications: string[];
  }>;
  classes: Array<{
    name: string;
    grade: number;
    studentCount: number;
  }>;
  subjects: Array<{
    name: string;
    shortName: string;
    category: string;
  }>;
  assignments: Array<{
    teacherShortName: string;
    className: string;
    subjectShortName: string;
    hoursPerWeek: number;
    semester: number;
  }>;
}

interface ImportResult {
  teachers: number;
  classes: number;
  subjects: number;
  assignments: number;
  errors: string[];
}

export function ChatGPTImport() {
  const [scheduleText, setScheduleText] = useState("");
  const [parsedData, setParsedData] = useState<ParsedScheduleData | null>(null);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse schedule text with ChatGPT
  const parseScheduleMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/chatgpt/parse-schedule", { scheduleText: text });
      return response.json();
    },
    onSuccess: (data: ParsedScheduleData) => {
      setParsedData(data);
      setPreviewDialog(true);
      toast({
        title: "Stundenplan erfolgreich analysiert",
        description: `${data.teachers.length} Lehrer, ${data.classes.length} Klassen, ${data.subjects.length} Fächer und ${data.assignments.length} Zuweisungen gefunden.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Analysieren",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Import parsed data
  const importScheduleMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/chatgpt/import-schedule", { scheduleText: text });
      return response.json();
    },
    onSuccess: (data: { results: ImportResult }) => {
      setImportResult(data.results);
      setPreviewDialog(false);
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subjects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      
      const { results } = data;
      const successCount = results.teachers + results.classes + results.subjects + results.assignments;
      
      if (successCount > 0) {
        toast({
          title: "Import erfolgreich abgeschlossen",
          description: `${successCount} Datensätze importiert. ${results.errors.length} Fehler aufgetreten.`
        });
      } else {
        toast({
          title: "Import abgeschlossen",
          description: "Keine neuen Daten importiert. Möglicherweise existieren die Daten bereits.",
          variant: "destructive"
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Import",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleAnalyze = () => {
    if (!scheduleText.trim()) {
      toast({
        title: "Eingabe erforderlich",
        description: "Bitte geben Sie den Stundenplan-Text ein.",
        variant: "destructive"
      });
      return;
    }
    parseScheduleMutation.mutate(scheduleText);
  };

  const handleImport = () => {
    if (!scheduleText.trim()) return;
    importScheduleMutation.mutate(scheduleText);
  };

  const resetForm = () => {
    setScheduleText("");
    setParsedData(null);
    setImportResult(null);
    setPreviewDialog(false);
  };

  return (
    <div className="space-y-6" data-testid="chatgpt-import-container">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            ChatGPT Stundenplan-Import
          </CardTitle>
          <CardDescription>
            Fügen Sie hier den Stundenplan-Text ein. ChatGPT wird automatisch Lehrer, Klassen, Fächer und Zuweisungen erkennen und importieren.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="schedule-input" className="text-sm font-medium">
              Stundenplan-Text
            </label>
            <Textarea
              id="schedule-input"
              placeholder="Beispiel:
MÜL (Müller) - Deutsch, Englisch
5a (25 Schüler) - D: 4h (MÜL), M: 5h (SCH), E: 3h (MÜL)
10b (22 Schüler) - D: 3h (BRA), M: 4h (SCH), CH: 2h (WEI)
..."
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              className="min-h-[200px]"
              data-testid="input-schedule-text"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleAnalyze}
              disabled={parseScheduleMutation.isPending || !scheduleText.trim()}
              data-testid="button-analyze-schedule"
            >
              {parseScheduleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Mit ChatGPT analysieren
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={resetForm}
              data-testid="button-reset-form"
            >
              Zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import Results */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Import-Ergebnis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <Users className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <div className="text-2xl font-bold">{importResult.teachers}</div>
                <div className="text-sm text-muted-foreground">Lehrer</div>
              </div>
              <div className="text-center">
                <GraduationCap className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <div className="text-2xl font-bold">{importResult.classes}</div>
                <div className="text-sm text-muted-foreground">Klassen</div>
              </div>
              <div className="text-center">
                <BookOpen className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                <div className="text-2xl font-bold">{importResult.subjects}</div>
                <div className="text-sm text-muted-foreground">Fächer</div>
              </div>
              <div className="text-center">
                <Calendar className="h-8 w-8 mx-auto text-orange-600 mb-2" />
                <div className="text-2xl font-bold">{importResult.assignments}</div>
                <div className="text-sm text-muted-foreground">Zuweisungen</div>
              </div>
            </div>
            
            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fehler beim Import ({importResult.errors.length})</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-20 mt-2">
                    <ul className="text-sm space-y-1">
                      {importResult.errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Erkannte Daten - Vorschau</DialogTitle>
            <DialogDescription>
              Überprüfen Sie die von ChatGPT erkannten Daten vor dem Import.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            {parsedData && (
              <div className="space-y-6">
                {/* Teachers */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Lehrer ({parsedData.teachers.length})
                  </h3>
                  <div className="grid gap-2">
                    {parsedData.teachers.map((teacher, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="font-medium">{teacher.name} ({teacher.shortName})</div>
                        <div className="text-sm text-muted-foreground">
                          Qualifikationen: {teacher.qualifications.join(", ") || "Keine angegeben"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Classes */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Klassen ({parsedData.classes.length})
                  </h3>
                  <div className="grid gap-2">
                    {parsedData.classes.map((classItem, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="font-medium">{classItem.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Jahrgang {classItem.grade} • {classItem.studentCount} Schüler
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Subjects */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Fächer ({parsedData.subjects.length})
                  </h3>
                  <div className="grid gap-2">
                    {parsedData.subjects.map((subject, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="font-medium">{subject.name} ({subject.shortName})</div>
                        <Badge variant="secondary">{subject.category}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Assignments */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Zuweisungen ({parsedData.assignments.length})
                  </h3>
                  <div className="grid gap-2">
                    {parsedData.assignments.map((assignment, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="font-medium">
                          {assignment.teacherShortName} → {assignment.className} → {assignment.subjectShortName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {assignment.hoursPerWeek}h/Woche • {assignment.semester}. Semester
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleImport}
              disabled={importScheduleMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importScheduleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importiere...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Daten importieren
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}