import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Calculator } from 'lucide-react'
import type { PlanstellenInput } from '@shared/schema'

export default function PlanstellberechnungPage() {
  // State für erweiterte Tabelle - OHNE dritte Spalte
  const [planstellenData, setPlanstellenData] = useState<PlanstellenInput>({
    schulname: "Realschule Musterstadt",
    schuljahr: "2024/25",
    schuelerzahlStand: 710,           // F3: Eingabe
    schuelerLehrerrelation: 20.19,    // F4: Eingabe
    abzugLehramtsanwaerter: -0.5,     // F8: Eingabe
    rundung: -0.21,                   // F9: Eingabe
    
    // Ausgleichsbedarf F12-F26 aus Excel
    fachleiter: 0.21,
    personalrat: 1.64,
    schulleitungsentlastungFortbildung: 0.04,
    ausbauLeitungszeit: 0.15,
    rueckgabeVorgriffstunde: 0.04,
    digitalisierungsbeauftragter: 0.04,
    fortbildungQualifMedienDS: 0.07,
    fachberaterSchulaufsicht: 0.07,
    wechselndeAusgleichsbedarfe: 0.5,
    praxissemesterInSchule: 0.29,
    zusaetzlicheAusfallvertretung: 0.25,
    entlastungLehrertaetigkeit: 0.04,
    entlastungLVOCO: 0.04,
    ermaessigungenweitere: 0.3,
    nullWert: 0,
    
    // Weitere Bereiche
    praktischePhilosophieIslamkunde: 0,
    paedagogischeUebermittagsbetreuung: 0,
    integrationDurchBildung: 0,
    
    // Freie Zeilen
    freieZeile1Label: "",
    freieZeile1Wert: 0,
    freieZeile2Label: "",
    freieZeile2Wert: 0,
    
    // === NEUE ABSCHNITTE AUS EXCEL (Zeile 35+) ===
    // Zusätzliche Stellen
    gegenUAusfallIndFoerderung: 0.77,
    
    // Stellenbesetzung  
    teilzeitBlockmodellAnsparphase: 0.36,
    kapitalisierungPaedUebermittag: 0.56,
    abzugKapitalisierungUebermittag: -0.56,
    
    // Personalausstattung
    beurlaubungElternzeit: 0,
    ersatzeinstellungElternzeit: 0,
    aborungZugangAnderes: 0,
    
    // Ermäßigungsstunden-Berechnung
    grundstellenbedarfFaktor: 0.5
  })

  // === EXAKTE EXCEL-BERECHNUNGEN MIT VALIDIERUNG ===
  
  // Validation: Check for division by zero
  const isValidForCalculation = planstellenData.schuelerLehrerrelation > 0
  
  // F5: "Quotient der zwei Größen:" = F3/F4 (with validation)
  const quotient = isValidForCalculation ? planstellenData.schuelerzahlStand / planstellenData.schuelerLehrerrelation : 0
  
  // F6: "Quotient der zwei Größen nach der 2. Dezimale abgeschnitten" = TRUNC(F5,2)
  const quotientAbgeschnitten = isValidForCalculation ? Math.trunc(quotient * 100) / 100 : 0
  
  // F7: "abgerundet auf halbe bzw. ganze Dezimale:" = IF(F5-INT(F5)<0.5,INT(F5),INT(F5)+0.5)
  const dezimalTeil = quotient - Math.floor(quotient)
  const abgerundet = isValidForCalculation ? (dezimalTeil < 0.5 ? Math.floor(quotient) : Math.floor(quotient) + 0.5) : 0
  
  // F10: "Summe Grundbedarf" = SUM(F6,F8:F9)
  const summeGrundbedarf = quotientAbgeschnitten + planstellenData.abzugLehramtsanwaerter + planstellenData.rundung

  // === AUSGLEICHSBEDARF SUMME ===
  const summeAusgleichsbedarf = (planstellenData.fachleiter || 0) +
                               (planstellenData.personalrat || 0) +
                               (planstellenData.schulleitungsentlastungFortbildung || 0) +
                               (planstellenData.ausbauLeitungszeit || 0) +
                               (planstellenData.rueckgabeVorgriffstunde || 0) +
                               (planstellenData.digitalisierungsbeauftragter || 0) +
                               (planstellenData.fortbildungQualifMedienDS || 0) +
                               (planstellenData.fachberaterSchulaufsicht || 0) +
                               (planstellenData.wechselndeAusgleichsbedarfe || 0) +
                               (planstellenData.praxissemesterInSchule || 0) +
                               (planstellenData.zusaetzlicheAusfallvertretung || 0) +
                               (planstellenData.entlastungLehrertaetigkeit || 0) +
                               (planstellenData.entlastungLVOCO || 0) +
                               (planstellenData.ermaessigungenweitere || 0) +
                               (planstellenData.nullWert || 0)

  // === WEITERE BEREICHE SUMME ===
  const summeWeitereBereiche = (planstellenData.praktischePhilosophieIslamkunde || 0) +
                              (planstellenData.paedagogischeUebermittagsbetreuung || 0) +
                              (planstellenData.integrationDurchBildung || 0) +
                              (planstellenData.freieZeile1Wert || 0) +
                              (planstellenData.freieZeile2Wert || 0)

  // === NEUE SUMMEN FÜR ZUSÄTZLICHE EXCEL-ABSCHNITTE ===
  // F36: Zusätzliche Stellen
  const summeZusaetzlicheStellen = planstellenData.gegenUAusfallIndFoerderung || 0
  
  // F41: Stellenbesetzung = SUM(F38:F40)  
  const summeStellenbesetzung = (planstellenData.teilzeitBlockmodellAnsparphase || 0) +
                               (planstellenData.kapitalisierungPaedUebermittag || 0) +
                               (planstellenData.abzugKapitalisierungUebermittag || 0)
  
  // F47: Personalausstattung = SUM(F44:F46)
  const summePersonalausstattung = (planstellenData.beurlaubungElternzeit || 0) +
                                  (planstellenData.ersatzeinstellungElternzeit || 0) +
                                  (planstellenData.aborungZugangAnderes || 0)
  
  // F34: Grundbedarf (Summe aus Grundbedarf, Ausgleichsbedarf, Mehrbedarf) = SUM(F33+F28+F10)
  const grundbedarfGesamt = summeGrundbedarf + summeAusgleichsbedarf + summeWeitereBereiche
  
  // F48: Stellenbedarf (Stellen-Soll) insgesamt = SUM(F34,F41,F47)
  const stellenbedarfGesamt = grundbedarfGesamt + summeStellenbesetzung + summePersonalausstattung

  const handleInputChange = (field: keyof PlanstellenInput, value: string | number) => {
    setPlanstellenData(prev => ({
      ...prev,
      [field]: field === 'schulname' || field === 'schuljahr' || field === 'freieZeile1Label' || field === 'freieZeile2Label'
        ? value // Keep strings as strings
        : typeof value === 'string' ? parseFloat(value) || 0 : value // Parse only numeric fields
    }))
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Planstellenberechnung - Vollständige Excel-Struktur</h1>
      </div>

      {/* Grunddaten */}
      <Card>
        <CardHeader>
          <CardTitle>Grunddaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Schulname</Label>
              <Input
                value={planstellenData.schulname}
                onChange={(e) => handleInputChange('schulname', e.target.value)}
                data-testid="input-schulname"
              />
            </div>
            <div className="space-y-2">
              <Label>Schuljahr</Label>
              <Input
                value={planstellenData.schuljahr}
                onChange={(e) => handleInputChange('schuljahr', e.target.value)}
                data-testid="input-schuljahr"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* VOLLSTÄNDIGE PLANSTELLENTABELLE - 2 SPALTEN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planstellenberechnung - 1:1 Excel Struktur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Tabellen-Header */}
          <div className="grid grid-cols-2 gap-4 items-center font-bold text-sm bg-gray-100 p-4 rounded-lg">
            <Label className="text-center">Bezeichnung</Label>
            <Label className="text-center">Wert</Label>
          </div>

          <div className="space-y-3">
            
            {/* === 1. GRUNDBEDARF === */}
            <div className="bg-blue-50 p-2 rounded-lg">
              <h3 className="font-bold text-center">1. Grundbedarf</h3>
            </div>

            {/* F3: Schülerzahl Stand 31.08.24 (EINGABE) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Schülerzahl Stand 31.08.24</Label>
              <Input
                type="number"
                step="1"
                value={planstellenData.schuelerzahlStand}
                onChange={(e) => handleInputChange('schuelerzahlStand', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-schuelerzahl"
              />
            </div>

            {/* F4: Schüler/Lehrerrelation an der Realschule: (ab 06/18) (EINGABE) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Schüler/Lehrerrelation an der Realschule: (ab 06/18)</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.schuelerLehrerrelation}
                onChange={(e) => handleInputChange('schuelerLehrerrelation', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-schuelerrelation"
              />
            </div>

            <Separator />

            {/* F5: Quotient der zwei Größen: (BERECHNET) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm font-medium">Quotient der zwei Größen:</Label>
              <div className={`p-2 border rounded text-right font-mono ${isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-300'}`} data-testid="display-f5">
                {isValidForCalculation ? quotient.toFixed(8) : 'Division durch 0'}
              </div>
            </div>

            {/* F6: Quotient abgeschnitten nach 2. Dezimalstelle (BERECHNET) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm font-medium">Quotient nach der 2. Dezimale abgeschnitten</Label>
              <div className={`p-2 border rounded text-right font-mono ${isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-300'}`} data-testid="display-f6">
                {isValidForCalculation ? quotientAbgeschnitten.toFixed(2) : '0.00'}
              </div>
            </div>

            {/* F7: abgerundet auf halbe bzw. ganze Dezimale (BERECHNET) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm font-medium">abgerundet auf halbe bzw. ganze Dezimale:</Label>
              <div className={`p-2 border rounded text-right font-mono ${isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-300'}`} data-testid="display-f7">
                {isValidForCalculation ? abgerundet.toFixed(1) : '0.0'}
              </div>
            </div>

            <Separator />

            {/* F8: bedarfsdeckender Unterricht - Abzug Lehramtsanwärter (EINGABE) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">bedarfsdeckender Unterricht - Abzug Lehramtsanwärter</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.abzugLehramtsanwaerter}
                onChange={(e) => handleInputChange('abzugLehramtsanwaerter', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-abzug-lehramtsanwaerter"
              />
            </div>

            {/* F9: Rundung (EINGABE) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Rundung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.rundung}
                onChange={(e) => handleInputChange('rundung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-rundung"
              />
            </div>

            <Separator className="border-t-2" />

            {/* F10: Summe Grundbedarf (BERECHNET) */}
            <div className="grid grid-cols-2 gap-4 items-center bg-green-50 p-4 rounded-lg border-2 border-green-300">
              <Label className="text-sm font-bold">Summe Grundbedarf</Label>
              <div className="p-3 bg-green-100 border border-green-400 rounded text-right font-mono text-lg font-bold" data-testid="display-f10">
                {summeGrundbedarf.toFixed(2)}
              </div>
            </div>

            {/* === AUSGLEICHSBEDARF === */}
            <div className="bg-orange-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Ausgleichsbedarf</h3>
            </div>

            {/* F12: Fachleiter */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Fachleiter</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.fachleiter || 0}
                onChange={(e) => handleInputChange('fachleiter', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-fachleiter"
              />
            </div>

            {/* F13: Personalrat */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Personalrat</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.personalrat || 0}
                onChange={(e) => handleInputChange('personalrat', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-personalrat"
              />
            </div>

            {/* F14: Schulleitungsentlastung - Fortbildung */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Schulleitungsentlastung - Fortbildung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.schulleitungsentlastungFortbildung || 0}
                onChange={(e) => handleInputChange('schulleitungsentlastungFortbildung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-schulleitungsentlastung"
              />
            </div>

            {/* F15: Ausbau Leitungszeit */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Ausbau Leitungszeit</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.ausbauLeitungszeit || 0}
                onChange={(e) => handleInputChange('ausbauLeitungszeit', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-ausbau-leitungszeit"
              />
            </div>

            {/* F16: Rückgabe Vorgriffstunde */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Rückgabe Vorgriffstunde</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.rueckgabeVorgriffstunde || 0}
                onChange={(e) => handleInputChange('rueckgabeVorgriffstunde', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-rueckgabe-vorgriffstunde"
              />
            </div>

            {/* F17: Digitalisierungsbeauftragter */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Digitalisierungsbeauftragter</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.digitalisierungsbeauftragter || 0}
                onChange={(e) => handleInputChange('digitalisierungsbeauftragter', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-digitalisierungsbeauftragter"
              />
            </div>

            {/* F18: Fortb. und Qualif. / Medien und DS */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Fortb. und Qualif. / Medien und DS</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.fortbildungQualifMedienDS || 0}
                onChange={(e) => handleInputChange('fortbildungQualifMedienDS', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-fortbildung-qualif"
              />
            </div>

            {/* F19: Fachberater Schulaufsicht */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Fachberater Schulaufsicht</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.fachberaterSchulaufsicht || 0}
                onChange={(e) => handleInputChange('fachberaterSchulaufsicht', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-fachberater-schulaufsicht"
              />
            </div>

            {/* F20: Wechs. Merh - und Ausgleichsbedarfe */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Wechs. Merh - und Ausgleichsbedarfe</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.wechselndeAusgleichsbedarfe || 0}
                onChange={(e) => handleInputChange('wechselndeAusgleichsbedarfe', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-wechselnde-ausgleichsbedarfe"
              />
            </div>

            {/* F21: Praxissemester in Schule */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Praxissemester in Schule</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.praxissemesterInSchule || 0}
                onChange={(e) => handleInputChange('praxissemesterInSchule', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-praxissemester-schule"
              />
            </div>

            {/* F22: Zusätzliche Ausfallvertretung */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Zusätzliche Ausfallvertretung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.zusaetzlicheAusfallvertretung || 0}
                onChange={(e) => handleInputChange('zusaetzlicheAusfallvertretung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-zusaetzliche-ausfallvertretung"
              />
            </div>

            {/* F23: Entlastung Lehrertätigkeit */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Entlastung Lehrertätigkeit</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.entlastungLehrertaetigkeit || 0}
                onChange={(e) => handleInputChange('entlastungLehrertaetigkeit', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-entlastung-lehrertaetigkeit"
              />
            </div>

            {/* F24: Entlastung LVO&CO */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Entlastung LVO&CO</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.entlastungLVOCO || 0}
                onChange={(e) => handleInputChange('entlastungLVOCO', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-entlastung-lvoco"
              />
            </div>

            {/* F25: Ermäßigungen weitere */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Ermäßigungen weitere</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.ermaessigungenweitere || 0}
                onChange={(e) => handleInputChange('ermaessigungenweitere', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-ermaessigungen-weitere"
              />
            </div>

            {/* F26: 0 */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">0</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.nullWert || 0}
                onChange={(e) => handleInputChange('nullWert', parseFloat(e.target.value))}
                className="bg-gray-50 border-gray-300"
                data-testid="input-null-wert"
              />
            </div>

            {/* === FREIE EINGABEZEILEN (VOR SUMME) === */}
            <div className="bg-gray-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Freie Eingabezeilen</h3>
            </div>

            {/* Freie Zeile 1 */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Input
                type="text"
                value={planstellenData.freieZeile1Label || ""}
                onChange={(e) => handleInputChange('freieZeile1Label', e.target.value)}
                className="bg-gray-100 border-gray-300"
                placeholder="Bezeichnung eingeben..."
                data-testid="input-freie-zeile1-label"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.freieZeile1Wert || 0}
                onChange={(e) => handleInputChange('freieZeile1Wert', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-freie-zeile1-wert"
              />
            </div>

            {/* Freie Zeile 2 */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Input
                type="text"
                value={planstellenData.freieZeile2Label || ""}
                onChange={(e) => handleInputChange('freieZeile2Label', e.target.value)}
                className="bg-gray-100 border-gray-300"
                placeholder="Bezeichnung eingeben..."
                data-testid="input-freie-zeile2-label"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.freieZeile2Wert || 0}
                onChange={(e) => handleInputChange('freieZeile2Wert', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-freie-zeile2-wert"
              />
            </div>

            <Separator className="border-t-2" />

            {/* Summe Ausgleichsbedarf (BERECHNET) */}
            <div className="grid grid-cols-2 gap-4 items-center bg-orange-50 p-4 rounded-lg border-2 border-orange-300">
              <Label className="text-sm font-bold">Summe Ausgleichsbedarf</Label>
              <div className="p-3 bg-orange-100 border border-orange-400 rounded text-right font-mono text-lg font-bold" data-testid="display-summe-ausgleichsbedarf">
                {summeAusgleichsbedarf.toFixed(2)}
              </div>
            </div>

            {/* === MEHRBEDARFE (umbenannt von "Weitere Bereiche") === */}
            <div className="bg-purple-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Mehrbedarfe</h3>
            </div>

            {/* Praktische Philosophie /Islamkunde */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Praktische Philosophie /Islamkunde</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.praktischePhilosophieIslamkunde || 0}
                onChange={(e) => handleInputChange('praktischePhilosophieIslamkunde', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-praktische-philosophie"
              />
            </div>

            {/* Pädagogische Übermittagsbetreuung */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Pädagogische Übermittagsbetreuung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.paedagogischeUebermittagsbetreuung || 0}
                onChange={(e) => handleInputChange('paedagogischeUebermittagsbetreuung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-paedagogische-betreuung"
              />
            </div>

            {/* Integration durch Bildung */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Integration durch Bildung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.integrationDurchBildung || 0}
                onChange={(e) => handleInputChange('integrationDurchBildung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-integration-bildung"
              />
            </div>

            <Separator className="border-t-2" />

            {/* SUMME MEHRBEDARFE (umbenannt) */}
            <div className="grid grid-cols-2 gap-4 items-center bg-purple-50 p-4 rounded-lg border-2 border-purple-300">
              <Label className="text-sm font-bold">Summe Mehrbedarfe</Label>
              <div className="p-3 bg-purple-100 border border-purple-400 rounded text-right font-mono text-lg font-bold" data-testid="display-summe-weitere">
                {summeWeitereBereiche.toFixed(2)}
              </div>
            </div>

            <Separator className="border-t-4" />

            {/* GRUNDBEDARF GESAMT F34 */}
            <div className="grid grid-cols-2 gap-4 items-center bg-red-50 p-4 rounded-lg border-2 border-red-300">
              <Label className="text-sm font-bold">Grundbedarf (Summe aus Grundbedarf, Ausgleichsbedarf, Mehrbedarf)</Label>
              <div className="p-3 bg-red-100 border border-red-400 rounded text-right font-mono text-lg font-bold" data-testid="display-grundbedarf-gesamt">
                {grundbedarfGesamt.toFixed(2)}
              </div>
            </div>

            {/* === ZUSÄTZLICHE STELLEN === */}
            <div className="bg-teal-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Zusätzliche Stellen</h3>
            </div>

            {/* gegen U-Ausfall und für ind. Förderung */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">gegen U-Ausfall und für ind. Förderung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.gegenUAusfallIndFoerderung || 0}
                onChange={(e) => handleInputChange('gegenUAusfallIndFoerderung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-gegen-ausfall-foerderung"
              />
            </div>

            {/* === STELLENBESETZUNG === */}
            <div className="bg-cyan-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Stellenbesetzung</h3>
            </div>

            {/* Teilzeit im Blockmodell (Ansparphase) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Teilzeit im Blockmodell (Ansparphase)</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.teilzeitBlockmodellAnsparphase || 0}
                onChange={(e) => handleInputChange('teilzeitBlockmodellAnsparphase', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-teilzeit-blockmodell"
              />
            </div>

            {/* Kapitalisierung päd. Übermittagsbetreuung */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Kapitalisierung päd. Übermittagsbetreuung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.kapitalisierungPaedUebermittag || 0}
                onChange={(e) => handleInputChange('kapitalisierungPaedUebermittag', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-kapitalisierung-uebermittag"
              />
            </div>

            {/* Abzug der Kapitalisierung der Übermittagsbetreuung, da Geld an die Gemeinde geht */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Abzug Kapitalisierung (Geld an Gemeinde)</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.abzugKapitalisierungUebermittag || 0}
                onChange={(e) => handleInputChange('abzugKapitalisierungUebermittag', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-abzug-kapitalisierung"
              />
            </div>

            <Separator className="border-t-2" />

            {/* SUMME STELLENBESETZUNG F41 */}
            <div className="grid grid-cols-2 gap-4 items-center bg-cyan-50 p-4 rounded-lg border-2 border-cyan-300">
              <Label className="text-sm font-bold">Summe Stellenbesetzung</Label>
              <div className="p-3 bg-cyan-100 border border-cyan-400 rounded text-right font-mono text-lg font-bold" data-testid="display-summe-stellenbesetzung">
                {summeStellenbesetzung.toFixed(2)}
              </div>
            </div>

            {/* === PERSONALAUSSTATTUNG === */}
            <div className="bg-indigo-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Personalausstattung</h3>
            </div>

            {/* Beurlaubung o. L Elternzeit */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Beurlaubung o. L Elternzeit</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.beurlaubungElternzeit || 0}
                onChange={(e) => handleInputChange('beurlaubungElternzeit', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-beurlaubung-elternzeit"
              />
            </div>

            {/* Ersatzeinstellung Elternzeit */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Ersatzeinstellung Elternzeit</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.ersatzeinstellungElternzeit || 0}
                onChange={(e) => handleInputChange('ersatzeinstellungElternzeit', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-ersatzeinstellung-elternzeit"
              />
            </div>

            {/* Abornung Zugang (anderes Kapitel) */}
            <div className="grid grid-cols-2 gap-4 items-center">
              <Label className="text-sm">Abornung Zugang (anderes Kapitel)</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.aborungZugangAnderes || 0}
                onChange={(e) => handleInputChange('aborungZugangAnderes', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-abornung-zugang"
              />
            </div>

            <Separator className="border-t-2" />

            {/* SUMME PERSONALAUSSTATTUNG F47 */}
            <div className="grid grid-cols-2 gap-4 items-center bg-indigo-50 p-4 rounded-lg border-2 border-indigo-300">
              <Label className="text-sm font-bold">Summe Personalausstattung</Label>
              <div className="p-3 bg-indigo-100 border border-indigo-400 rounded text-right font-mono text-lg font-bold" data-testid="display-summe-personalausstattung">
                {summePersonalausstattung.toFixed(2)}
              </div>
            </div>

            <Separator className="border-t-4" />

            {/* STELLENBEDARF (STELLEN-SOLL) INSGESAMT F48 */}
            <div className="grid grid-cols-2 gap-4 items-center bg-red-50 p-4 rounded-lg border-2 border-red-300 mt-6">
              <Label className="text-sm font-bold text-lg">Stellenbedarf (Stellen-Soll) insgesamt</Label>
              <div className="p-4 bg-red-100 border border-red-400 rounded text-right font-mono text-xl font-bold" data-testid="display-stellenbedarf-gesamt">
                {stellenbedarfGesamt.toFixed(2)}
              </div>
            </div>

          </div>

        </CardContent>
      </Card>

      {/* Excel-Formel-Referenz */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="text-sm text-gray-700">Excel-Formeln (Referenz)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-gray-600 space-y-1">
          <div><strong>Grundbedarf:</strong></div>
          <div>F5: = F3/F4 ({planstellenData.schuelerzahlStand} / {planstellenData.schuelerLehrerrelation})</div>
          <div>F6: = TRUNC(F5, 2)</div>
          <div>F7: = IF(F5-INT(F5)&lt;0.5, INT(F5), INT(F5)+0.5)</div>
          <div>F10: = SUM(F6, F8:F9)</div>
          <div><strong>Weitere Summen:</strong></div>
          <div>Summe Ausgleichsbedarf: = SUM(F12:F26)</div>
          <div>F34: = SUM(F10 + Ausgleichsbedarf + Mehrbedarfe)</div>
          <div>F41: = SUM(F38:F40) [Stellenbesetzung]</div>
          <div>F47: = SUM(F44:F46) [Personalausstattung]</div>
          <div>F48: = SUM(F34,F41,F47) [Stellenbedarf insgesamt]</div>
        </CardContent>
      </Card>

    </div>
  )
}