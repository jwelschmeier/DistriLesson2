import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Calculator } from 'lucide-react'
import type { PlanstellenInput } from '@shared/schema'

export default function PlanstellberechnungPage() {
  // State für erweiterte Tabelle mit Stundenanzahl Real Spalte
  const [planstellenData, setPlanstellenData] = useState<PlanstellenInput>({
    schulname: "Realschule Musterstadt",
    schuljahr: "2024/25",
    schuelerzahlStand: 710,           // F3: Eingabe
    schuelerLehrerrelation: 20.19,    // F4: Eingabe
    abzugLehramtsanwaerter: -0.5,     // F8: Eingabe
    rundung: -0.21,                   // F9: Eingabe
    
    // Stundenanzahl Real (neue dritte Spalte)
    stundenanzahlAbzugLehramtsanwaerter: -14,
    stundenanzahlRundung: -5.88,
    
    // Weitere Bereiche
    praktischePhilosophieIslamkunde: 0,
    stundenanzahlPraktischePhilosophie: 0,
    paedagogischeUebermittagsbetreuung: 0,
    stundenanzahlPaedagogischeUebermittagsbetreuung: 0,
    integrationDurchBildung: 0,
    stundenanzahlIntegrationDurchBildung: 0,
    
    // Freie Zeilen
    freieZeile1Label: "",
    freieZeile1Wert: 0,
    stundenanzahlFreieZeile1: 0,
    freieZeile2Label: "",
    freieZeile2Wert: 0,
    stundenanzahlFreieZeile2: 0
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

  // === STUNDENANZAHL REAL SUMME ===
  const summeStundenanzahlReal = (planstellenData.stundenanzahlAbzugLehramtsanwaerter || 0) +
                                (planstellenData.stundenanzahlRundung || 0) +
                                (planstellenData.stundenanzahlPraktischePhilosophie || 0) +
                                (planstellenData.stundenanzahlPaedagogischeUebermittagsbetreuung || 0) +
                                (planstellenData.stundenanzahlIntegrationDurchBildung || 0) +
                                (planstellenData.stundenanzahlFreieZeile1 || 0) +
                                (planstellenData.stundenanzahlFreieZeile2 || 0)

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
        <h1 className="text-2xl font-bold">Planstellenberechnung - Erweiterte Tabelle</h1>
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

      {/* ERWEITERTE PLANSTELLENTABELLE - 3 SPALTEN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Planstellenberechnung - Mit Stundenanzahl real</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Tabellen-Header */}
          <div className="grid grid-cols-3 gap-4 items-center font-bold text-sm bg-gray-100 p-4 rounded-lg">
            <Label className="text-center">Bezeichnung</Label>
            <Label className="text-center">Planstellen-Wert</Label>
            <Label className="text-center">Stundenanzahl real</Label>
          </div>

          <div className="space-y-3">
            
            {/* === 1. GRUNDBEDARF === */}
            <div className="bg-blue-50 p-2 rounded-lg">
              <h3 className="font-bold text-center">1. Grundbedarf</h3>
            </div>

            {/* F3: Schülerzahl Stand 31.08.24 (EINGABE) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">F3: Schülerzahl Stand 31.08.24</Label>
              <Input
                type="number"
                step="1"
                value={planstellenData.schuelerzahlStand}
                onChange={(e) => handleInputChange('schuelerzahlStand', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-schuelerzahl"
              />
              <div className="text-center text-sm text-gray-500">-</div>
            </div>

            {/* F4: Schüler/Lehrerrelation an der Realschule: (ab 06/18) (EINGABE) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">F4: Schüler/Lehrerrelation an der Realschule: (ab 06/18)</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.schuelerLehrerrelation}
                onChange={(e) => handleInputChange('schuelerLehrerrelation', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-schuelerrelation"
              />
              <div className="text-center text-sm text-gray-500">-</div>
            </div>

            <Separator />

            {/* F5: Quotient der zwei Größen: (BERECHNET) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm font-medium">F5: Quotient der zwei Größen:</Label>
              <div className={`p-2 border rounded text-right font-mono ${isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-300'}`}>
                {isValidForCalculation ? quotient.toFixed(8) : 'Division durch 0'}
              </div>
              <div className="text-center text-sm text-gray-500">-</div>
            </div>

            {/* F6: Quotient abgeschnitten nach 2. Dezimalstelle (BERECHNET) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm font-medium">F6: Quotient nach der 2. Dezimale abgeschnitten</Label>
              <div className={`p-2 border rounded text-right font-mono ${isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-300'}`} data-testid="display-f6">
                {isValidForCalculation ? quotientAbgeschnitten.toFixed(2) : '0.00'}
              </div>
              <div className="text-center text-sm text-gray-500">-</div>
            </div>

            {/* F7: abgerundet auf halbe bzw. ganze Dezimale (BERECHNET) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm font-medium">F7: abgerundet auf halbe bzw. ganze Dezimale:</Label>
              <div className={`p-2 border rounded text-right font-mono ${isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-300'}`} data-testid="display-f7">
                {isValidForCalculation ? abgerundet.toFixed(1) : '0.0'}
              </div>
              <div className="text-center text-sm text-gray-500">-</div>
            </div>

            <Separator />

            {/* F8: bedarfsdeckender Unterricht - Abzug Lehramtsanwärter (EINGABE) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">F8: bedarfsdeckender Unterricht - Abzug Lehramtsanwärter</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.abzugLehramtsanwaerter}
                onChange={(e) => handleInputChange('abzugLehramtsanwaerter', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-abzug-lehramtsanwaerter"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlAbzugLehramtsanwaerter || 0}
                onChange={(e) => handleInputChange('stundenanzahlAbzugLehramtsanwaerter', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-abzug"
              />
            </div>

            {/* F9: Rundung (EINGABE) */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">F9: Rundung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.rundung}
                onChange={(e) => handleInputChange('rundung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-rundung"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlRundung || 0}
                onChange={(e) => handleInputChange('stundenanzahlRundung', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-rundung"
              />
            </div>

            <Separator className="border-t-2" />

            {/* F10: Summe Grundbedarf (BERECHNET) */}
            <div className="grid grid-cols-3 gap-4 items-center bg-green-50 p-4 rounded-lg border-2 border-green-300">
              <Label className="text-sm font-bold">F10: Summe Grundbedarf</Label>
              <div className="p-3 bg-green-100 border border-green-400 rounded text-right font-mono text-lg font-bold" data-testid="display-f10">
                {summeGrundbedarf.toFixed(2)}
              </div>
              <div className="text-center text-sm text-gray-500">-</div>
            </div>

            {/* === WEITERE BEREICHE === */}
            <div className="bg-blue-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Weitere Bereiche</h3>
            </div>

            {/* Praktische Philosophie /Islamkunde */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">Praktische Philosophie /Islamkunde</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.praktischePhilosophieIslamkunde || 0}
                onChange={(e) => handleInputChange('praktischePhilosophieIslamkunde', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-praktische-philosophie"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlPraktischePhilosophie || 0}
                onChange={(e) => handleInputChange('stundenanzahlPraktischePhilosophie', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-philosophie"
              />
            </div>

            {/* Pädagogische Übermittagsbetreuung */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">Pädagogische Übermittagsbetreuung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.paedagogischeUebermittagsbetreuung || 0}
                onChange={(e) => handleInputChange('paedagogischeUebermittagsbetreuung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-paedagogische-betreuung"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlPaedagogischeUebermittagsbetreuung || 0}
                onChange={(e) => handleInputChange('stundenanzahlPaedagogischeUebermittagsbetreuung', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-betreuung"
              />
            </div>

            {/* Integration durch Bildung */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">Integration durch Bildung</Label>
              <Input
                type="number"
                step="0.01"
                value={planstellenData.integrationDurchBildung || 0}
                onChange={(e) => handleInputChange('integrationDurchBildung', parseFloat(e.target.value))}
                className="bg-yellow-50 border-yellow-300"
                data-testid="input-integration-bildung"
              />
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlIntegrationDurchBildung || 0}
                onChange={(e) => handleInputChange('stundenanzahlIntegrationDurchBildung', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-integration"
              />
            </div>

            {/* === FREIE EINGABEZEILEN === */}
            <div className="bg-gray-50 p-2 rounded-lg mt-6">
              <h3 className="font-bold text-center">Freie Eingabezeilen</h3>
            </div>

            {/* Freie Zeile 1 */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Input
                type="text"
                value={planstellenData.freieZeile1Label || ""}
                onChange={(e) => handleInputChange('freieZeile1Label', e.target.value)}
                className="bg-gray-50 border-gray-300"
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
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlFreieZeile1 || 0}
                onChange={(e) => handleInputChange('stundenanzahlFreieZeile1', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-freie1"
              />
            </div>

            {/* Freie Zeile 2 */}
            <div className="grid grid-cols-3 gap-4 items-center">
              <Input
                type="text"
                value={planstellenData.freieZeile2Label || ""}
                onChange={(e) => handleInputChange('freieZeile2Label', e.target.value)}
                className="bg-gray-50 border-gray-300"
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
              <Input
                type="number"
                step="0.01"
                value={planstellenData.stundenanzahlFreieZeile2 || 0}
                onChange={(e) => handleInputChange('stundenanzahlFreieZeile2', parseFloat(e.target.value))}
                className="bg-green-50 border-green-300"
                data-testid="input-stundenanzahl-freie2"
              />
            </div>

            <Separator className="border-t-2" />

            {/* SUMME STUNDENANZAHL REAL */}
            <div className="grid grid-cols-3 gap-4 items-center bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
              <Label className="text-sm font-bold">Summe Stundenanzahl real</Label>
              <div className="text-center text-sm text-gray-500">-</div>
              <div className="p-3 bg-blue-100 border border-blue-400 rounded text-right font-mono text-lg font-bold" data-testid="display-summe-stundenanzahl">
                {summeStundenanzahlReal.toFixed(2)}
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
          <div>F5: = F3/F4 ({planstellenData.schuelerzahlStand} / {planstellenData.schuelerLehrerrelation})</div>
          <div>F6: = TRUNC(F5, 2)</div>
          <div>F7: = IF(F5-INT(F5)&lt;0.5, INT(F5), INT(F5)+0.5)</div>
          <div>F10: = SUM(F6, F8:F9) = {quotientAbgeschnitten.toFixed(2)} + {planstellenData.abzugLehramtsanwaerter} + {planstellenData.rundung}</div>
          <div>Summe Stundenanzahl real: = SUM(alle Stundenanzahl-Felder)</div>
        </CardContent>
      </Card>

    </div>
  )
}