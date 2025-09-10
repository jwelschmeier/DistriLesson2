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
};

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
