import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, AlertTriangle, CheckCircle, Calendar, Users, BookOpen, ArrowRight } from "lucide-react";

export default function Schuljahreswechsel() {
  const [currentStep, setCurrentStep] = useState<"overview" | "preparation" | "preview" | "execution">("overview");

  const currentSchoolYear = "2024/25";
  const nextSchoolYear = "2025/26";

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
                Automatischer Übergang von {currentSchoolYear} zu {nextSchoolYear}
              </p>
            </div>
            <Badge variant="outline" className="text-sm">
              Aktuell: {currentSchoolYear}
            </Badge>
          </div>

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
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-sm">Lehrerdaten</p>
                    <p className="text-xs text-muted-foreground">Vollständig</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-sm">Klassendaten</p>
                    <p className="text-xs text-muted-foreground">Aktuell</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-sm">Neue Klassen</p>
                    <p className="text-xs text-muted-foreground">Vorbereitung erforderlich</p>
                  </div>
                </div>
              </div>
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
                    Aktuelles Schuljahr {currentSchoolYear}
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
                    Übergang zu {nextSchoolYear}
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
                  Konfiguration der Übergangsparameter für {nextSchoolYear}
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