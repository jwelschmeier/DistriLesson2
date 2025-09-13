import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, Save } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

interface LehrerplanstellenState {
  schulname: string;
  schuljahr: string;
  schuelerzahlen: { [jahrgang: number]: number };
  klassen: { [jahrgang: number]: number };
  fachstunden: { [fach: string]: { sek1: number; sek2: number } };
  deputat: number;
}

export default function Planstellberechnung() {
  const [isCalculating, setIsCalculating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State für Lehrerplanstellen-Eingabe
  const [planstellenData, setPlanstellenData] = useState<LehrerplanstellenState>({
    schulname: '',
    schuljahr: '2024/2025',
    schuelerzahlen: {},
    klassen: {},
    fachstunden: {},
    deputat: 25
  });
  
  // Berechnungen
  const gesamtSchueler = Object.values(planstellenData.schuelerzahlen).reduce((sum, val) => sum + (val || 0), 0);
  const gesamtKlassen = Object.values(planstellenData.klassen).reduce((sum, val) => sum + (val || 0), 0);
  const gesamtStundenSek1 = Object.values(planstellenData.fachstunden).reduce((sum, fach) => sum + (fach.sek1 || 0), 0);
  const gesamtStundenSek2 = Object.values(planstellenData.fachstunden).reduce((sum, fach) => sum + (fach.sek2 || 0), 0);
  const gesamtStunden = gesamtStundenSek1 + gesamtStundenSek2;
  const berechneteplanstellen = planstellenData.deputat > 0 ? Number((gesamtStunden / planstellenData.deputat).toFixed(2)) : 0;
  
  // Update-Funktionen
  const updateSchuelerzahl = (jahrgang: number, wert: number) => {
    setPlanstellenData(prev => ({
      ...prev,
      schuelerzahlen: { ...prev.schuelerzahlen, [jahrgang]: wert }
    }));
  };
  
  const updateKlassen = (jahrgang: number, wert: number) => {
    setPlanstellenData(prev => ({
      ...prev,
      klassen: { ...prev.klassen, [jahrgang]: wert }
    }));
  };
  
  const updateFachstunden = (fach: string, typ: 'sek1' | 'sek2', wert: number) => {
    setPlanstellenData(prev => ({
      ...prev,
      fachstunden: {
        ...prev.fachstunden,
        [fach]: {
          sek1: typ === 'sek1' ? wert : prev.fachstunden[fach]?.sek1 || 0,
          sek2: typ === 'sek2' ? wert : prev.fachstunden[fach]?.sek2 || 0
        }
      }
    }));
  };
  
  const updateDeputat = (wert: number) => {
    setPlanstellenData(prev => ({ ...prev, deputat: wert }));
  };
  
  const berechneSchnittKlassengroesse = (jahrgang: number): string => {
    const schueler = planstellenData.schuelerzahlen[jahrgang] || 0;
    const klassen = planstellenData.klassen[jahrgang] || 0;
    return klassen > 0 ? (schueler / klassen).toFixed(1) : '0';
  };
  
  const berechneFachGesamtstunden = (fach: string): number => {
    const stundenData = planstellenData.fachstunden[fach];
    return stundenData ? (stundenData.sek1 || 0) + (stundenData.sek2 || 0) : 0;
  };

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

          {/* Lehrerplanstellen Eingabemaske */}
          <Card data-testid="card-lehrerplanstellen">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Lehrerplanstellen-Eingabe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Stammdaten */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="schulname">Schulname</Label>
                    <Input 
                      id="schulname" 
                      placeholder="z.B. Gymnasium Musterstadt"
                      value={planstellenData.schulname}
                      onChange={(e) => setPlanstellenData(prev => ({ ...prev, schulname: e.target.value }))}
                      data-testid="input-schulname"
                    />
                  </div>
                  <div>
                    <Label htmlFor="schuljahr">Schuljahr</Label>
                    <Input 
                      id="schuljahr" 
                      placeholder="z.B. 2024/2025"
                      value={planstellenData.schuljahr}
                      onChange={(e) => setPlanstellenData(prev => ({ ...prev, schuljahr: e.target.value }))}
                      data-testid="input-schuljahr"
                    />
                  </div>
                </div>

                {/* Schülerzahlen und Klassen */}
                <div>
                  <h4 className="font-semibold mb-3">Schülerzahlen nach Jahrgangsstufen</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Jahrgangsstufe</TableHead>
                        <TableHead>Schülerzahl</TableHead>
                        <TableHead>Klassen</TableHead>
                        <TableHead>Ø Schüler/Klasse</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[5, 6, 7, 8, 9, 10, 11, 12, 13].map((jahrgang) => (
                        <TableRow key={jahrgang}>
                          <TableCell className="font-medium">{jahrgang}</TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              placeholder="0"
                              value={planstellenData.schuelerzahlen[jahrgang]?.toString() || ''}
                              onChange={(e) => updateSchuelerzahl(jahrgang, Number(e.target.value) || 0)}
                              className="w-20"
                              data-testid={`input-schueler-${jahrgang}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              placeholder="0"
                              value={planstellenData.klassen[jahrgang]?.toString() || ''}
                              onChange={(e) => updateKlassen(jahrgang, Number(e.target.value) || 0)}
                              className="w-20"
                              data-testid={`input-klassen-${jahrgang}`}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{berechneSchnittKlassengroesse(jahrgang)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell>Gesamt</TableCell>
                        <TableCell>{gesamtSchueler}</TableCell>
                        <TableCell>{gesamtKlassen}</TableCell>
                        <TableCell>{gesamtKlassen > 0 ? (gesamtSchueler / gesamtKlassen).toFixed(1) : '0'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Unterrichtsstunden */}
                <div>
                  <h4 className="font-semibold mb-3">Unterrichtsstunden nach Fächern</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fach</TableHead>
                        <TableHead>Wochenstunden Sek I</TableHead>
                        <TableHead>Wochenstunden Sek II</TableHead>
                        <TableHead>Gesamt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        'Deutsch', 'Mathematik', 'Englisch', 'Französisch', 'Latein',
                        'Geschichte', 'Erdkunde', 'Politik', 'Biologie', 'Chemie', 
                        'Physik', 'Musik', 'Kunst', 'Sport', 'Religion/Ethik'
                      ].map((fach) => (
                        <TableRow key={fach}>
                          <TableCell className="font-medium">{fach}</TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              placeholder="0"
                              value={planstellenData.fachstunden[fach]?.sek1?.toString() || ''}
                              onChange={(e) => updateFachstunden(fach, 'sek1', Number(e.target.value) || 0)}
                              className="w-20"
                              data-testid={`input-sek1-${fach.toLowerCase()}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              placeholder="0"
                              value={planstellenData.fachstunden[fach]?.sek2?.toString() || ''}
                              onChange={(e) => updateFachstunden(fach, 'sek2', Number(e.target.value) || 0)}
                              className="w-20"
                              data-testid={`input-sek2-${fach.toLowerCase()}`}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{berechneFachGesamtstunden(fach)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell>Gesamtstunden</TableCell>
                        <TableCell>{gesamtStundenSek1}</TableCell>
                        <TableCell>{gesamtStundenSek2}</TableCell>
                        <TableCell>{gesamtStunden}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Planstellenberechnung */}
                <div>
                  <h4 className="font-semibold mb-3">Planstellenberechnung</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <Label className="text-sm font-medium">Gesamtstunden pro Woche</Label>
                      <div className="text-2xl font-bold text-blue-600">{gesamtStunden}</div>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <Label className="text-sm font-medium">Deputatsstunden pro Lehrer</Label>
                      <Input 
                        type="number" 
                        placeholder="25" 
                        value={planstellenData.deputat}
                        onChange={(e) => updateDeputat(Number(e.target.value) || 0)}
                        className="mt-1"
                        data-testid="input-deputat"
                      />
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                      <Label className="text-sm font-medium">Berechnete Planstellen</Label>
                      <div className="text-2xl font-bold text-purple-600">{berechneteplanstellen}</div>
                    </div>
                  </div>
                </div>

                {/* Speichern Button */}
                <div className="flex justify-end">
                  <Button data-testid="button-save">
                    <Save className="h-4 w-4 mr-2" />
                    Berechnung speichern
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

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
