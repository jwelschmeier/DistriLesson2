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
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
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
            <Badge variant="outline" className="text-sm" data-testid="badge-current-year">
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
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>In Entwicklung:</strong> Die vollständige Schuljahreswechsel-Funktionalität wird derzeit implementiert.
                    Diese Seite zeigt eine Vorschau der geplanten Features.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Geplante Funktionen:</h3>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-medium">Klassen-Migration</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Automatischer Übergang der Klassen (5a → 6a, etc.)
                      </p>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span className="font-medium">Zuweisungs-Migration</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Intelligente Übertragung von Lehrer-Zuweisungen
                      </p>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        <span className="font-medium">Graduierung</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Archivierung von Abschlussklassen (10. Klassen)
                      </p>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="font-medium">Neue Eingangsklassen</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Erstellung neuer 5. Klassen für das neue Schuljahr
                      </p>
                    </div>
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
                  <Button disabled data-testid="button-continue-preparation">
                    Weiter (In Entwicklung)
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}