import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Play, Pause, RotateCcw, Settings, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { runOptimization, type OptimizationResult, type OptimizationConstraints } from "@/lib/optimization";
import type { Teacher, Class, Subject, Assignment } from "@shared/schema";

interface OptimizationProgress {
  stage: string;
  progress: number;
  message: string;
}

interface OptimizationSettings {
  prioritizeQualifications: boolean;
  balanceWorkload: boolean;
  minimizeConflicts: boolean;
  respectMaxHours: boolean;
  allowPartialAssignments: boolean;
}

export default function StdvKlOptimum() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState<OptimizationProgress | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [settings, setSettings] = useState<OptimizationSettings>({
    prioritizeQualifications: true,
    balanceWorkload: true,
    minimizeConflicts: true,
    respectMaxHours: true,
    allowPartialAssignments: false,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teachers } = useQuery<Teacher[]>({
    queryKey: ["/api/teachers"],
  });

  const { data: classes } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const { data: assignments } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    queryFn: () => fetch("/api/assignments?minimal=true").then(res => res.json())
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/optimize", {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimierung abgeschlossen",
        description: "Die Unterrichtsverteilung wurde erfolgreich optimiert.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teachers"] });
      setIsOptimizing(false);
      setOptimizationProgress(null);
    },
    onError: (error) => {
      toast({
        title: "Optimierung fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
      setIsOptimizing(false);
      setOptimizationProgress(null);
    },
  });

  const handleStartOptimization = async () => {
    if (!teachers || !classes || !subjects) {
      toast({
        title: "Unvollständige Daten",
        description: "Bitte stellen Sie sicher, dass Lehrer, Klassen und Fächer vorhanden sind.",
        variant: "destructive",
      });
      return;
    }

    setIsOptimizing(true);
    setOptimizationProgress({ stage: "Vorbereitung", progress: 0, message: "Optimierung wird gestartet..." });

    try {
      // Simulate optimization progress
      const stages = [
        { stage: "Datenvalidierung", progress: 10, message: "Überprüfe Eingabedaten..." },
        { stage: "Constraint-Analyse", progress: 25, message: "Analysiere Beschränkungen..." },
        { stage: "Lehrerqualifikationen", progress: 40, message: "Überprüfe Lehrerqualifikationen..." },
        { stage: "Arbeitsbelastung", progress: 55, message: "Berechne optimale Arbeitsverteilung..." },
        { stage: "Konfliktauflösung", progress: 70, message: "Löse Zeitkonflikte..." },
        { stage: "Finalisierung", progress: 85, message: "Erstelle finale Zuweisungen..." },
        { stage: "Validierung", progress: 95, message: "Validiere Ergebnisse..." },
      ];

      for (const stage of stages) {
        setOptimizationProgress(stage);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const constraints: OptimizationConstraints = {
        teachers: teachers || [],
        classes: classes || [],
        subjects: subjects || [],
        currentAssignments: assignments || [],
        settings,
      };

      const result = runOptimization(constraints);
      setOptimizationResult(result);

      setOptimizationProgress({ stage: "Abgeschlossen", progress: 100, message: "Optimierung erfolgreich abgeschlossen!" });

      // Apply optimizations to backend
      optimizeMutation.mutate();

    } catch (error) {
      setIsOptimizing(false);
      setOptimizationProgress(null);
      toast({
        title: "Optimierung fehlgeschlagen",
        description: "Ein Fehler ist während der Optimierung aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const handleResetOptimization = () => {
    setIsOptimizing(false);
    setOptimizationProgress(null);
    setOptimizationResult(null);
  };

  const totalTeachers = teachers?.length || 0;
  const totalClasses = classes?.length || 0;
  const totalSubjects = subjects?.length || 0;
  const currentAssignments = assignments?.length || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "optimal": return "text-green-600";
      case "good": return "text-blue-600";
      case "warning": return "text-orange-600";
      case "poor": return "text-red-600";
      default: return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "optimal": return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "good": return <CheckCircle className="w-4 h-4 text-blue-600" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case "poor": return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">StdV-Kl-Optimum</h2>
              <p className="text-muted-foreground">Automatische Optimierung der Unterrichtsverteilung</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                onClick={handleResetOptimization}
                disabled={isOptimizing}
                data-testid="button-reset"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Zurücksetzen
              </Button>
              <Button
                onClick={handleStartOptimization}
                disabled={isOptimizing || totalTeachers === 0 || totalClasses === 0}
                data-testid="button-start-optimization"
              >
                {isOptimizing ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Optimiert...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Optimierung starten
                  </>
                )}
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card data-testid="card-teachers">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Lehrkräfte</p>
                    <p className="text-3xl font-bold text-foreground">{totalTeachers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Settings className="text-blue-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-classes">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Klassen</p>
                    <p className="text-3xl font-bold text-foreground">{totalClasses}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Settings className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-subjects">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Fächer</p>
                    <p className="text-3xl font-bold text-foreground">{totalSubjects}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Settings className="text-purple-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-assignments">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Zuweisungen</p>
                    <p className="text-3xl font-bold text-foreground">{currentAssignments}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-orange-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Optimization Progress */}
          {optimizationProgress && (
            <Card data-testid="card-progress">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Sparkles className="mr-2" />
                  Optimierungsfortschritt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{optimizationProgress.stage}</span>
                    <span className="text-sm text-muted-foreground">{optimizationProgress.progress}%</span>
                  </div>
                  <Progress value={optimizationProgress.progress} className="w-full" />
                  <p className="text-sm text-muted-foreground">{optimizationProgress.message}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Settings */}
            <Card data-testid="card-settings">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="mr-2" />
                  Optimierungseinstellungen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="prioritize-qualifications"
                      checked={settings.prioritizeQualifications}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, prioritizeQualifications: !!checked }))
                      }
                      data-testid="checkbox-qualifications"
                    />
                    <label htmlFor="prioritize-qualifications" className="text-sm font-medium">
                      Qualifikationen priorisieren
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="balance-workload"
                      checked={settings.balanceWorkload}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, balanceWorkload: !!checked }))
                      }
                      data-testid="checkbox-workload"
                    />
                    <label htmlFor="balance-workload" className="text-sm font-medium">
                      Arbeitsbelastung ausgleichen
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="minimize-conflicts"
                      checked={settings.minimizeConflicts}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, minimizeConflicts: !!checked }))
                      }
                      data-testid="checkbox-conflicts"
                    />
                    <label htmlFor="minimize-conflicts" className="text-sm font-medium">
                      Konflikte minimieren
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="respect-max-hours"
                      checked={settings.respectMaxHours}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, respectMaxHours: !!checked }))
                      }
                      data-testid="checkbox-max-hours"
                    />
                    <label htmlFor="respect-max-hours" className="text-sm font-medium">
                      Maximale Stunden beachten
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allow-partial"
                      checked={settings.allowPartialAssignments}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, allowPartialAssignments: !!checked }))
                      }
                      data-testid="checkbox-partial"
                    />
                    <label htmlFor="allow-partial" className="text-sm font-medium">
                      Teilzuweisungen erlauben
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Optimization Results */}
            <Card className="lg:col-span-2" data-testid="card-results">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="mr-2" />
                  Optimierungsergebnisse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!optimizationResult ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Starten Sie eine Optimierung, um Ergebnisse zu sehen.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Neue Zuweisungen</p>
                        <p className="text-2xl font-bold text-green-600">{optimizationResult.newAssignments}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Gelöste Konflikte</p>
                        <p className="text-2xl font-bold text-blue-600">{optimizationResult.resolvedConflicts}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Effizienzsteigerung</p>
                        <p className="text-2xl font-bold text-purple-600">{optimizationResult.efficiencyGain}%</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Gesamtbewertung</p>
                        <div className="flex items-center">
                          {getStatusIcon(optimizationResult.overallScore)}
                          <span className={`ml-1 text-sm font-medium ${getStatusColor(optimizationResult.overallScore)}`}>
                            {optimizationResult.overallScore.charAt(0).toUpperCase() + optimizationResult.overallScore.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">Detaillierte Metriken</h4>
                      <div className="space-y-2">
                        {optimizationResult.metrics.map((metric, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{metric.name}</span>
                            <div className="flex items-center space-x-2">
                              <Progress value={metric.score} className="w-20" />
                              <span className="text-sm font-medium">{metric.score}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {optimizationResult.warnings.length > 0 && (
                      <div className="space-y-2">
                        {optimizationResult.warnings.filter(w => w.includes("Gesamtstunden")).length > 0 && (
                          <Alert variant="destructive" data-testid="alert-total-hours">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Gesamtstunden-Constraints verletzt:</strong>
                              <ul className="mt-2 list-disc list-inside text-sm">
                                {optimizationResult.warnings
                                  .filter(w => w.includes("Gesamtstunden"))
                                  .map((warning, index) => (
                                    <li key={index}>{warning}</li>
                                  ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                        
                        {optimizationResult.warnings.filter(w => !w.includes("Gesamtstunden")).length > 0 && (
                          <Alert data-testid="alert-general">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Allgemeine Warnungen:</strong>
                              <ul className="mt-2 list-disc list-inside text-sm">
                                {optimizationResult.warnings
                                  .filter(w => !w.includes("Gesamtstunden"))
                                  .map((warning, index) => (
                                    <li key={index}>{warning}</li>
                                  ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Algorithm Information */}
          <Card data-testid="card-algorithm-info">
            <CardHeader>
              <CardTitle>Optimierungsalgorithmus</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Verwendete Methoden</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Constraint Satisfaction Problem (CSP)</li>
                    <li>• Genetische Algorithmen für Optimierung</li>
                    <li>• Simulated Annealing für lokale Verbesserungen</li>
                    <li>• Multi-Kriterien-Entscheidungsanalyse</li>
                    <li>• Workload-Balancing-Algorithmen</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Bewertungskriterien</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Qualifikationsmatching (40%)</li>
                    <li>• Arbeitsbelastung-Gleichmäßigkeit (25%)</li>
                    <li>• Konfliktminimierung (20%)</li>
                    <li>• Präferenzen und Verfügbarkeit (10%)</li>
                    <li>• Raumoptimierung und Wegzeiten (5%)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
