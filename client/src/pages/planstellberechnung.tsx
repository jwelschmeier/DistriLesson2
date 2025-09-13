import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Calculator } from 'lucide-react'
import type { PlanstellenInput } from '@shared/schema'

export default function PlanstellberechnungPage() {
  // State nur für die 4 Eingabefelder aus Excel
  const [planstellenData, setPlanstellenData] = useState<PlanstellenInput>({
    schulname: "Realschule Musterstadt",
    schuljahr: "2024/25",
    schuelerzahlStand: 710,           // F3: Eingabe
    schuelerLehrerrelation: 20.19,    // F4: Eingabe
    abzugLehramtsanwaerter: -0.5,     // F8: Eingabe
    rundung: -0.21                    // F9: Eingabe
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

  const handleInputChange = (field: keyof PlanstellenInput, value: string | number) => {
    setPlanstellenData(prev => ({
      ...prev,
      [field]: field === 'schulname' || field === 'schuljahr' 
        ? value // Keep strings as strings
        : typeof value === 'string' ? parseFloat(value) || 0 : value // Parse only numeric fields
    }))
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Planstellenberechnung - Grundbedarf</h1>
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

      {/* 1. GRUNDBEDARF - Exakte Excel-Struktur F3-F10 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Grundbedarf</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* F3: Schülerzahl Stand 31.08.24 (EINGABE) */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-sm">F3: Schülerzahl Stand 31.08.24</Label>
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
            <Label className="text-sm">F4: Schüler/Lehrerrelation an der Realschule: (ab 06/18)</Label>
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
            <Label className="text-sm font-medium">F5: Quotient der zwei Größen:</Label>
            <div 
              className={`p-2 border rounded text-right font-mono ${
                isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-200'
              }`}
              data-testid="display-f5"
            >
              {isValidForCalculation ? quotient.toFixed(8) : "Fehler: Division durch Null"}
            </div>
          </div>

          {/* F6: Quotient abgeschnitten nach 2. Dezimalstelle (BERECHNET) */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-sm font-medium">F6: Quotient der zwei Größen nach der 2. Dezimale abgeschnitten</Label>
            <div 
              className={`p-2 border rounded text-right font-mono ${
                isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-200'
              }`}
              data-testid="display-f6"
            >
              {isValidForCalculation ? quotientAbgeschnitten.toFixed(2) : "---"}
            </div>
          </div>

          {/* F7: abgerundet auf halbe bzw. ganze Dezimale (BERECHNET) */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-sm font-medium">F7: abgerundet auf halbe bzw. ganze Dezimale:</Label>
            <div 
              className={`p-2 border rounded text-right font-mono ${
                isValidForCalculation ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-200'
              }`}
              data-testid="display-f7"
            >
              {isValidForCalculation ? abgerundet.toFixed(1) : "---"}
            </div>
          </div>

          <Separator />

          {/* F8: bedarfsdeckender Unterricht - Abzug Lehramtsanwärter (EINGABE) */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-sm">F8: bedarfsdeckender Unterricht - Abzug Lehramtsanwärter</Label>
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
            <Label className="text-sm">F9: Rundung</Label>
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
          <div className={`gap-4 items-center p-4 rounded-lg border-2 grid grid-cols-2 ${
            isValidForCalculation ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
          }`}>
            <Label className="text-sm font-bold">F10: Summe Grundbedarf</Label>
            <div 
              className={`p-3 border rounded text-right font-mono text-lg font-bold ${
                isValidForCalculation ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'
              }`}
              data-testid="display-f10"
            >
              {isValidForCalculation ? summeGrundbedarf.toFixed(2) : "Berechnung nicht möglich"}
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
          <div>F10: = SUM(F6, F8:F9) = {isValidForCalculation ? quotientAbgeschnitten.toFixed(2) : "---"} + {planstellenData.abzugLehramtsanwaerter} + {planstellenData.rundung}</div>
          {!isValidForCalculation && (
            <div className="text-red-600 font-medium mt-2">
              ⚠️ Warnung: Schüler/Lehrerrelation muss größer als 0 sein für gültige Berechnungen!
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}