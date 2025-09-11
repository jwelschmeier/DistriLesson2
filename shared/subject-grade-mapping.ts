// Fach-Jahrgangsstufen-Zuordnung für intelligente Lehrer-Migration beim Schuljahreswechsel
// Deutsche Realschule NRW - Stundentafel 2025

import { getParallelGroupForSubject, PARALLEL_GROUPS } from './parallel-subjects';

// Basis-Interface für Fach-Jahrgangsstufen-Zuordnung
export interface SubjectGradeMapping {
  [subject: string]: {
    grades: number[];                           // Jahrgangsstufen wo Fach unterrichtet wird [5,6,7,8,9,10]
    continuity: 'continuous' | 'interrupted' | 'terminates';  // Kontinuität des Fachs
    migrationRule: 'auto' | 'manual' | 'impossible';         // Migration-Regel für Schuljahreswechsel
    breaks?: number[];                          // Jahrgangsstufen wo Fach pausiert (optional)
    notes?: string;                             // Zusätzliche Hinweise (optional)
  }
}

// NRW Realschul-Stundentafel 2025 - Fach-Jahrgangsstufen-Matrix
export const NRW_REALSCHULE_SUBJECT_GRADE_MAPPING: SubjectGradeMapping = {
  // === KERNFÄCHER - Kontinuierlich 5-10 ===
  "Deutsch": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Kernfach - durchgängig alle Jahrgangsstufen"
  },
  "Mathematik": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Kernfach - durchgängig alle Jahrgangsstufen"
  },
  "Englisch": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Erste Fremdsprache - durchgängig alle Jahrgangsstufen"
  },

  // === GESELLSCHAFTSLEHRE - Kontinuierlich ===
  "Geschichte": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Durchgängig alle Jahrgangsstufen (ab Klasse 5 mit reduziertem Stundenumfang)"
  },
  "Politik": {
    grades: [6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Gesellschaftslehre - ab Klasse 6"
  },
  "Erdkunde": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Gesellschaftslehre - durchgängig"
  },

  // === NATURWISSENSCHAFTEN - Teilweise unterbrochen ===
  "Biologie": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'interrupted',
    migrationRule: 'manual',
    breaks: [7],
    notes: "Reduzierte Stunden in Klasse 7 - manuelle Überprüfung nötig"
  },
  "Physik": {
    grades: [6, 7, 8, 9, 10],
    continuity: 'interrupted',
    migrationRule: 'manual',
    breaks: [9],
    notes: "Reduzierte Stunden in Klasse 9 - manuelle Überprüfung nötig"
  },
  "Chemie": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Ab Klasse 7 durchgängig"
  },

  // === SPORT UND ÄSTHETISCHE FÄCHER - Kontinuierlich ===
  "Sport": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Durchgängig alle Jahrgangsstufen"
  },
  "Kunst": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Ästhetisches Fach - durchgängig"
  },
  "Musik": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Ästhetisches Fach - durchgängig"
  },

  // === RELIGIONSFÄCHER - Parallele Gruppe ===
  "KR": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Katholische Religion - parallele Gruppe mit ER/PP"
  },
  "ER": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Evangelische Religion - parallele Gruppe mit KR/PP"
  },
  "PP": {
    grades: [5, 6, 7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'auto',
    notes: "Praktische Philosophie - parallele Gruppe mit KR/ER"
  },

  // === DIFFERENZIERUNGSFÄCHER 7-10 - Parallele Gruppe ===
  "FS": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'manual',
    notes: "Französisch - Differenzierungsfach, parallele Gruppe"
  },
  "SW": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'manual',
    notes: "Sozialwissenschaften - Differenzierungsfach, parallele Gruppe"
  },
  "NW": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'manual',
    notes: "Biologie-Kurs - Differenzierungsfach, parallele Gruppe"
  },
  "IF": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'manual',
    notes: "Informatik - Differenzierungsfach, parallele Gruppe"
  },
  "TC": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'manual',
    notes: "Technik - Differenzierungsfach, parallele Gruppe"
  },
  "MUS": {
    grades: [7, 8, 9, 10],
    continuity: 'continuous',
    migrationRule: 'manual',
    notes: "Musik-Kurs - Differenzierungsfach, parallele Gruppe"
  },

  // === GRADUIERUNG KLASSE 10 ===
  // Alle Klasse 10 Fächer haben terminates continuity für Migration nach Klasse 11
  // Aber da Realschule nur bis Klasse 10 geht, ist das hauptsächlich für Wechsel zum Gymnasium relevant
};

// === MIGRATION-EVALUATION-FUNCTIONS ===

/**
 * Bewertet ob ein Lehrer von einer Jahrgangsstufe zur nächsten migriert werden kann
 * @param currentGrade Aktuelle Jahrgangsstufe des Lehrers
 * @param targetGrade Ziel-Jahrgangsstufe für nächstes Schuljahr
 * @param subject Fach-Kürzel
 * @returns Migration-Möglichkeit: 'auto', 'manual', oder 'impossible'
 */
export function evaluateTeacherMigration(
  currentGrade: number,
  targetGrade: number,
  subject: string
): 'auto' | 'manual' | 'impossible' {
  // Validierung
  if (currentGrade < 5 || currentGrade > 10 || targetGrade < 5 || targetGrade > 10) {
    return 'impossible';
  }

  // Fach-Mapping abrufen
  const subjectMapping = NRW_REALSCHULE_SUBJECT_GRADE_MAPPING[subject];
  if (!subjectMapping) {
    return 'impossible'; // Unbekanntes Fach
  }

  // Prüfe ob Fach in Ziel-Jahrgangsstufe unterrichtet wird
  if (!subjectMapping.grades.includes(targetGrade)) {
    return 'impossible';
  }

  // Prüfe ob Fach aktuell unterrichtet wird
  if (!subjectMapping.grades.includes(currentGrade)) {
    return 'impossible';
  }

  // Spezialfall: Graduierung nach Klasse 10
  if (currentGrade === 10) {
    return 'impossible'; // Realschüler graduieren nach Klasse 10
  }

  // Spezialfall: Wechsel zwischen nicht-aufeinanderfolgenden Jahrgangsstufen
  if (Math.abs(targetGrade - currentGrade) > 1) {
    return 'manual'; // Größere Sprünge erfordern manuelle Überprüfung
  }

  // Normale aufeinanderfolgende Migration (z.B. 8→9)
  if (targetGrade === currentGrade + 1) {
    // Prüfe auf Fach-Pausen
    if (subjectMapping.breaks && subjectMapping.breaks.includes(targetGrade)) {
      return 'manual'; // Fach pausiert im Zieljahr
    }

    // Parallele Fächer erfordern besondere Aufmerksamkeit
    const parallelGroup = getParallelGroupForSubject(subject);
    if (parallelGroup) {
      // Differenzierungsfächer: Schüler können Fach wechseln
      if (parallelGroup.id === 'Differenzierung') {
        return 'manual';
      }
      // Religionsfächer: meist stabile Zuordnung
      if (parallelGroup.id === 'Religion') {
        return 'auto';
      }
    }

    // Standard-Migration basierend auf Fach-Regel
    return subjectMapping.migrationRule;
  }

  // Rückwärts-Migration (ungewöhnlich, aber möglich)
  if (targetGrade === currentGrade - 1) {
    return 'manual'; // Erfordert immer manuelle Überprüfung
  }

  return 'manual'; // Alle anderen Fälle
}

/**
 * Gibt alle verfügbaren Fächer für eine bestimmte Jahrgangsstufe zurück
 * @param grade Jahrgangsstufe (5-10)
 * @returns Array der verfügbaren Fach-Kürzel
 */
export function getSubjectAvailability(grade: number): string[] {
  if (grade < 5 || grade > 10) {
    return [];
  }

  const availableSubjects: string[] = [];
  
  for (const [subject, mapping] of Object.entries(NRW_REALSCHULE_SUBJECT_GRADE_MAPPING)) {
    if (mapping.grades.includes(grade)) {
      availableSubjects.push(subject);
    }
  }

  return availableSubjects.sort();
}

/**
 * Gibt detaillierte Information über Fach-Verfügbarkeit für Migration zurück
 * @param fromGrade Ausgangs-Jahrgangsstufe
 * @param toGrade Ziel-Jahrgangsstufe
 * @returns Objekt mit verfügbaren, nicht verfügbaren und neuen Fächern
 */
export function getSubjectMigrationAvailability(fromGrade: number, toGrade: number): {
  available: string[];      // Fächer die in beiden Jahrgangsstufen verfügbar sind
  unavailable: string[];    // Fächer die in Ziel-Jahrgangsstufe nicht mehr verfügbar sind
  new: string[];           // Neue Fächer die nur in Ziel-Jahrgangsstufe verfügbar sind
} {
  const fromSubjects = new Set(getSubjectAvailability(fromGrade));
  const toSubjects = new Set(getSubjectAvailability(toGrade));

  const available = Array.from(fromSubjects).filter(subject => toSubjects.has(subject));
  const unavailable = Array.from(fromSubjects).filter(subject => !toSubjects.has(subject));
  const newSubjects = Array.from(toSubjects).filter(subject => !fromSubjects.has(subject));

  return {
    available: available.sort(),
    unavailable: unavailable.sort(),
    new: newSubjects.sort(),
  };
}

/**
 * Prüft ob ein Fach in einer bestimmten Jahrgangsstufe eine Pause hat
 * @param subject Fach-Kürzel
 * @param grade Jahrgangsstufe
 * @returns true wenn Fach in dieser Jahrgangsstufe pausiert
 */
export function isSubjectOnBreak(subject: string, grade: number): boolean {
  const subjectMapping = NRW_REALSCHULE_SUBJECT_GRADE_MAPPING[subject];
  if (!subjectMapping || !subjectMapping.breaks) {
    return false;
  }
  return subjectMapping.breaks.includes(grade);
}

/**
 * Gibt alle Fächer zurück die in einer bestimmten Jahrgangsstufe pausieren
 * @param grade Jahrgangsstufe
 * @returns Array der pausierenden Fach-Kürzel
 */
export function getSubjectsOnBreak(grade: number): string[] {
  const subjectsOnBreak: string[] = [];
  
  for (const [subject, mapping] of Object.entries(NRW_REALSCHULE_SUBJECT_GRADE_MAPPING)) {
    if (mapping.breaks && mapping.breaks.includes(grade)) {
      subjectsOnBreak.push(subject);
    }
  }

  return subjectsOnBreak.sort();
}

/**
 * Kategorisiert Migration-Regeln für alle Fächer beim Wechsel zwischen Jahrgangsstufen
 * @param fromGrade Ausgangs-Jahrgangsstufe
 * @param toGrade Ziel-Jahrgangsstufe
 * @returns Objekt mit Fächern kategorisiert nach Migration-Regeln
 */
export function categorizeMigrationRules(fromGrade: number, toGrade: number): {
  auto: string[];
  manual: string[];
  impossible: string[];
} {
  const result = {
    auto: [] as string[],
    manual: [] as string[],
    impossible: [] as string[],
  };

  const fromSubjects = getSubjectAvailability(fromGrade);
  
  for (const subject of fromSubjects) {
    const migrationRule = evaluateTeacherMigration(fromGrade, toGrade, subject);
    result[migrationRule].push(subject);
  }

  // Sortiere alle Arrays
  result.auto.sort();
  result.manual.sort();
  result.impossible.sort();

  return result;
}

/**
 * Erstellt eine vollständige Migration-Matrix für alle Jahrgangsstufen-Kombinationen
 * @returns Matrix mit Migration-Möglichkeiten für alle Fach-Jahrgangsstufen-Kombinationen
 */
export function createMigrationMatrix(): Record<string, Record<string, Record<string, 'auto' | 'manual' | 'impossible'>>> {
  const matrix: Record<string, Record<string, Record<string, 'auto' | 'manual' | 'impossible'>>> = {};

  for (let fromGrade = 5; fromGrade <= 10; fromGrade++) {
    const fromKey = `grade_${fromGrade}`;
    matrix[fromKey] = {};

    for (let toGrade = 5; toGrade <= 10; toGrade++) {
      const toKey = `grade_${toGrade}`;
      const subjects = getSubjectAvailability(fromGrade);
      
      const migrationRules: Record<string, 'auto' | 'manual' | 'impossible'> = {};
      for (const subject of subjects) {
        migrationRules[subject] = evaluateTeacherMigration(fromGrade, toGrade, subject);
      }
      
      matrix[fromKey][toKey] = migrationRules;
    }
  }

  return matrix;
}

// === INTEGRATION MIT PARALLEL-SUBJECTS SYSTEM ===

/**
 * Prüft ob ein Fach zur einer parallelen Gruppe gehört und gibt entsprechende Migration-Hinweise
 * @param subject Fach-Kürzel
 * @param fromGrade Ausgangs-Jahrgangsstufe
 * @param toGrade Ziel-Jahrgangsstufe
 * @returns Erweiterte Migration-Information mit parallelen Fach-Hinweisen
 */
export function evaluateParallelSubjectMigration(
  subject: string,
  fromGrade: number,
  toGrade: number
): {
  migrationRule: 'auto' | 'manual' | 'impossible';
  parallelGroup: string | null;
  parallelSubjects: string[];
  notes: string[];
} {
  const baseMigration = evaluateTeacherMigration(fromGrade, toGrade, subject);
  const parallelGroup = getParallelGroupForSubject(subject);
  const notes: string[] = [];

  let parallelSubjects: string[] = [];
  let parallelGroupName: string | null = null;

  if (parallelGroup) {
    parallelGroupName = parallelGroup.name;
    parallelSubjects = parallelGroup.subjects.filter(s => s !== subject);

    if (parallelGroup.id === 'Differenzierung') {
      notes.push('Differenzierungsfach: Schüler können bei Jahrgangsstufenwechsel das Fach wechseln');
      notes.push('Alternative Fächer: ' + parallelSubjects.join(', '));
    }

    if (parallelGroup.id === 'Religion') {
      notes.push('Religionsfach: Alternative Fächer verfügbar');
      notes.push('Alternative Fächer: ' + parallelSubjects.join(', '));
    }
  }

  return {
    migrationRule: baseMigration,
    parallelGroup: parallelGroupName,
    parallelSubjects,
    notes,
  };
}

// === STATISTIK-FUNKTIONEN ===

/**
 * Berechnet Migration-Statistiken für eine Jahrgangsstufen-Transition
 * @param fromGrade Ausgangs-Jahrgangsstufe
 * @param toGrade Ziel-Jahrgangsstufe
 * @returns Statistik-Objekt mit Anzahl verschiedener Migration-Kategorien
 */
export function calculateMigrationStatistics(fromGrade: number, toGrade: number): {
  total: number;
  auto: number;
  manual: number;
  impossible: number;
  percentageAuto: number;
  percentageManual: number;
  percentageImpossible: number;
} {
  const rules = categorizeMigrationRules(fromGrade, toGrade);
  const total = rules.auto.length + rules.manual.length + rules.impossible.length;

  return {
    total,
    auto: rules.auto.length,
    manual: rules.manual.length,
    impossible: rules.impossible.length,
    percentageAuto: total > 0 ? Math.round((rules.auto.length / total) * 100) : 0,
    percentageManual: total > 0 ? Math.round((rules.manual.length / total) * 100) : 0,
    percentageImpossible: total > 0 ? Math.round((rules.impossible.length / total) * 100) : 0,
  };
}

// Exportiere die Mapping-Konstante für externe Verwendung
export { NRW_REALSCHULE_SUBJECT_GRADE_MAPPING as SUBJECT_GRADE_MAPPING };

// Exportiere alle Grade für Convenience
export const ALL_GRADES = [5, 6, 7, 8, 9, 10] as const;
export type RealschuleGrade = typeof ALL_GRADES[number];