import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sidebar } from "@/components/layout/sidebar";
import { RefreshCw, AlertTriangle, CheckCircle, Calendar, Users, BookOpen, ArrowRight, Play, FileText, Loader2, Plus, Trash2 } from "lucide-react";

type SchoolYear = {
  id: string;
  name: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
};

type Stats = {
  totalClasses: number;
  totalStudents: number;
  totalTeachers: number;
  totalAssignments: number;
};

type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  statistics: {
    totalClasses: number;
    totalStudents: number;
    totalTeachers: number;
    totalAssignments: number;
    graduatingClasses: number;
  };
};

type PreviewResult = {
  success: boolean;
  preview: {
    newClasses: Array<{
      name: string;
      grade: number;
      expectedStudentCount: number;
      sourceClass?: string;
    }>;
    migratedAssignments: Array<{
      teacherName: string;
      subject: string;
      fromClass: string;
      toClass: string;
      status: 'auto' | 'manual_check' | 'skip';
    }>;
    archivedClasses: Array<{
      name: string;
      studentCount: number;
    }>;
    migratedStudents: number;
    statistics: {
      classesCreated: number;
      assignmentsMigrated: number;
      studentsArchived: number;
      studentsMigrated: number;
    };
  };
};

type TransitionResult = {
  success: boolean;
  newSchoolYearId: string;
  statistics: {
    classesCreated: number;
    assignmentsMigrated: number;
    studentsArchived: number;
    studentsMigrated: number;
  };
  warnings: string[];
  errors?: string[];
};

type NewClassConfig = {
  name: string;
  grade: number;
  expectedStudentCount: number;
};

export default function Schuljahreswechsel() {
  const [currentStep, setCurrentStep] = useState<"overview" | "preparation" | "preview" | "execution" | "completed">("overview");
  const [nextSchoolYearName, setNextSchoolYearName] = useState("");
  const [newClasses, setNewClasses] = useState<NewClassConfig[]>([
    { name: "5a", grade: 5, expectedStudentCount: 28 },
    { name: "5b", grade: 5, expectedStudentCount: 27 }
  ]);
  const [migrationRules, setMigrationRules] = useState({
    autoMigrateContinuousSubjects: true,
    handleDifferenzierung: true,
    archiveGraduatedClasses: true,
    preserveInactiveTeachers: false,
    createMissingSubjects: false
  });
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [transitionResult, setTransitionResult] = useState<TransitionResult | null>(null);
  
  const { toast } = useToast();

  // Fetch current school year and stats
  const { data: currentSchoolYear, isLoading: currentSchoolYearLoading, error: currentSchoolYearError } = useQuery<SchoolYear>({
    queryKey: ['/api/school-years/current']
  });

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<Stats>({
    queryKey: ['/api/stats']
  });

  // Set default next school year name
  useEffect(() => {
    if (currentSchoolYear && !nextSchoolYearName) {
      const currentYear = parseInt(currentSchoolYear.name.split('/')[0]);
      const nextYear = currentYear + 1;
      setNextSchoolYearName(`${nextYear}/${String(nextYear + 1).slice(-2)}`);
    }
  }, [currentSchoolYear, nextSchoolYearName]);

  // Validation mutation
  const validateMutation = useMutation<ValidationResult, Error, void>({
    mutationFn: async () => {
      if (!currentSchoolYear) throw new Error("Kein aktuelles Schuljahr gefunden");
      const response = await apiRequest('GET', `/api/school-years/validate-transition/${currentSchoolYear.id}`);
      return await response.json();
    },
    onSuccess: (data: ValidationResult) => {
      setValidationResult(data);
      if (data.valid) {
        toast({ title: "Validierung erfolgreich", description: "System ist bereit für den Schuljahreswechsel" });
        setCurrentStep("preparation");
      } else {
        toast({ 
          title: "Validierung fehlgeschlagen", 
          description: `${data.errors.length} Fehler gefunden`,
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      let title = "Validierungsfehler";
      let description = error.message || "Fehler bei der Validierung";
      
      if (error.message?.includes("401") || error.message?.includes("403")) {
        title = "Keine Berechtigung";
        description = "Sie haben keine Berechtigung für Schuljahreswechsel. Nur Administratoren können diese Funktion verwenden.";
      } else if (error.message?.includes("404")) {
        description = "Das angegebene Schuljahr wurde nicht gefunden.";
      } else if (error.message?.includes("422")) {
        description = "Ungültige Eingabedaten. Bitte überprüfen Sie Ihre Eingaben.";
      }
      
      toast({ 
        title, 
        description,
        variant: "destructive"
      });
    }
  });

  // Preview mutation
  const previewMutation = useMutation<PreviewResult, Error, void>({
    mutationFn: async () => {
      if (!currentSchoolYear) throw new Error("Kein aktuelles Schuljahr gefunden");
      const response = await apiRequest('POST', '/api/school-years/preview-transition', {
        fromSchoolYearId: currentSchoolYear.id,
        toSchoolYearName: nextSchoolYearName,
        params: {
          newClasses,
          migrationRules
        }
      });
      return await response.json();
    },
    onSuccess: (data: PreviewResult) => {
      console.log("Preview API Response:", data);
      setPreviewResult(data);
      toast({ title: "Vorschau erstellt", description: "Übergangsplan wurde generiert" });
      setCurrentStep("preview");
    },
    onError: (error: any) => {
      let title = "Vorschau-Fehler";
      let description = error.message || "Fehler bei der Vorschau-Erstellung";
      
      if (error.message?.includes("401") || error.message?.includes("403")) {
        title = "Keine Berechtigung";
        description = "Sie haben keine Berechtigung für Schuljahreswechsel. Nur Administratoren können diese Funktion verwenden.";
      } else if (error.message?.includes("404")) {
        description = "Das angegebene Schuljahr wurde nicht gefunden.";
      } else if (error.message?.includes("422")) {
        description = "Ungültige Eingabedaten. Bitte überprüfen Sie Ihre Konfiguration.";
      } else if (error.message?.includes("409")) {
        description = "Das Zielschuljahr existiert bereits. Bitte wählen Sie einen anderen Namen.";
      }
      
      toast({ 
        title, 
        description,
        variant: "destructive"
      });
    }
  });

  // Execute mutation
  const executeMutation = useMutation<TransitionResult, Error, void>({
    mutationFn: async () => {
      if (!currentSchoolYear) throw new Error("Kein aktuelles Schuljahr gefunden");
      const response = await apiRequest('POST', '/api/school-years/execute-transition', {
        fromSchoolYearId: currentSchoolYear.id,
        toSchoolYearName: nextSchoolYearName,
        params: {
          newClasses,
          migrationRules
        }
      });
      return await response.json();
    },
    onSuccess: (data: TransitionResult) => {
      setTransitionResult(data);
      if (data.success) {
        toast({ title: "Schuljahreswechsel erfolgreich", description: "Das neue Schuljahr wurde erstellt" });
        setCurrentStep("completed");
        // Invalidate cache to refresh data
        queryClient.invalidateQueries({ queryKey: ['/api/school-years'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      } else {
        toast({ 
          title: "Schuljahreswechsel fehlgeschlagen", 
          description: "Siehe Details für weitere Informationen",
          variant: "destructive"
        });
      }
    },
    onError: (error: any) => {
      let title = "Ausführungsfehler";
      let description = error.message || "Fehler beim Schuljahreswechsel";
      
      if (error.message?.includes("401") || error.message?.includes("403")) {
        title = "Keine Berechtigung";
        description = "Sie haben keine Berechtigung für Schuljahreswechsel. Nur Administratoren können diese Funktion verwenden.";
      } else if (error.message?.includes("404")) {
        description = "Das angegebene Schuljahr wurde nicht gefunden.";
      } else if (error.message?.includes("422")) {
        description = "Der Schuljahreswechsel konnte nicht ausgeführt werden. Bitte überprüfen Sie die Validierung.";
      } else if (error.message?.includes("409")) {
        description = "Das Zielschuljahr existiert bereits. Der Übergang wurde möglicherweise bereits durchgeführt.";
      }
      
      toast({ 
        title, 
        description,
        variant: "destructive"
      });
    }
  });

  const addNewClass = () => {
    const newClassNumber = newClasses.filter(c => c.grade === 5).length + 1;
    const className = `5${String.fromCharCode(96 + newClassNumber)}`; // 5a, 5b, 5c...
    setNewClasses([...newClasses, { name: className, grade: 5, expectedStudentCount: 25 }]);
  };

  const removeNewClass = (index: number) => {
    setNewClasses(newClasses.filter((_, i) => i !== index));
  };

  const updateNewClass = (index: number, field: keyof NewClassConfig, value: string | number) => {
    const updated = [...newClasses];
    updated[index] = { ...updated[index], [field]: value };
    setNewClasses(updated);
  };

  const isLoading = currentSchoolYearLoading || statsLoading;
  const hasErrors = currentSchoolYearError || statsError;
  const canProceed = currentSchoolYear && nextSchoolYearName && newClasses.length > 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <RefreshCw className="h-8 w-8 text-primary" />
                Schuljahreswechsel
              </h1>
              <p className="text-muted-foreground mt-2">
                {isLoading 
                  ? "Lade Schuljahresinformationen..."
                  : currentSchoolYear && nextSchoolYearName
                  ? `Automatischer Übergang von ${currentSchoolYear.name} zu ${nextSchoolYearName}`
                  : "Vorbereitung des Schuljahreswechsels"
                }
              </p>
            </div>
            <Badge variant="light" className="text-sm" data-testid="badge-current-year">
              {currentSchoolYear ? `Aktuell: ${currentSchoolYear.name}` : "Lädt..."}
            </Badge>
          </div>

          {/* Error UI */}
          {hasErrors && (
            <Alert variant="destructive" data-testid="error-loading-data">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-medium">Fehler beim Laden der Daten</div>
                  {currentSchoolYearError && (
                    <div className="text-sm">
                      <strong>Schuljahr:</strong> {
                        (currentSchoolYearError as any)?.message?.includes("401") || (currentSchoolYearError as any)?.message?.includes("403")
                          ? "Keine Berechtigung - Sie benötigen Administrator-Rechte"
                          : (currentSchoolYearError as any)?.message || "Fehler beim Laden des aktuellen Schuljahres"
                      }
                    </div>
                  )}
                  {statsError && (
                    <div className="text-sm">
                      <strong>Statistiken:</strong> {
                        (statsError as any)?.message?.includes("401") || (statsError as any)?.message?.includes("403")
                          ? "Keine Berechtigung - Sie benötigen Administrator-Rechte"
                          : (statsError as any)?.message || "Fehler beim Laden der Statistiken"
                      }
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground mt-2">
                    Bitte aktualisieren Sie die Seite oder wenden Sie sich an einen Administrator.
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Disable interface if there are critical errors */}
          {hasErrors && (currentSchoolYearError || !currentSchoolYear) && (
            <Card>
              <CardContent className="p-6">
                <div className="text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                  <h3 className="text-lg font-medium mb-2">Schuljahreswechsel nicht verfügbar</h3>
                  <p>
                    Die Funktion kann nicht verwendet werden, da die erforderlichen Daten nicht geladen werden konnten.
                    {(currentSchoolYearError as any)?.message?.includes("401") || (currentSchoolYearError as any)?.message?.includes("403")
                      ? " Sie benötigen Administrator-Rechte für diese Funktion."
                      : " Bitte versuchen Sie es später erneut."
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                System-Status
              </CardTitle>
              <CardDescription>
                Überprüfung der Systemvoraussetzungen für den Schuljahreswechsel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Lade Systemstatus...</span>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-sm">Lehrerdaten</p>
                      <p className="text-xs text-muted-foreground">{stats?.totalTeachers || 0} aktive Lehrer</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-sm">Klassendaten</p>
                      <p className="text-xs text-muted-foreground">{stats?.totalClasses || 0} Klassen</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    validationResult?.valid 
                      ? 'bg-green-50 dark:bg-green-950/30'
                      : validationResult?.valid === false
                      ? 'bg-red-50 dark:bg-red-950/30'
                      : 'bg-yellow-50 dark:bg-yellow-950/30'
                  }`}>
                    {validationResult?.valid ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : validationResult?.valid === false ? (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    )}
                    <div>
                      <p className="font-medium text-sm">System-Validierung</p>
                      <p className="text-xs text-muted-foreground">
                        {validationResult?.valid 
                          ? 'Bereit für Übergang'
                          : validationResult?.valid === false
                          ? `${validationResult.errors.length} Fehler`
                          : 'Validierung erforderlich'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {validationResult && !validationResult.valid && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Validierungsfehler gefunden:</strong>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      {validationResult.errors.map((error, index) => (
                        <li key={index} className="text-sm">{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              {validationResult?.warnings && validationResult.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Warnungen:</strong>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      {validationResult.warnings.map((warning, index) => (
                        <li key={index} className="text-sm">{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Main Content based on current step */}
          {currentStep === "overview" && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Current Year Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Aktuelles Schuljahr {currentSchoolYear?.name || "Lädt..."}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Lehrer aktiv:</span>
                      <span className="font-medium">47</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Klassen:</span>
                      <span className="font-medium">24</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Schüler:</span>
                      <span className="font-medium">624</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Zuweisungen:</span>
                      <span className="font-medium">156</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Transition Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Übergang zu {nextSchoolYearName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Der Schuljahreswechsel ist ein kritischer Vorgang, der nicht rückgängig gemacht werden kann.
                      Stellen Sie sicher, dass alle Daten korrekt sind.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-3">
                    <Button 
                      onClick={() => setCurrentStep("preparation")}
                      className="w-full justify-between"
                      data-testid="button-start-transition"
                    >
                      Schuljahreswechsel vorbereiten
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full"
                      data-testid="button-preview-transition"
                    >
                      Vorschau anzeigen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === "preparation" && (
            <Card>
              <CardHeader>
                <CardTitle>Vorbereitung des Schuljahreswechsels</CardTitle>
                <CardDescription>
                  Konfiguration der Übergangsparameter für {nextSchoolYearName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                  {/* Migration Rules */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Migrations-Regeln</h3>
                    
                    <div className="grid gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="auto-migrate"
                          checked={migrationRules.autoMigrateContinuousSubjects}
                          onCheckedChange={(checked) => 
                            setMigrationRules(prev => ({ ...prev, autoMigrateContinuousSubjects: !!checked }))
                          }
                          data-testid="checkbox-auto-migrate"
                        />
                        <Label htmlFor="auto-migrate" className="text-sm">
                          Kontinuierliche Fächer automatisch migrieren (Deutsch, Mathematik, Englisch, Sport, Religion)
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="handle-diff"
                          checked={migrationRules.handleDifferenzierung}
                          onCheckedChange={(checked) => 
                            setMigrationRules(prev => ({ ...prev, handleDifferenzierung: !!checked }))
                          }
                          data-testid="checkbox-handle-diff"
                        />
                        <Label htmlFor="handle-diff" className="text-sm">
                          Differenzierungs-Fächer verwalten (WP-Bereich, FS, SW, NW-Kurs)
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="archive-graduated"
                          checked={migrationRules.archiveGraduatedClasses}
                          onCheckedChange={(checked) => 
                            setMigrationRules(prev => ({ ...prev, archiveGraduatedClasses: !!checked }))
                          }
                          data-testid="checkbox-archive-graduated"
                        />
                        <Label htmlFor="archive-graduated" className="text-sm">
                          Abschlussklassen (10. Klassen) archivieren
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="preserve-inactive"
                          checked={migrationRules.preserveInactiveTeachers}
                          onCheckedChange={(checked) => 
                            setMigrationRules(prev => ({ ...prev, preserveInactiveTeachers: !!checked }))
                          }
                          data-testid="checkbox-preserve-inactive"
                        />
                        <Label htmlFor="preserve-inactive" className="text-sm">
                          Inaktive Lehrer beibehalten
                        </Label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="create-missing"
                          checked={migrationRules.createMissingSubjects}
                          onCheckedChange={(checked) => 
                            setMigrationRules(prev => ({ ...prev, createMissingSubjects: !!checked }))
                          }
                          data-testid="checkbox-create-missing"
                        />
                        <Label htmlFor="create-missing" className="text-sm">
                          Fehlende Fächer automatisch anlegen
                        </Label>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* New Classes Configuration */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Neue Eingangsklassen (5. Klasse)</h3>
                      <Button
                        onClick={addNewClass}
                        size="sm"
                        variant="outline"
                        data-testid="button-add-class"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Klasse hinzufügen
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      {newClasses.map((cls, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border rounded-lg">
                          <div>
                            <Label htmlFor={`class-name-${index}`} className="text-xs">Klassenname</Label>
                            <Input
                              id={`class-name-${index}`}
                              value={cls.name}
                              onChange={(e) => updateNewClass(index, 'name', e.target.value)}
                              placeholder="z.B. 5a"
                              data-testid={`input-class-name-${index}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`class-grade-${index}`} className="text-xs">Jahrgangsstufe</Label>
                            <Input
                              id={`class-grade-${index}`}
                              type="number"
                              min="5"
                              max="10"
                              value={cls.grade}
                              onChange={(e) => updateNewClass(index, 'grade', parseInt(e.target.value) || 5)}
                              data-testid={`input-class-grade-${index}`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`class-count-${index}`} className="text-xs">Erwartete Schülerzahl</Label>
                            <Input
                              id={`class-count-${index}`}
                              type="number"
                              min="1"
                              max="35"
                              value={cls.expectedStudentCount}
                              onChange={(e) => updateNewClass(index, 'expectedStudentCount', parseInt(e.target.value) || 25)}
                              data-testid={`input-class-count-${index}`}
                            />
                          </div>
                          <div className="flex items-end">
                            {newClasses.length > 1 && (
                              <Button
                                onClick={() => removeNewClass(index)}
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-remove-class-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentStep("overview")}
                      data-testid="button-back-overview"
                    >
                      Zurück zur Übersicht
                    </Button>
                    <Button 
                      onClick={() => previewMutation.mutate()}
                      disabled={!canProceed || previewMutation.isPending}
                      data-testid="button-create-preview"
                    >
                      {previewMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Erstelle Vorschau...
                        </>
                      ) : (
                        <>
                          Vorschau erstellen
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "preview" && previewResult && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Vorschau: Übergang zu {nextSchoolYearName}
                  </CardTitle>
                  <CardDescription>
                    Überprüfen Sie die geplanten Änderungen vor der Ausführung
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Statistics Summary */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{previewResult.preview.statistics.classesCreated}</div>
                      <div className="text-xs text-muted-foreground">Neue Klassen</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{previewResult.preview.statistics.assignmentsMigrated}</div>
                      <div className="text-xs text-muted-foreground">Migrierte Zuweisungen</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{previewResult.preview.statistics.studentsArchived}</div>
                      <div className="text-xs text-muted-foreground">Archivierte Schüler</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{previewResult.preview.statistics.studentsMigrated}</div>
                      <div className="text-xs text-muted-foreground">Migrierte Schüler</div>
                    </div>
                  </div>
                  
                  {/* New Classes */}
                  <div>
                    <h4 className="font-semibold mb-3">Neue Klassen</h4>
                    <div className="space-y-2">
                      {previewResult.preview.newClasses.map((cls, index) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <span className="font-medium">{cls.name}</span>
                          <div className="text-sm text-muted-foreground">
                            Klasse {cls.grade} • {cls.expectedStudentCount} Schüler
                            {cls.sourceClass && ` • von ${cls.sourceClass}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Archived Classes */}
                  {previewResult.preview.archivedClasses.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Archivierte Klassen (Abschluss)</h4>
                      <div className="space-y-2">
                        {previewResult.preview.archivedClasses.map((cls, index) => (
                          <div key={index} className="flex justify-between items-center p-2 border rounded bg-orange-50 dark:bg-orange-950/30">
                            <span className="font-medium">{cls.name}</span>
                            <div className="text-sm text-muted-foreground">
                              {cls.studentCount} Schüler graduiert
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Assignment Migrations */}
                  {previewResult.preview.migratedAssignments.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Zuweisungs-Migration</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {previewResult.preview.migratedAssignments.map((assignment, index) => (
                          <div key={index} className={`flex justify-between items-center p-2 border rounded ${
                            assignment.status === 'auto' ? 'bg-green-50 dark:bg-green-950/30' :
                            assignment.status === 'manual_check' ? 'bg-yellow-50 dark:bg-yellow-950/30' :
                            'bg-gray-50 dark:bg-gray-950/30'
                          }`}>
                            <div>
                              <span className="font-medium">{assignment.teacherName}</span>
                              <span className="text-sm text-muted-foreground ml-2">{assignment.subject}</span>
                            </div>
                            <div className="text-sm text-right">
                              <div>{assignment.fromClass} → {assignment.toClass}</div>
                              <Badge variant="light" className="text-xs">
                                {assignment.status === 'auto' ? 'Automatisch' :
                                 assignment.status === 'manual_check' ? 'Manuell prüfen' :
                                 'Übersprungen'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Wichtiger Hinweis:</strong> Nach der Ausführung können diese Änderungen nicht mehr rückgängig gemacht werden.
                      Stellen Sie sicher, dass alle Informationen korrekt sind.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => setCurrentStep("preparation")}
                      data-testid="button-back-preparation"
                    >
                      Zurück zur Vorbereitung
                    </Button>
                    <Button 
                      onClick={() => executeMutation.mutate()}
                      disabled={executeMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                      data-testid="button-execute-transition"
                    >
                      {executeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Schuljahreswechsel wird ausgeführt...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Schuljahreswechsel jetzt ausführen
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {currentStep === "completed" && transitionResult && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Schuljahreswechsel abgeschlossen
                  </CardTitle>
                  <CardDescription>
                    Der Übergang zu {nextSchoolYearName} wurde erfolgreich durchgeführt
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {transitionResult.success ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{transitionResult.statistics.classesCreated}</div>
                          <div className="text-xs text-muted-foreground">Klassen erstellt</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">{transitionResult.statistics.assignmentsMigrated}</div>
                          <div className="text-xs text-muted-foreground">Zuweisungen migriert</div>
                        </div>
                        <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">{transitionResult.statistics.studentsArchived}</div>
                          <div className="text-xs text-muted-foreground">Schüler archiviert</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">{transitionResult.statistics.studentsMigrated}</div>
                          <div className="text-xs text-muted-foreground">Schüler migriert</div>
                        </div>
                      </div>
                      
                      {transitionResult.warnings && transitionResult.warnings.length > 0 && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Warnungen beim Übergang:</strong>
                            <ul className="mt-2 list-disc list-inside space-y-1">
                              {transitionResult.warnings.map((warning, index) => (
                                <li key={index} className="text-sm">{warning}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      <Alert className="border-green-200 bg-green-50 dark:bg-green-950/30">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription>
                          <strong>Schuljahreswechsel erfolgreich abgeschlossen!</strong><br />
                          Das System ist jetzt für das Schuljahr {nextSchoolYearName} konfiguriert.
                          Sie können mit der Verwaltung des neuen Schuljahres beginnen.
                        </AlertDescription>
                      </Alert>
                    </>
                  ) : (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Schuljahreswechsel fehlgeschlagen!</strong>
                        {transitionResult.errors && (
                          <ul className="mt-2 list-disc list-inside space-y-1">
                            {transitionResult.errors.map((error, index) => (
                              <li key={index} className="text-sm">{error}</li>
                            ))}
                          </ul>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="flex gap-3">
                    <Button 
                      onClick={() => {
                        setCurrentStep("overview");
                        setValidationResult(null);
                        setPreviewResult(null);
                        setTransitionResult(null);
                      }}
                      className="w-full"
                      data-testid="button-return-overview"
                    >
                      Zurück zur Übersicht
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          </div>
        </div>
      </main>
    </div>
  );
}