import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Upload, CheckCircle, AlertCircle, Users, GraduationCap, BookOpen, Calendar, Edit } from "lucide-react";
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
  const [editedData, setEditedData] = useState<ParsedScheduleData | null>(null);
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
      setEditedData(JSON.parse(JSON.stringify(data))); // Deep copy
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
    if (!editedData) return;
    
    // Convert edited data back to schedule text format for backend processing
    const reconstructedText = reconstructScheduleText(editedData);
    importScheduleMutation.mutate(reconstructedText);
  };

  const reconstructScheduleText = (data: ParsedScheduleData): string => {
    // Generate a simple text format that the backend can process
    let text = "STUNDENPLAN:\n\n";
    
    data.teachers.forEach(teacher => {
      text += `${teacher.name} (${teacher.shortName})\n`;
    });
    
    text += "\nZUWEISUNGEN:\n";
    data.assignments.forEach(assignment => {
      text += `${assignment.teacherShortName} - ${assignment.className} - ${assignment.subjectShortName} (${assignment.hoursPerWeek}h, ${assignment.semester}. Hj.)\n`;
    });
    
    return text;
  };

  const updateEditedData = (section: keyof ParsedScheduleData, index: number, field: string, value: any) => {
    if (!editedData) return;
    
    const newData = JSON.parse(JSON.stringify(editedData));
    (newData[section] as any[])[index][field] = value;
    setEditedData(newData);
  };

  const resetForm = () => {
    setScheduleText("");
    setParsedData(null);
    setEditedData(null);
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
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Erkannte Daten bearbeiten
            </DialogTitle>
            <DialogDescription>
              Überprüfen und bearbeiten Sie die von ChatGPT erkannten Daten vor dem Import.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            {editedData && (
              <div className="space-y-6">
                {/* Teachers */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Lehrer ({editedData.teachers.length})
                  </h3>
                  <div className="space-y-3">
                    {editedData.teachers.map((teacher, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Name</label>
                            <Input 
                              value={teacher.name}
                              onChange={(e) => updateEditedData('teachers', index, 'name', e.target.value)}
                              className="h-8"
                              data-testid={`input-teacher-name-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Kürzel</label>
                            <Input 
                              value={teacher.shortName}
                              onChange={(e) => updateEditedData('teachers', index, 'shortName', e.target.value)}
                              className="h-8"
                              data-testid={`input-teacher-shortname-${index}`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Qualifikationen (kommagetrennt)</label>
                          <Input 
                            value={teacher.qualifications.join(", ")}
                            onChange={(e) => updateEditedData('teachers', index, 'qualifications', e.target.value.split(",").map(q => q.trim()).filter(q => q))}
                            className="h-8"
                            placeholder="Deutsch, Englisch, ..."
                            data-testid={`input-teacher-qualifications-${index}`}
                          />
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
                    Klassen ({editedData.classes.length})
                  </h3>
                  <div className="space-y-3">
                    {editedData.classes.map((classItem, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Klassenname</label>
                            <Input 
                              value={classItem.name}
                              onChange={(e) => updateEditedData('classes', index, 'name', e.target.value)}
                              className="h-8"
                              data-testid={`input-class-name-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Jahrgang</label>
                            <Input 
                              type="number"
                              value={classItem.grade}
                              onChange={(e) => updateEditedData('classes', index, 'grade', parseInt(e.target.value) || 0)}
                              className="h-8"
                              min="1"
                              max="13"
                              data-testid={`input-class-grade-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Schüleranzahl</label>
                            <Input 
                              type="number"
                              value={classItem.studentCount}
                              onChange={(e) => updateEditedData('classes', index, 'studentCount', parseInt(e.target.value) || 0)}
                              className="h-8"
                              min="1"
                              data-testid={`input-class-studentcount-${index}`}
                            />
                          </div>
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
                    Fächer ({editedData.subjects.length})
                  </h3>
                  <div className="space-y-3">
                    {editedData.subjects.map((subject, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Fachname</label>
                            <Input 
                              value={subject.name}
                              onChange={(e) => updateEditedData('subjects', index, 'name', e.target.value)}
                              className="h-8"
                              data-testid={`input-subject-name-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Kürzel</label>
                            <Input 
                              value={subject.shortName}
                              onChange={(e) => updateEditedData('subjects', index, 'shortName', e.target.value)}
                              className="h-8"
                              data-testid={`input-subject-shortname-${index}`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Kategorie</label>
                          <Select
                            value={subject.category}
                            onValueChange={(value) => updateEditedData('subjects', index, 'category', value)}
                          >
                            <SelectTrigger className="h-8" data-testid={`select-subject-category-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Hauptfach">Hauptfach</SelectItem>
                              <SelectItem value="Nebenfach">Nebenfach</SelectItem>
                              <SelectItem value="Wahlpflichtfach">Wahlpflichtfach</SelectItem>
                              <SelectItem value="AG">AG</SelectItem>
                              <SelectItem value="Förderunterricht">Förderunterricht</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Assignments */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Zuweisungen ({editedData.assignments.length})
                  </h3>
                  <div className="space-y-3">
                    {editedData.assignments.map((assignment, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Lehrer</label>
                            <Input 
                              value={assignment.teacherShortName}
                              onChange={(e) => updateEditedData('assignments', index, 'teacherShortName', e.target.value)}
                              className="h-8"
                              data-testid={`input-assignment-teacher-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Klasse</label>
                            <Input 
                              value={assignment.className}
                              onChange={(e) => updateEditedData('assignments', index, 'className', e.target.value)}
                              className="h-8"
                              data-testid={`input-assignment-class-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Fach</label>
                            <Input 
                              value={assignment.subjectShortName}
                              onChange={(e) => updateEditedData('assignments', index, 'subjectShortName', e.target.value)}
                              className="h-8"
                              data-testid={`input-assignment-subject-${index}`}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Stunden/Woche</label>
                            <Input 
                              type="number"
                              value={assignment.hoursPerWeek}
                              onChange={(e) => updateEditedData('assignments', index, 'hoursPerWeek', parseFloat(e.target.value) || 0)}
                              className="h-8"
                              min="0"
                              step="0.5"
                              data-testid={`input-assignment-hours-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Halbjahr</label>
                            <Select
                              value={assignment.semester.toString()}
                              onValueChange={(value) => updateEditedData('assignments', index, 'semester', parseInt(value))}
                            >
                              <SelectTrigger className="h-8" data-testid={`select-assignment-semester-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1. Hj.</SelectItem>
                                <SelectItem value="2">2. Hj.</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
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