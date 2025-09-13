import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Save, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { PlanstellenInput } from "@shared/schema";

interface PlanstelleData {
  id: string;
  subjectId: string;
  subjectName: string;
  requiredHours: number;
  availableHours: number;
  deficit: number;
}

interface CalculateResponse {
  calculated?: number;
  planstellen?: PlanstelleData[];
}

interface SaveResponse {
  calculated?: number;
  planstellen?: PlanstelleData[];
}

export default function Planstellberechnung() {
  const [isCalculating, setIsCalculating] = useState(false);
  const [previewPlanstellen, setPreviewPlanstellen] = useState<PlanstelleData[] | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State für alle Planstellen-Eingabefelder basierend auf dem Excel-Layout
  const [planstellenData, setPlanstellenData] = useState<PlanstellenInput>({
    schulname: '',
    schuljahr: '2024/2025',
    
    // Grundschuldaten (erste gelbe Sektion)
    ausgleichsstunden: 0,
    fachlehrbr: 0,
    paedagogik: 0,
    religionslehrkraefteFortbildung: 0,
    auslandLehrkraefte: 0,
    rueckgabeVerguetungsstunde: 0,
    bestellung: 0,
    fachUndDienstMedienUndDV: 0,
    fachberaterSchulaufsicht: 0,
    weitereSportUndAusstellungsraeume: 0,
    praxissemesterInSchule: 0,
    zusaetzlicheAusfallvertretung: 0,
    entlastungLehrertaetigkeit: 0,
    entlastungLVOCO: 0,
    ermaessigungenweitere: 0,
    
    // Abzugsarten (zweite gelbe Sektion)
    abzugsarten: 0,
    praktischePaedagogikLehrkraefte: 0,
    praxissemesterdurchfuehrung: 0,
    unterscheidendeBetreuung: 0,
    
    // Weitere Sektionen
    verfuegbarePlanstellenSollstaerkestunden: "LehrersollGEHS19",
    berechnungsbedarfLehramt: 0,
    ergaenzungsstundenLehramt: 0,
    schwerpunktbildungLehramt: 0,
    berufsbildungLehramt: 0,
    ergaenzungsstundenLehramt2: 0,
    schwerpunktbildungLehramt2: 0,
    
    // Weitere komplexe Felder
    entlassungenGrad: 0,
    stellenreserveLehrerinnen: 0,
    ausfeldLehrkraefte: 0,
    innerSonderregAustech: 0,
    ergaenzendUeberAufbaumoeglichkeit: 0,
    stellenreserveLehrerinnenHS: 0,
    fertigkeitsfeld: 17.0,
    stundenreserve: 0,
    differenzNachSchulsausstattungsrecherche: 0,
    stellenwerteUnterrichtsstunden: 0,
    alternGrundstaffelungVerschiedeneUnterrichtsstunden: 0,
    differenzNachWechsel: 0,
    stellenwerteNachObenVerrechnung: 0,
    
    deputat: 25
  });

  // Berechnete Felder basierend auf Excel-Formeln
  const berechneteWerte = {
    // =SUMME(F3:F18+F10) - Grundbedarf
    grundbedarf: planstellenData.ausgleichsstunden + 
                planstellenData.fachlehrbr + 
                planstellenData.paedagogik + 
                planstellenData.religionslehrkraefteFortbildung + 
                planstellenData.auslandLehrkraefte + 
                planstellenData.rueckgabeVerguetungsstunde + 
                planstellenData.bestellung + 
                planstellenData.fachUndDienstMedienUndDV + 
                planstellenData.fachberaterSchulaufsicht + 
                planstellenData.weitereSportUndAusstellungsraeume + 
                planstellenData.praxissemesterInSchule + 
                planstellenData.zusaetzlicheAusfallvertretung + 
                planstellenData.entlastungLehrertaetigkeit + 
                planstellenData.entlastungLVOCO + 
                planstellenData.ermaessigungenweitere + 
                planstellenData.fachberaterSchulaufsicht, // F10 doppelt gezählt wie in Excel
    
    // =SUMME(F21:F26) - Berufsbildung a. L (Lehramt)
    berufsbildungSumme: planstellenData.abzugsarten + 
                       planstellenData.praktischePaedagogikLehrkraefte + 
                       planstellenData.praxissemesterdurchfuehrung + 
                       planstellenData.unterscheidendeBetreuung + 
                       planstellenData.berufsbildungLehramt + 
                       planstellenData.ergaenzungsstundenLehramt2,
                       
    // =SUMME(F3:F40) - Summe Personalbestellung
    personalbestellungSumme: 0 // Wird später berechnet mit allen Feldern F3 bis F40
  };

  // Weitere berechnete Werte
  berechneteWerte.personalbestellungSumme = berechneteWerte.grundbedarf + berechneteWerte.berufsbildungSumme +
    planstellenData.schwerpunktbildungLehramt + planstellenData.berechnungsbedarfLehramt + 
    planstellenData.entlassungenGrad + planstellenData.stellenreserveLehrerinnen;

  // Lade existierende Planstellen
  const { data: planstellen } = useQuery<PlanstelleData[]>({
    queryKey: ["/api/planstellen"],
  });

  // Anzeige-Logik: Zeige Preview wenn vorhanden, sonst geladene Daten
  const displayPlanstellen = previewPlanstellen || planstellen;

  // Berechnung der Planstellen
  const calculatePlanstellen = useMutation<CalculateResponse, Error, PlanstellenInput>({
    mutationFn: async (data: PlanstellenInput) => {
      const response = await fetch("/api/calculate-planstellen", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error('Berechnung fehlgeschlagen');
      return response.json();
    },
    onMutate: () => {
      setIsCalculating(true);
    },
    onSuccess: (data) => {
      // Set preview data for display
      if (data.planstellen) {
        const previewData = data.planstellen.map((p: any) => ({
          id: p.id,
          subjectId: p.subjectId || '',
          subjectName: p.subjectName || 'Unbekannt',
          requiredHours: parseFloat(p.requiredHours) || 0,
          availableHours: parseFloat(p.availableHours) || 0,
          deficit: parseFloat(p.deficit) || 0,
        }));
        setPreviewPlanstellen(previewData);
      }
      
      toast({
        title: "Berechnung abgeschlossen",
        description: `${data.calculated || data.planstellen?.length || 0} Planstellen erfolgreich berechnet.`,
      });
      setIsCalculating(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler bei der Berechnung",
        description: error.message || "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
      setIsCalculating(false);
    }
  });

  // Speichern der Planstellen
  const savePlanstellen = useMutation<SaveResponse, Error, PlanstellenInput>({
    mutationFn: async (data: PlanstellenInput) => {
      const response = await fetch("/api/planstellen/save", {
        method: "POST", 
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error('Speichern fehlgeschlagen');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Planstellen gespeichert",
        description: `Eingabe gespeichert und ${data.calculated || data.planstellen?.length || 0} Planstellen berechnet.`,
      });
      setPreviewPlanstellen(null); // Clear preview after saving
      queryClient.invalidateQueries({ queryKey: ["/api/planstellen"] });
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Speichern",
        description: error.message || "Planstellen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  });

  // Hilfsfunktion für Eingabefelder
  const createInputField = (
    label: string,
    field: keyof PlanstellenInput,
    isString = false,
    bgColor = "bg-yellow-100"
  ) => (
    <tr className={`${bgColor} border-b border-gray-300`}>
      <td className="px-4 py-2 border-r border-gray-400 font-medium text-sm">
        {label}
      </td>
      <td className="px-4 py-2">
        {isString ? (
          <Input
            type="text"
            value={planstellenData[field] as string || ''}
            onChange={(e) => setPlanstellenData(prev => ({ ...prev, [field]: e.target.value }))}
            className="h-8 border-0 bg-transparent"
            data-testid={`input-${field}`}
          />
        ) : (
          <Input
            type="number"
            step="0.1"
            min="0"
            value={planstellenData[field] as number || 0}
            onChange={(e) => setPlanstellenData(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
            className="h-8 border-0 bg-transparent"
            data-testid={`input-${field}`}
          />
        )}
      </td>
    </tr>
  );

  // Hilfsfunktion für berechnete Felder
  const createCalculatedField = (label: string, value: number, formula = "", bgColor = "bg-cyan-200") => (
    <tr className={`${bgColor} border-b border-gray-300`}>
      <td className="px-4 py-2 border-r border-gray-400 font-medium text-sm">
        {label}
      </td>
      <td className="px-4 py-2 font-mono">
        {formula ? `=${formula}` : value.toFixed(1)}
      </td>
    </tr>
  );

  const totalRequired = Number(displayPlanstellen?.reduce((sum: number, p: PlanstelleData) => sum + Number(p.requiredHours || 0), 0) || 0);
  const totalAvailable = Number(displayPlanstellen?.reduce((sum: number, p: PlanstelleData) => sum + Number(p.availableHours || 0), 0) || 0);
  const totalDeficit = totalAvailable - totalRequired;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-card border-b px-6 py-4">
          <h1 className="text-2xl font-bold text-foreground">Planstellenberechnung</h1>
          <p className="text-muted-foreground">Direkte Eingabe der Planstellendaten</p>
        </div>
        
        <div className="flex-1 p-6 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Eingabe-Formular (Excel-Layout) */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Planstellendaten-Eingabe
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Grunddaten */}
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="schulname">Schulname</Label>
                      <Input
                        id="schulname"
                        value={planstellenData.schulname}
                        onChange={(e) => setPlanstellenData(prev => ({ ...prev, schulname: e.target.value }))}
                        placeholder="Name der Schule"
                        data-testid="input-schulname"
                      />
                    </div>
                    <div>
                      <Label htmlFor="schuljahr">Schuljahr</Label>
                      <Input
                        id="schuljahr"
                        value={planstellenData.schuljahr}
                        onChange={(e) => setPlanstellenData(prev => ({ ...prev, schuljahr: e.target.value }))}
                        placeholder="2024/2025"
                        data-testid="input-schuljahr"
                      />
                    </div>
                  </div>
                </div>

                {/* Excel-Table Layout */}
                <div className="border border-gray-400 rounded-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {/* Header */}
                      <tr className="bg-gray-200 border-b border-gray-400">
                        <th className="px-4 py-2 text-left border-r border-gray-400 font-semibold">Bezeichnung</th>
                        <th className="px-4 py-2 text-left font-semibold">Wert</th>
                      </tr>
                      
                      {/* Grundschuldaten (gelbe Sektion) */}
                      {createInputField("Ausgleichsstunden", "ausgleichsstunden")}
                      {createInputField("Fachlehrbr", "fachlehrbr")}
                      {createInputField("Pädagogik", "paedagogik")}
                      {createInputField("Religionslehrkräfte/- Fortbildung", "religionslehrkraefteFortbildung")}
                      {createInputField("Ausland Lehrkräfte", "auslandLehrkraefte")}
                      {createInputField("Rückgabe Vergütungsstunde", "rueckgabeVerguetungsstunde")}
                      {createInputField("Bestellung", "bestellung")}
                      {createInputField("Fach- und Dienst-/Medien und DV", "fachUndDienstMedienUndDV")}
                      {createInputField("Fachberater Schulaufsicht", "fachberaterSchulaufsicht")}
                      {createInputField("Weitere Sport- und Ausstellungsräume", "weitereSportUndAusstellungsraeume")}
                      {createInputField("Praxissemester in Schule", "praxissemesterInSchule")}
                      {createInputField("Zusätzliche Ausfallvertretung", "zusaetzlicheAusfallvertretung")}
                      {createInputField("Entlastung Lehrertätigkeit", "entlastungLehrertaetigkeit")}
                      {createInputField("Entlastung LVO&CO", "entlastungLVOCO")}
                      {createInputField("Ermäßigungen weitere", "ermaessigungenweitere")}
                      
                      {/* Berechnetes Feld: Grundbedarf */}
                      {createCalculatedField(
                        "Grundbedarf (Summen aus Grundbedarf, Ausgleichsstunden)",
                        berechneteWerte.grundbedarf,
                        "SUMME(F3:F18+F10)"
                      )}
                      
                      {/* Abzugsarten (gelbe Sektion) */}
                      {createInputField("Abzugsarten", "abzugsarten")}
                      {createInputField("Praktische Pädagogik Lehrkräfte", "praktischePaedagogikLehrkraefte")}
                      {createInputField("Praxissemesterdurchführung", "praxissemesterdurchfuehrung")}
                      {createInputField("Unterscheidende Betreuung", "unterscheidendeBetreuung")}
                      
                      {/* Berechnetes Feld: Berufsbildung */}
                      {createCalculatedField(
                        "Berufsbildung a. L (Lehramt)",
                        berechneteWerte.berufsbildungSumme,
                        "SUMME(F21:F26)"
                      )}
                      
                      {/* Weitere Sektionen (lila/weiße Felder) */}
                      {createInputField(
                        "Verfügbare Planstellen (Sollstärkestunden)",
                        "verfuegbarePlanstellenSollstaerkestunden",
                        true,
                        "bg-purple-100"
                      )}
                      {createInputField("Berechnungsbedarf z. L (Lehramt)", "berechnungsbedarfLehramt", false, "bg-purple-100")}
                      {createInputField("Ergänzungsstunden Lehramt", "ergaenzungsstundenLehramt", false, "bg-purple-100")}
                      {createInputField("Schwerpunktbildung Lehramt", "schwerpunktbildungLehramt", false, "bg-purple-100")}
                      
                      {/* Berechnetes Feld: Summe Personalbestellung */}
                      {createCalculatedField(
                        "Summe Personalbestellung",
                        berechneteWerte.personalbestellungSumme,
                        "SUMME(F3:F40)"
                      )}
                      
                      {/* Weitere komplexe Felder */}
                      {createInputField("Entlassungen/Grad. (Verkürzung)", "entlassungenGrad", false, "bg-gray-100")}
                      {createInputField("Stellenreserve LehrerInnen", "stellenreserveLehrerinnen", false, "bg-gray-100")}
                      {createInputField("Ausfeld Lehrkräfte", "ausfeldLehrkraefte", false, "bg-gray-100")}
                      {createInputField("Inner-(d. Sonderreg/austech)", "innerSonderregAustech", false, "bg-gray-100")}
                      {createInputField("Ergänzend über Aufbaumöglichkeit", "ergaenzendUeberAufbaumoeglichkeit", false, "bg-gray-100")}
                      {createInputField("Stellenreserve LehrerInnen(HS)", "stellenreserveLehrerinnenHS", false, "bg-gray-100")}
                      {createInputField("Fertigkeitsfeld", "fertigkeitsfeld", false, "bg-gray-100")}
                      {createInputField("Stundenreserve", "stundenreserve", false, "bg-gray-100")}
                      {createInputField("Differenz nach Schulsausstattungsrecherche", "differenzNachSchulsausstattungsrecherche", false, "bg-gray-100")}
                      {createInputField("Stellenwerte Unterrichtsstunden", "stellenwerteUnterrichtsstunden", false, "bg-gray-100")}
                      {createInputField("Altern Grundstaffelung verschiedene Unterrichtsstunden", "alternGrundstaffelungVerschiedeneUnterrichtsstunden", false, "bg-gray-100")}
                      {createInputField("Differenz nach Wechsel", "differenzNachWechsel", false, "bg-gray-100")}
                      {createInputField("Stellenwerte nach (oben Verrechnung)", "stellenwerteNachObenVerrechnung", false, "bg-gray-100")}
                      
                      {/* Deputat */}
                      {createInputField("Deputat", "deputat", false, "bg-blue-100")}
                    </tbody>
                  </table>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <Button
                    onClick={() => calculatePlanstellen.mutate(planstellenData)}
                    disabled={isCalculating || !planstellenData.schulname}
                    className="flex-1"
                    data-testid="button-calculate"
                  >
                    <Calculator className="w-4 h-4 mr-2" />
                    {isCalculating ? "Berechne..." : "Berechnen"}
                  </Button>
                  
                  <Button
                    onClick={() => savePlanstellen.mutate(planstellenData)}
                    disabled={savePlanstellen.isPending || !planstellenData.schulname}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-save"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {savePlanstellen.isPending ? "Speichere..." : "Speichern"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Ergebnisse */}
            <div className="space-y-6">
              {/* Preview-Banner */}
              {previewPlanstellen && (
                <Alert className="border-blue-200 bg-blue-50" data-testid="preview-alert">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Vorschau-Modus:</strong> Diese Berechnung wurde noch nicht gespeichert. 
                    Klicken Sie auf "Speichern", um die Daten zu übernehmen.
                  </AlertDescription>
                </Alert>
              )}

              {/* Zusammenfassung */}
              <Card>
                <CardHeader>
                  <CardTitle>Berechnungsergebnisse</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{totalRequired.toFixed(1)}</div>
                      <div className="text-sm text-blue-800">Benötigte Stunden</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{totalAvailable.toFixed(1)}</div>
                      <div className="text-sm text-green-800">Verfügbare Stunden</div>
                    </div>
                    <div className={`p-4 rounded-lg ${totalDeficit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                      <div className={`text-2xl font-bold ${totalDeficit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totalDeficit > 0 ? '+' : ''}{totalDeficit.toFixed(1)}
                      </div>
                      <div className={`text-sm ${totalDeficit >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                        {totalDeficit >= 0 ? 'Überschuss' : 'Defizit'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailtabelle - nur wenn Daten vorhanden */}
              {displayPlanstellen && Array.isArray(displayPlanstellen) && displayPlanstellen.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Detailübersicht Planstellen</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse bg-card">
                        <thead className="bg-muted">
                          <tr>
                            <th className="border border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                              Fach
                            </th>
                            <th className="border border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                              Bedarf (h)
                            </th>
                            <th className="border border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                              Verfügbar (h)
                            </th>
                            <th className="border border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                              Differenz
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {displayPlanstellen.map((planstelle: PlanstelleData) => {
                            const coverage = Number(planstelle.requiredHours || 0) > 0 ? 
                              (Number(planstelle.availableHours || 0) / Number(planstelle.requiredHours || 0)) * 100 : 100;
                            
                            return (
                              <tr key={planstelle.id} className="hover:bg-muted/50" data-testid={`row-planstelle-${planstelle.id}`}>
                                <td className="border border-border px-3 py-2 font-medium">
                                  {planstelle.subjectName}
                                </td>
                                <td className="border border-border px-3 py-2">
                                  {Number(planstelle.requiredHours || 0).toFixed(1)}
                                </td>
                                <td className="border border-border px-3 py-2">
                                  {Number(planstelle.availableHours || 0).toFixed(1)}
                                </td>
                                <td className="border border-border px-3 py-2">
                                  <span className={`font-medium ${Number(planstelle.deficit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {Number(planstelle.deficit || 0) > 0 ? '+' : ''}{Number(planstelle.deficit || 0).toFixed(1)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}