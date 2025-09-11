// Parallele Fächergruppen - Definitionen und Berechnungslogik

export interface ParallelGroup {
  id: string;
  name: string;
  description: string;
  subjects: string[]; // Subject shortNames
  hoursPerGrade: Record<number, number>; // Grade -> hours per week
}

// Parallele Fächergruppen Definition
export const PARALLEL_GROUPS: Record<string, ParallelGroup> = {
  "Differenzierung": {
    id: "Differenzierung",
    name: "Differenzierungsfächer",
    description: "Wahlpflichtfächer die parallel unterrichtet werden (7.-10. Klasse)",
    subjects: ["FS", "SW", "NW", "IF", "TC", "MUS"], // FS=Französisch, SW=Sozialwissenschaften, NW=Biologie-Kurs, IF=Informatik, TC=Technik, MUS=Musik-Kurs
    hoursPerGrade: {
      7: 3,
      8: 4,
      9: 3,
      10: 4,
    },
  },
  "Religion": {
    id: "Religion",
    name: "Religionsfächer",
    description: "Religions- und Philosophieunterricht die parallel unterrichtet werden",
    subjects: ["KR", "ER", "PP"], // KR=Katholische Religion, ER=Evangelische Religion, PP=Praktische Philosophie
    hoursPerGrade: {
      5: 2,
      6: 2,
      7: 2,
      8: 2,
      9: 2,
      10: 2,
    },
  },
};

// Hilfsfunktion: Bestimme parallele Gruppe für ein Fach
export function getParallelGroupForSubject(subjectShortName: string): ParallelGroup | null {
  for (const group of Object.values(PARALLEL_GROUPS)) {
    if (group.subjects.includes(subjectShortName)) {
      return group;
    }
  }
  return null;
}

// Hilfsfunktion: Berechne korrekte Stunden ohne Doppelzählung paralleler Fächer
export function calculateCorrectHours(
  subjectHours: Record<string, number>,
  grade: number
): { totalHours: number; parallelGroupHours: Record<string, number>; regularHours: Record<string, number> } {
  const parallelGroupHours: Record<string, number> = {};
  const regularHours: Record<string, number> = {};
  const processedGroups = new Set<string>();

  // Durchlaufe alle Fächer
  for (const [subjectName, hours] of Object.entries(subjectHours)) {
    const parallelGroup = getParallelGroupForSubject(subjectName);
    
    if (parallelGroup && !processedGroups.has(parallelGroup.id)) {
      // Parallele Gruppe gefunden und noch nicht verarbeitet
      const groupHours = parallelGroup.hoursPerGrade[grade] || 0;
      parallelGroupHours[parallelGroup.id] = groupHours;
      processedGroups.add(parallelGroup.id);
    } else if (!parallelGroup) {
      // Reguläres Fach (nicht in paralleler Gruppe)
      regularHours[subjectName] = hours;
    }
    // Fächer in bereits verarbeiteten parallelen Gruppen werden ignoriert
  }

  // Berechne Gesamtstunden
  const parallelTotal = Object.values(parallelGroupHours).reduce((sum, hours) => sum + hours, 0);
  const regularTotal = Object.values(regularHours).reduce((sum, hours) => sum + hours, 0);
  const totalHours = parallelTotal + regularTotal;

  return {
    totalHours,
    parallelGroupHours,
    regularHours,
  };
}

// Hilfsfunktion: Bestimme ob ein Fach zu einer parallelen Gruppe gehört
export function isSubjectInParallelGroup(subjectShortName: string): boolean {
  return getParallelGroupForSubject(subjectShortName) !== null;
}

// Hilfsfunktion: Hole alle Fächer einer parallelen Gruppe
export function getSubjectsInParallelGroup(groupId: string): string[] {
  const group = PARALLEL_GROUPS[groupId];
  return group ? group.subjects : [];
}

// Hilfsfunktion: Erstelle korrigierte Stundentafel ohne Doppelzählung
export function createCorrectedCurriculumHours(): Record<number, Record<string, number>> {
  // NRW Realschule Stundentafel mit korrigierten parallelen Fächern
  const correctedHours: Record<number, Record<string, number>> = {
    5: {
      "Deutsch": 5,
      "Mathematik": 4,
      "Englisch": 4,
      "Biologie": 2,
      "Erdkunde": 2,
      "Geschichte": 2,
      "Sport": 3,
      "Kunst": 2,
      "Musik": 2,
      "Religion": 2, // Statt KR/ER/PP einzeln - parallele Gruppe
    },
    6: {
      "Deutsch": 4,
      "Mathematik": 4,
      "Englisch": 4,
      "Biologie": 2,
      "Physik": 2,
      "Erdkunde": 1,
      "Geschichte": 2,
      "Politik": 1,
      "Sport": 3,
      "Kunst": 2,
      "Musik": 1,
      "Religion": 2, // Parallele Gruppe
    },
    7: {
      "Deutsch": 4,
      "Mathematik": 4,
      "Englisch": 4,
      "Differenzierung": 3, // Statt FS/SW/NW/IF/TC/MUS einzeln - parallele Gruppe
      "Biologie": 2,
      "Physik": 2,
      "Chemie": 2,
      "Geschichte": 2,
      "Politik": 2,
      "Erdkunde": 1,
      "Sport": 3,
      "Kunst": 1,
      "Musik": 1,
      "Religion": 2, // Parallele Gruppe
    },
    8: {
      "Deutsch": 4,
      "Mathematik": 4,
      "Englisch": 3,
      "Differenzierung": 4, // Parallele Gruppe (erhöht von 3 auf 4)
      "Biologie": 1,
      "Physik": 2,
      "Chemie": 2,
      "Geschichte": 2,
      "Politik": 2,
      "Erdkunde": 2,
      "Sport": 3,
      "Kunst": 2,
      "Musik": 1,
      "Religion": 2, // Parallele Gruppe
    },
    9: {
      "Deutsch": 4,
      "Mathematik": 4,
      "Englisch": 3,
      "Differenzierung": 3, // Parallele Gruppe (zurück auf 3)
      "Biologie": 2,
      "Physik": 2,
      "Chemie": 2,
      "Geschichte": 2,
      "Politik": 2,
      "Erdkunde": 1,
      "Sport": 3,
      "Kunst": 1,
      "Musik": 1,
      "Religion": 2, // Parallele Gruppe
    },
    10: {
      "Deutsch": 4,
      "Mathematik": 4,
      "Englisch": 4,
      "Differenzierung": 4, // Parallele Gruppe (wieder 4h)
      "Biologie": 2,
      "Physik": 2,
      "Chemie": 2,
      "Geschichte": 2,
      "Politik": 2,
      "Erdkunde": 2,
      "Sport": 3,
      "Kunst": 1,
      "Musik": 1,
      "Religion": 2, // Parallele Gruppe
    },
  };

  return correctedHours;
}

// Exportiere alle parallelen Gruppen als Array für UI-Zwecke
export const PARALLEL_GROUPS_ARRAY = Object.values(PARALLEL_GROUPS);