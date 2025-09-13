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
  
  // State für alle Planstellen-Eingabefelder - 1:1 Excel-Struktur aus hochgeladener Datei
  const [planstellenData, setPlanstellenData] = useState<PlanstellenInput>({
    schulname: '',
    schuljahr: '2024/2025',
    
    // 1. Grundstellen (F3-F10, echte Excel-Bezeichnungen)
    schuelerzahlStand: 710, // F3: "Schülerzahl Stand 31.08.24"
    schuelerLehrerrelation: 20.19, // F4: "Schüler/Lehrerrelation an der Realschule: (ab 06/18)"
    abzugLehramtsanwaerter: -0.5, // F8: "bedarfsdeckender Unterricht - Abzug Lehramtsanwärter"
    rundung: -0.21, // F9: "Rundung"
    
    // Ausgleichsbedarf (F12-F26, echte Excel-Bezeichnungen)
    fachleiter: 0.21, // F12: "Fachleiter"
    personalrat: 1.64, // F13: "Personalrat"  
    schulleitungsentlastungFortbildung: 0.04, // F14: "Schulleitungsentlastung - Fortbildung"
    ausbauLeitungszeit: 0.15, // F15: "Ausbau Leitungszeit"
    rueckgabeVorgriffstunde: 0.04, // F16: "Rückgabe Vorgriffstunde"
    digitalisierungsbeauftragter: 0.04, // F17: "Digitalisierungsbeauftragter"
    fortbildungQualifMedienDS: 0.07, // F18: "Fortb. und Qualif. / Medien und DS"
    fachberaterSchulaufsicht: 0.07, // F19: "Fachberater Schulaufsicht"
    wechselndeAusgleichsbedarfe: 0.5, // F20: "Wechs. Merh - und Ausgleichsbedarfe"
    praxissemesterInSchule: 0.29, // F21: "Praxissemester in Schule"
    zusaetzlicheAusfallvertretung: 0.25, // F22: "Zusätzliche Ausfallvertretung"
    entlastungLehrertaetigkeit: 0.04, // F23: "Entlastung Lehrertätigkeit"
    entlastungLVOCO: 0.04, // F24: "Entlastung LVO&CO"
    ermaessigungenweitere: 0.3, // F25: "Ermäßigungen weitere"
    nullWert: 0, // F26: "0"
    
    // Weitere Bereiche (F30-F32, aus Excel-Struktur)
    bestellungsverfahren: 0, // F30: aus Excel-Struktur
    praktischePaedagogikLehrkraefte: 0, // F31: aus Excel-Struktur
    praxissemesterdurchfuehrung: 0.91, // F32: aus Excel-Struktur
    
    // Weitere Abschnitte (F36, F38, etc.)
    entlassungenGradVerkuerzung: 0, // F36: "Entlassungen/Grad. (Verkürzung)"
    stellenreserveLehrerinnen: 0.36, // F38: "Stellenreserve LehrerInnen"
    
    // CRITICAL: Initialize all "Weitere Bereiche" fields required for weitereBereiche calculation
    praktischePhilosophieIslamkunde: 0, // Required for weitereBereiche calculation
    paedagogischeUebermittagsbetreuung: 0, // Required for weitereBereiche calculation
    integrationDurchBildung: 0, // Required for weitereBereiche calculation
    gegenUnterrichtsausfallIndFoerderung: 0, // Required for weitereBereiche calculation
    teilzeitBlockmodellAnsparphase: 0, // Required for weitereBereiche calculation
    
    // Sonstige Felder (falls in Excel vorhanden, aber nicht in ersten 50 Zeilen gefunden)
    ausfeldLehrkraefte: 0,
    innerSonderregAustech: 0,
    ergaenzendUeberAufbaumoeglichkeit: 0,
    stellenreserveLehrerinnenHS: 0,
    fertigkeitsfeld: 0,
    stundenreserve: 0,
    
    // Standard-Deputat für Berechnung (Excel verwendet 28 für Stundenumrechnung)
    deputat: 28
  });

  // Berechnete Felder basierend auf echten Excel-Formeln - EXACT BACKEND SYNC
  const berechneteWerte = {
    // F5: =F3/F4 - Quotient (35.16592372)
    quotient: planstellenData.schuelerzahlStand / planstellenData.schuelerLehrerrelation,
    
    // F6: =TRUNC(F5,2) - Quotient abgeschnitten (35.16)
    quotientAbgeschnitten: Math.trunc((planstellenData.schuelerzahlStand / planstellenData.schuelerLehrerrelation) * 100) / 100,
    
    // F7: =IF(F5-INT(F5)<0.5,INT(F5),INT(F5)+0.5) - Abgerundet (35)
    abgerundet: (() => {
      const quotient = planstellenData.schuelerzahlStand / planstellenData.schuelerLehrerrelation;
      const intPart = Math.floor(quotient);
      return (quotient - intPart < 0.5) ? intPart : intPart + 0.5;
    })(),
    
    // F10: =SUM(F6,F8:F9) - Summe Grundbedarf
    summeGrundbedarf: (() => {
      const quotientAbgeschnitten = Math.trunc((planstellenData.schuelerzahlStand / planstellenData.schuelerLehrerrelation) * 100) / 100;
      return quotientAbgeschnitten + planstellenData.abzugLehramtsanwaerter + planstellenData.rundung;
    })(),
    
    // F27: =SUM(F12:F25) - Summe Ausgleichsbedarf
    summeAusgleichsbedarf: planstellenData.fachleiter + 
                          planstellenData.personalrat + 
                          planstellenData.schulleitungsentlastungFortbildung + 
                          planstellenData.ausbauLeitungszeit + 
                          planstellenData.rueckgabeVorgriffstunde + 
                          planstellenData.digitalisierungsbeauftragter + 
                          planstellenData.fortbildungQualifMedienDS + 
                          planstellenData.fachberaterSchulaufsicht + 
                          planstellenData.wechselndeAusgleichsbedarfe + 
                          planstellenData.praxissemesterInSchule + 
                          planstellenData.zusaetzlicheAusfallvertretung + 
                          planstellenData.entlastungLehrertaetigkeit + 
                          planstellenData.entlastungLVOCO + 
                          planstellenData.ermaessigungenweitere,
    
    // =SUMME weitere Bereiche - Weitere Planstellen (FIXED: NaN-safe calculation)
    weitereBereiche: (planstellenData.praktischePhilosophieIslamkunde ?? 0) +
                    (planstellenData.paedagogischeUebermittagsbetreuung ?? 0) + 
                    (planstellenData.integrationDurchBildung ?? 0) +
                    (planstellenData.gegenUnterrichtsausfallIndFoerderung ?? 0) +
                    (planstellenData.teilzeitBlockmodellAnsparphase ?? 0) +
                    (planstellenData.bestellungsverfahren ?? 0) + 
                    (planstellenData.praktischePaedagogikLehrkraefte ?? 0) + 
                    (planstellenData.praxissemesterdurchfuehrung ?? 0) + 
                    (planstellenData.entlassungenGradVerkuerzung ?? 0) + 
                    (planstellenData.stellenreserveLehrerinnen ?? 0),
                       
    // Gesamtsumme aller Planstellen
    gesamtPlanstellen: 0 // Wird unten berechnet
  };

  // Gesamtberechnung - alle Bereiche zusammen (CORRECTED CALCULATION)
  berechneteWerte.gesamtPlanstellen = berechneteWerte.summeGrundbedarf + 
                                     berechneteWerte.summeAusgleichsbedarf + 
                                     berechneteWerte.weitereBereiche;

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
            step="0.01"
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
                      
                      {/* 1. GRUNDSTELLEN (F3-F10, echte Excel-Bezeichnungen) */}
                      <tr className="bg-blue-100 border-b border-gray-300">
                        <td colSpan={2} className="px-4 py-2 font-bold text-center border-gray-400">
                          1. GRUNDSTELLEN
                        </td>
                      </tr>
                      {createInputField("Schülerzahl Stand 31.08.24", "schuelerzahlStand", false, "bg-yellow-100")}
                      {createInputField("Schüler/Lehrerrelation an der Realschule: (ab 06/18)", "schuelerLehrerrelation", false, "bg-yellow-100")}
                      
                      {/* Berechnete Felder */}
                      {createCalculatedField("Quotient", berechneteWerte.quotient, "F3/F4", "bg-cyan-200")}
                      {createCalculatedField("Quotient abgeschnitten", berechneteWerte.quotientAbgeschnitten, "TRUNC(F5,2)", "bg-cyan-200")}
                      {createCalculatedField("Abgerundet", berechneteWerte.abgerundet, "IF(F5-INT(F5)<0.5,INT(F5),INT(F5)+0.5)", "bg-cyan-200")}
                      
                      {createInputField("bedarfsdeckender Unterricht - Abzug Lehramtsanwärter", "abzugLehramtsanwaerter", false, "bg-yellow-100")}
                      {createInputField("Rundung", "rundung", false, "bg-yellow-100")}
                      
                      {/* Summe Grundbedarf */}
                      {createCalculatedField("Summe Grundbedarf", berechneteWerte.summeGrundbedarf, "SUM(F6,F8:F9)", "bg-green-200")}
                      
                      {/* AUSGLEICHSBEDARF (F12-F26, echte Excel-Bezeichnungen) */}
                      <tr className="bg-blue-100 border-b border-gray-300">
                        <td colSpan={2} className="px-4 py-2 font-bold text-center border-gray-400">
                          AUSGLEICHSBEDARF
                        </td>
                      </tr>
                      {createInputField("Fachleiter", "fachleiter", false, "bg-yellow-100")}
                      {createInputField("Personalrat", "personalrat", false, "bg-yellow-100")}
                      {createInputField("Schulleitungsentlastung - Fortbildung", "schulleitungsentlastungFortbildung", false, "bg-yellow-100")}
                      {createInputField("Ausbau Leitungszeit", "ausbauLeitungszeit", false, "bg-yellow-100")}
                      {createInputField("Rückgabe Vorgriffstunde", "rueckgabeVorgriffstunde", false, "bg-yellow-100")}
                      {createInputField("Digitalisierungsbeauftragter", "digitalisierungsbeauftragter", false, "bg-yellow-100")}
                      {createInputField("Fortb. und Qualif. / Medien und DS", "fortbildungQualifMedienDS", false, "bg-yellow-100")}
                      {createInputField("Fachberater Schulaufsicht", "fachberaterSchulaufsicht", false, "bg-yellow-100")}
                      {createInputField("Wechs. Merh - und Ausgleichsbedarfe", "wechselndeAusgleichsbedarfe", false, "bg-yellow-100")}
                      {createInputField("Praxissemester in Schule", "praxissemesterInSchule", false, "bg-yellow-100")}
                      {createInputField("Zusätzliche Ausfallvertretung", "zusaetzlicheAusfallvertretung", false, "bg-yellow-100")}
                      {createInputField("Entlastung Lehrertätigkeit", "entlastungLehrertaetigkeit", false, "bg-yellow-100")}
                      {createInputField("Entlastung LVO&CO", "entlastungLVOCO", false, "bg-yellow-100")}
                      {createInputField("Ermäßigungen weitere", "ermaessigungenweitere", false, "bg-yellow-100")}
                      {createInputField("0", "nullWert", false, "bg-gray-100")}
                      
                      {/* Summe Ausgleichsbedarf */}
                      {createCalculatedField("Summe Ausgleichsbedarf", berechneteWerte.summeAusgleichsbedarf, "SUM(F12:F25)", "bg-green-200")}
                      
                      {/* WEITERE BEREICHE */}
                      <tr className="bg-blue-100 border-b border-gray-300">
                        <td colSpan={2} className="px-4 py-2 font-bold text-center border-gray-400">
                          WEITERE BEREICHE (F30-F38 Excel-Struktur)
                        </td>
                      </tr>
                      {/* Excel F30-F38 Fields with exact labels */}
                      {createInputField("Praktische Philosophie /Islamkunde", "praktischePhilosophieIslamkunde", false, "bg-yellow-100")}
                      {createInputField("Pädagogische Übermittagsbetreuung", "paedagogischeUebermittagsbetreuung", false, "bg-yellow-100")}
                      {createInputField("Integration durch Bildung", "integrationDurchBildung", false, "bg-yellow-100")}
                      {createInputField("Entlassungen/Grad. (Verkürzung)", "entlassungenGradVerkuerzung", false, "bg-yellow-100")}
                      {createInputField("gegen U-Ausfall und für ind. Förderung", "gegenUnterrichtsausfallIndFoerderung", false, "bg-yellow-100")}
                      {createInputField("Stellenreserve LehrerInnen", "stellenreserveLehrerinnen", false, "bg-yellow-100")}
                      {createInputField("Teilzeit im Blockmodell (Ansparphase)", "teilzeitBlockmodellAnsparphase", false, "bg-yellow-100")}
                      
                      {/* Legacy fields for backward compatibility */}
                      <tr className="bg-gray-200 border-b border-gray-300">
                        <td colSpan={2} className="px-4 py-2 font-medium text-center text-sm border-gray-400">
                          Legacy Felder (Abwärtskompatibilität)
                        </td>
                      </tr>
                      {createInputField("Bestellungsverfahren (Legacy)", "bestellungsverfahren", false, "bg-gray-100")}
                      {createInputField("Praktische Pädagogik Lehrkräfte (Legacy)", "praktischePaedagogikLehrkraefte", false, "bg-gray-100")}
                      {createInputField("Praxissemesterdurchführung (Legacy)", "praxissemesterdurchfuehrung", false, "bg-gray-100")}
                      
                      {/* Berechnetes Feld: Weitere Bereiche (CORRECTED NAME) */}
                      {createCalculatedField(
                        "Weitere Bereiche Summe",
                        berechneteWerte.weitereBereiche,
                        "SUMME(Weitere Bereiche)"
                      )}
                      
                      {/* Zusätzliche optionale Felder aus Excel-Struktur */}
                      
                      {/* Berechnetes Feld: Gesamtsumme aller Planstellen */}
                      {createCalculatedField(
                        "Gesamtsumme Planstellen",
                        berechneteWerte.gesamtPlanstellen,
                        "Grundbedarf + Ausgleichsbedarf + Weitere Bereiche"
                      )}
                      
                      {/* Standard-Deputat für Stundenumrechnung */}
                      {/* Optional administrative fields */}
                      {createInputField("Fertigkeitsfeld", "fertigkeitsfeld", false, "bg-gray-100")}
                      {createInputField("Stundenreserve", "stundenreserve", false, "bg-gray-100")}
                      
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