import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Calculator, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import PDFTableUploader from "@/components/PDFTableUploader";

interface PlanstelleData {
  id: string;
  subjectId: string;
  subjectName: string;
  requiredHours: number;
  availableHours: number;
  deficit: number;
}

interface Subject {
  id: string;
  name: string;
  shortName: string;
  category: string;
}

export default function Planstellberechnung() {
  const [isCalculating, setIsCalculating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });

  const { data: planstellen, isLoading } = useQuery<PlanstelleData[]>({
    queryKey: ["/api/planstellen"],
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      setIsCalculating(true);
      // Simulate calculation time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await apiRequest("POST", "/api/calculate-planstellen", {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Berechnung abgeschlossen",
        description: "Planstellen wurden erfolgreich neu berechnet.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/planstellen"] });
      setIsCalculating(false);
    },
    onError: (error) => {
      toast({
        title: "Berechnung fehlgeschlagen",
        description: error.message,
        variant: "destructive",
      });
      setIsCalculating(false);
    },
  });

  const handleCalculate = () => {
    calculateMutation.mutate();
  };

  const getDeficitStatus = (deficit: number) => {
    if (deficit > 0) return "Überschuss";
    if (deficit < -2) return "Kritischer Mangel";
    if (deficit < 0) return "Mangel";
    return "Ausgeglichen";
  };

  const getDeficitColor = (deficit: number) => {
    if (deficit > 0) return "text-green-600";
    if (deficit < -2) return "text-red-600";
    if (deficit < 0) return "text-orange-600";
    return "text-green-600";
  };

  const getDeficitIcon = (deficit: number) => {
    if (deficit > 0) return <TrendingUp className="w-4 h-4" />;
    if (deficit < 0) return <TrendingDown className="w-4 h-4" />;
    return <TrendingUp className="w-4 h-4" />;
  };

  const totalRequired = Number(planstellen?.reduce((sum, p) => sum + Number(p.requiredHours || 0), 0) || 0);
  const totalAvailable = Number(planstellen?.reduce((sum, p) => sum + Number(p.availableHours || 0), 0) || 0);
  const totalDeficit = totalAvailable - totalRequired;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Planstellberechnung</h2>
              <p className="text-muted-foreground">Berechnung des Lehrstellenbedarfs nach Fächern</p>
            </div>
            <Button
              onClick={handleCalculate}
              disabled={isCalculating || calculateMutation.isPending}
              data-testid="button-calculate"
            >
              {isCalculating ? (
                "Berechne..."
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" />
                  Neu berechnen
                </>
              )}
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-required-positions">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Benötigte Stellen</p>
                    <p className="text-3xl font-bold text-foreground">{totalRequired.toFixed(1)}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calculator className="text-blue-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-available-positions">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">Verfügbare Stellen</p>
                    <p className="text-3xl font-bold text-foreground">{totalAvailable.toFixed(1)}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-deficit">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm font-medium">
                      {totalDeficit >= 0 ? "Überschuss" : "Fehlbedarf"}
                    </p>
                    <p className={`text-3xl font-bold ${getDeficitColor(totalDeficit)}`}>
                      {Math.abs(totalDeficit).toFixed(1)}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    totalDeficit >= 0 ? "bg-green-100" : "bg-red-100"
                  }`}>
                    {totalDeficit >= 0 ? (
                      <TrendingUp className="text-green-600 text-xl" />
                    ) : (
                      <TrendingDown className="text-red-600 text-xl" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Calculation Information */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Die Planstellberechnung basiert auf den aktuellen Schülerzahlen und den NRW-Stundentafeln. 
              Berücksichtigt werden auch Teilzeitlehrkräfte und besondere pädagogische Bedarfe.
            </AlertDescription>
          </Alert>

          {/* Detailed Breakdown */}
          <Card data-testid="card-subject-breakdown">
            <CardHeader>
              <CardTitle>Fachbezogene Aufschlüsselung</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Lade Planstellendaten...</div>
              ) : !planstellen || planstellen.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Planstellendaten vorhanden. Bitte führen Sie eine Berechnung durch.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Fach
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Benötigt
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Verfügbar
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Abdeckung
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Differenz
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {planstellen.map((planstelle) => {
                        const coverage = Number(planstelle.requiredHours || 0) > 0 ? 
                          (Number(planstelle.availableHours || 0) / Number(planstelle.requiredHours || 0)) * 100 : 100;
                        
                        return (
                          <tr key={planstelle.id} data-testid={`row-subject-${planstelle.subjectId}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-foreground">
                                {planstelle.subjectName}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {Number(planstelle.requiredHours || 0).toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {Number(planstelle.availableHours || 0).toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Progress value={Math.min(coverage, 100)} className="w-20 mr-2" />
                                <span className="text-sm text-muted-foreground">
                                  {coverage.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`flex items-center ${getDeficitColor(planstelle.deficit)}`}>
                                {getDeficitIcon(planstelle.deficit)}
                                <span className="ml-1 text-sm font-medium">
                                  {getDeficitStatus(planstelle.deficit)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`text-sm font-medium ${getDeficitColor(planstelle.deficit)}`}>
                                {Number(planstelle.deficit || 0) > 0 ? "+" : ""}{Number(planstelle.deficit || 0).toFixed(1)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PDF Upload Section */}
          <PDFTableUploader 
            onTableUpdate={(tables) => {
              console.log('PDF tables updated:', tables);
              // You can integrate the tables with the planstellen calculation here
            }}
          />

          {/* Methodology */}
          <Card data-testid="card-methodology">
            <CardHeader>
              <CardTitle>Berechnungsmethodik</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Berücksichtigte Faktoren</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Schülerzahlen nach Jahrgangsstufen</li>
                    <li>• NRW-Stundentafeln für Realschulen</li>
                    <li>• Klassengrößenrichtwerte</li>
                    <li>• Teilungsstunden für Fachpraxis</li>
                    <li>• Ergänzungsstunden und Förderangebote</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Besondere Regelungen</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Teilzeitlehrkräfte (anteilige Berechnung)</li>
                    <li>• Schwangerschafts- und Elternzeitvertretungen</li>
                    <li>• Sonderpädagogischer Förderbedarf</li>
                    <li>• Sprachförderung für Seiteneinsteiger</li>
                    <li>• AG-Angebote und Übermittagbetreuung</li>
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
