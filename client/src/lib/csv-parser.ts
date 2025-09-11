interface CSVParseResult<T> {
  data: T[];
  errors: string[];
  skipped: number;
}

interface CSVParserOptions {
  delimiter?: string;
  skipEmptyLines?: boolean;
  trimWhitespace?: boolean;
  hasHeaders?: boolean;
}

export class CSVParser {
  private options: Required<CSVParserOptions>;

  constructor(options: CSVParserOptions = {}) {
    this.options = {
      delimiter: options.delimiter || ",",
      skipEmptyLines: options.skipEmptyLines ?? true,
      trimWhitespace: options.trimWhitespace ?? true,
      hasHeaders: options.hasHeaders ?? true,
    };
  }

  parse<T>(csvContent: string, transformer: (row: string[], headers?: string[]) => T | null): CSVParseResult<T> {
    const lines = csvContent.split("\n");
    const data: T[] = [];
    const errors: string[] = [];
    let skipped = 0;

    if (lines.length === 0) {
      return { data, errors: ["CSV-Datei ist leer"], skipped };
    }

    // Process headers
    let headers: string[] | undefined;
    let startIndex = 0;

    if (this.options.hasHeaders && lines.length > 0) {
      const headerLine = this.options.trimWhitespace ? lines[0].trim() : lines[0];
      headers = this.parseLine(headerLine);
      startIndex = 1;
    }

    // Process data rows
    for (let i = startIndex; i < lines.length; i++) {
      const line = this.options.trimWhitespace ? lines[i].trim() : lines[i];

      // Skip empty lines
      if (this.options.skipEmptyLines && !line) {
        skipped++;
        continue;
      }

      try {
        const row = this.parseLine(line);
        
        // Skip rows that don't have enough columns
        if (headers && row.length < headers.length) {
          skipped++;
          continue;
        }

        const transformedRow = transformer(row, headers);
        if (transformedRow !== null) {
          data.push(transformedRow);
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push(`Zeile ${i + 1}: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
      }
    }

    return { data, errors, skipped };
  }

  private parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === this.options.delimiter && !inQuotes) {
        // End of field
        result.push(this.options.trimWhitespace ? current.trim() : current);
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }

    // Add last field
    result.push(this.options.trimWhitespace ? current.trim() : current);

    return result;
  }
}

// Predefined transformers for SCHILD NRW data
export const schildTransformers = {
  teacher: (row: string[], headers?: string[]) => {
    if (row.length < 3) return null;
    
    return {
      firstName: row[0] || "",
      lastName: row[1] || "",
      shortName: row[2] || "",
      email: row[3] || "",
      subjects: row[4] ? row[4].split(";").map(s => s.trim()).filter(Boolean) : [],
      maxHours: parseInt(row[5]) || 25,
      currentHours: parseInt(row[6]) || 0,
      qualifications: row[7] ? row[7].split(";").map(q => q.trim()).filter(Boolean) : [],
      isActive: true,
    };
  },

  student: (row: string[], headers?: string[]) => {
    if (row.length < 3) return null;
    
    return {
      firstName: row[0] || "",
      lastName: row[1] || "",
      classId: row[2] || null,
      grade: parseInt(row[3]) || 5,
    };
  },

  class: (row: string[], headers?: string[]) => {
    if (row.length < 2) return null;
    
    return {
      name: row[0] || "",
      grade: parseInt(row[1]) || 5,
      studentCount: parseInt(row[2]) || 0,
      subjectHours: {},
    };
  },

  subject: (row: string[], headers?: string[]) => {
    if (row.length < 2) return null;
    
    return {
      name: row[0] || "",
      shortName: row[1] || "",
      category: row[2] || "Hauptfach",
      hoursPerWeek: {},
    };
  },

  assignment: (row: string[], headers?: string[]) => {
    if (row.length < 6) return null;
    
    // Expected format: teacherShort, subjectShort, className, semester, hoursPerWeek, schoolYearId
    const teacherShort = row[0]?.trim();
    const subjectShort = row[1]?.trim();
    const className = row[2]?.trim();
    const semester = row[3]?.trim() || "1";
    const hoursStr = row[4]?.trim();
    const schoolYearId = row[5]?.trim();
    
    if (!teacherShort || !subjectShort || !className || !hoursStr) {
      return null;
    }
    
    const hoursPerWeek = parseFloat(hoursStr);
    if (isNaN(hoursPerWeek) || hoursPerWeek <= 0) {
      return null;
    }
    
    return {
      teacherShort,
      subjectShort,
      className,
      semester,
      hoursPerWeek,
      schoolYearId,
    };
  },

  // Enhanced assignment transformer for semester-specific distribution
  assignmentWithSemesterSplit: (row: string[], headers?: string[]) => {
    if (row.length < 4) return null;
    
    // Expected format: teacherShort, subjectShort, className, totalHoursPerWeek, semesterDistribution?
    const teacherShort = row[0]?.trim();
    const subjectShort = row[1]?.trim();
    const className = row[2]?.trim();
    const totalHoursStr = row[3]?.trim();
    const semesterDistribution = row[4]?.trim(); // e.g., "both", "1", "2", "2-2", "3-1"
    
    if (!teacherShort || !subjectShort || !className || !totalHoursStr) {
      return null;
    }
    
    const totalHours = parseFloat(totalHoursStr);
    if (isNaN(totalHours) || totalHours <= 0) {
      return null;
    }
    
    // Parse semester distribution
    let semester1Hours = 0;
    let semester2Hours = 0;
    
    if (!semesterDistribution || semesterDistribution === "both") {
      // Equal distribution across both semesters
      semester1Hours = totalHours;
      semester2Hours = totalHours;
    } else if (semesterDistribution === "1") {
      // Only semester 1
      semester1Hours = totalHours;
      semester2Hours = 0;
    } else if (semesterDistribution === "2") {
      // Only semester 2
      semester1Hours = 0;
      semester2Hours = totalHours;
    } else if (semesterDistribution.includes("-")) {
      // Specific distribution like "3-1" or "2-2"
      const [s1, s2] = semesterDistribution.split("-").map(s => parseFloat(s.trim()));
      if (!isNaN(s1) && !isNaN(s2)) {
        semester1Hours = s1;
        semester2Hours = s2;
      } else {
        // Default to equal distribution if parsing fails
        semester1Hours = totalHours;
        semester2Hours = totalHours;
      }
    } else {
      // Default to equal distribution
      semester1Hours = totalHours;
      semester2Hours = totalHours;
    }
    
    // Return both assignments if both semesters have hours
    const assignments = [];
    if (semester1Hours > 0) {
      assignments.push({
        teacherShort,
        subjectShort,
        className,
        semester: "1",
        hoursPerWeek: semester1Hours,
      });
    }
    if (semester2Hours > 0) {
      assignments.push({
        teacherShort,
        subjectShort,
        className,
        semester: "2",
        hoursPerWeek: semester2Hours,
      });
    }
    
    return assignments.length > 0 ? assignments : null;
  },
};

// Validation functions
export const csvValidators = {
  validateTeacher: (teacher: any): string[] => {
    const errors: string[] = [];
    
    if (!teacher.firstName) errors.push("Vorname ist erforderlich");
    if (!teacher.lastName) errors.push("Nachname ist erforderlich");
    if (!teacher.shortName) errors.push("Kürzel ist erforderlich");
    if (teacher.shortName && teacher.shortName.length > 4) errors.push("Kürzel darf maximal 4 Zeichen haben");
    if (teacher.maxHours && (teacher.maxHours < 1 || teacher.maxHours > 40)) {
      errors.push("Maximale Stunden müssen zwischen 1 und 40 liegen");
    }
    if (teacher.currentHours && teacher.currentHours < 0) {
      errors.push("Aktuelle Stunden dürfen nicht negativ sein");
    }
    
    return errors;
  },

  validateStudent: (student: any): string[] => {
    const errors: string[] = [];
    
    if (!student.firstName) errors.push("Vorname ist erforderlich");
    if (!student.lastName) errors.push("Nachname ist erforderlich");
    if (student.grade && (student.grade < 5 || student.grade > 10)) {
      errors.push("Jahrgangsstufe muss zwischen 5 und 10 liegen");
    }
    
    return errors;
  },

  validateClass: (classData: any): string[] => {
    const errors: string[] = [];
    
    if (!classData.name) errors.push("Klassenname ist erforderlich");
    if (classData.grade && (classData.grade < 5 || classData.grade > 10)) {
      errors.push("Jahrgangsstufe muss zwischen 5 und 10 liegen");
    }
    if (classData.studentCount && classData.studentCount < 0) {
      errors.push("Schüleranzahl darf nicht negativ sein");
    }
    
    return errors;
  },

  validateSubject: (subject: any): string[] => {
    const errors: string[] = [];
    
    if (!subject.name) errors.push("Fachname ist erforderlich");
    if (!subject.shortName) errors.push("Kürzel ist erforderlich");
    if (subject.shortName && subject.shortName.length > 10) {
      errors.push("Kürzel darf maximal 10 Zeichen haben");
    }
    
    return errors;
  },

  validateAssignment: (assignment: any): string[] => {
    const errors: string[] = [];
    
    if (!assignment.teacherShort) errors.push("Lehrerkürzel ist erforderlich");
    if (!assignment.subjectShort) errors.push("Fachkürzel ist erforderlich");
    if (!assignment.className) errors.push("Klassenname ist erforderlich");
    if (!assignment.semester || !["1", "2"].includes(assignment.semester)) {
      errors.push("Semester muss '1' oder '2' sein");
    }
    if (!assignment.hoursPerWeek || assignment.hoursPerWeek <= 0) {
      errors.push("Wochenstunden müssen größer als 0 sein");
    }
    if (assignment.hoursPerWeek && assignment.hoursPerWeek > 10) {
      errors.push("Wochenstunden scheinen unrealistisch hoch (>10)");
    }
    
    return errors;
  },
};

// Assignment-specific utility functions
export function createMissingAssignments(
  teacherShort: string,
  subjectShort: string,
  classes: string[],
  hoursPerWeek: number,
  semesterDistribution: "both" | "1" | "2" = "both"
): any[] {
  const assignments = [];
  
  for (const className of classes) {
    if (semesterDistribution === "both" || semesterDistribution === "1") {
      assignments.push({
        teacherShort,
        subjectShort,
        className,
        semester: "1",
        hoursPerWeek,
      });
    }
    if (semesterDistribution === "both" || semesterDistribution === "2") {
      assignments.push({
        teacherShort,
        subjectShort,
        className,
        semester: "2",
        hoursPerWeek,
      });
    }
  }
  
  return assignments;
}

// Function to detect semester-specific subjects that need different distributions
export function detectSemesterSpecificSubjects(assignments: any[]): Map<string, Set<string>> {
  const semesterSubjects = new Map<string, Set<string>>();
  
  for (const assignment of assignments) {
    const key = `${assignment.teacherShort}-${assignment.subjectShort}`;
    
    if (!semesterSubjects.has(key)) {
      semesterSubjects.set(key, new Set());
    }
    
    semesterSubjects.get(key)!.add(assignment.semester);
  }
  
  return semesterSubjects;
}

// Function to generate missing semester 2 assignments based on semester 1 patterns
export function generateMissingSemester2Assignments(
  existingAssignments: any[]
): any[] {
  const missingAssignments = [];
  const semester1Assignments = existingAssignments.filter(a => a.semester === "1");
  const semester2Keys = new Set(
    existingAssignments
      .filter(a => a.semester === "2")
      .map(a => `${a.teacherShort}-${a.subjectShort}-${a.className}`)
  );
  
  for (const s1Assignment of semester1Assignments) {
    const key = `${s1Assignment.teacherShort}-${s1Assignment.subjectShort}-${s1Assignment.className}`;
    
    // If no corresponding semester 2 assignment exists, create one
    if (!semester2Keys.has(key)) {
      missingAssignments.push({
        ...s1Assignment,
        semester: "2",
      });
    }
  }
  
  return missingAssignments;
}

// Utility function to detect CSV format
export function detectCSVFormat(csvContent: string): {
  delimiter: string;
  hasHeaders: boolean;
  encoding: string;
} {
  const lines = csvContent.split("\n").slice(0, 5); // Check first 5 lines
  
  // Detect delimiter
  const delimiters = [",", ";", "\t", "|"];
  let bestDelimiter = ",";
  let maxFields = 0;
  
  for (const delimiter of delimiters) {
    const fieldCounts = lines.map(line => line.split(delimiter).length);
    const avgFields = fieldCounts.reduce((sum, count) => sum + count, 0) / fieldCounts.length;
    
    if (avgFields > maxFields) {
      maxFields = avgFields;
      bestDelimiter = delimiter;
    }
  }
  
  // Detect if first line contains headers (non-numeric values)
  const firstLine = lines[0]?.split(bestDelimiter) || [];
  const hasHeaders = firstLine.some(field => isNaN(Number(field.trim()))) && firstLine.length > 1;
  
  return {
    delimiter: bestDelimiter,
    hasHeaders,
    encoding: "utf-8", // Default assumption
  };
}
