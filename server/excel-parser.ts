import * as XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';

export interface ExcelParseResult<T> {
  data: T[];
  errors: string[];
  skipped: number;
  sheets: string[];
}

export interface LessonDistribution {
  className?: string;
  grade?: number;
  teacherShortName?: string;
  teacherFullName?: string;
  subject?: string;
  subjectShort?: string;
  hoursPerWeek?: number;
  semester?: string;
  notes?: string;
}

export class ExcelParser {
  
  async parseFile<T>(filePath: string, transformer: (row: any[], headers: string[], sheetName: string) => T | null): Promise<ExcelParseResult<T>> {
    try {
      const fullPath = path.resolve(filePath);
      const fileBuffer = await fs.readFile(fullPath);
      
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const data: T[] = [];
      const errors: string[] = [];
      let skipped = 0;
      const sheets = workbook.SheetNames;

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          raw: false
        }) as any[][];

        if (jsonData.length === 0) {
          skipped++;
          continue;
        }

        // First row is typically headers
        const headers = jsonData[0] as string[];
        
        // Process data rows
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          // Skip empty rows
          if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
            skipped++;
            continue;
          }

          try {
            const transformedRow = transformer(row, headers, sheetName);
            if (transformedRow !== null) {
              data.push(transformedRow);
            } else {
              skipped++;
            }
          } catch (error) {
            errors.push(`Blatt "${sheetName}", Zeile ${i + 1}: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
          }
        }
      }

      return { data, errors, skipped, sheets };
    } catch (error) {
      return {
        data: [],
        errors: [`Fehler beim Lesen der Excel-Datei: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`],
        skipped: 0,
        sheets: []
      };
    }
  }

  // Transformer for lesson distribution data
  static lessonDistributionTransformer = (row: any[], headers: string[], sheetName: string): LessonDistribution | null => {
    if (!row || row.length === 0) return null;

    // Try to detect column structure by analyzing headers
    const result: LessonDistribution = {};

    for (let i = 0; i < headers.length && i < row.length; i++) {
      const header = (headers[i] || '').toString().toLowerCase().trim();
      const value = row[i] ? row[i].toString().trim() : '';

      if (!value) continue;

      // Map based on common German SCHILD column names
      if (header.includes('klasse') || header.includes('class')) {
        result.className = value;
        // Extract grade from class name (e.g., "5a" -> 5)
        const gradeMatch = value.match(/(\d+)/);
        if (gradeMatch) {
          result.grade = parseInt(gradeMatch[1]);
        }
      }
      else if (header.includes('lehrer') || header.includes('teacher') || header.includes('lkz') || header.includes('kürzel')) {
        result.teacherShortName = value;
      }
      else if (header.includes('name') && header.includes('lehrer')) {
        result.teacherFullName = value;
      }
      else if (header.includes('fach') || header.includes('subject')) {
        if (value.length <= 3) {
          result.subjectShort = value;
        } else {
          result.subject = value;
        }
      }
      else if (header.includes('stunden') || header.includes('hours') || header.includes('ust') || header.includes('wstd')) {
        const hours = parseFloat(value);
        if (!isNaN(hours)) {
          result.hoursPerWeek = hours;
        }
      }
      else if (header.includes('halbjahr') || header.includes('semester')) {
        result.semester = value;
      }
      else if (header.includes('bemerk') || header.includes('notes')) {
        result.notes = value;
      }
    }

    // Fallback: try to extract from first few columns if headers aren't clear
    if (!result.className && !result.teacherShortName && !result.subject) {
      // Common pattern: Class, Teacher, Subject, Hours
      if (row.length >= 3) {
        result.className = row[0] ? row[0].toString().trim() : '';
        result.teacherShortName = row[1] ? row[1].toString().trim() : '';
        result.subject = row[2] ? row[2].toString().trim() : '';
        if (row.length >= 4) {
          const hours = parseFloat(row[3]);
          if (!isNaN(hours)) {
            result.hoursPerWeek = hours;
          }
        }

        // Extract grade from class name
        if (result.className) {
          const gradeMatch = result.className.match(/(\d+)/);
          if (gradeMatch) {
            result.grade = parseInt(gradeMatch[1]);
          }
        }
      }
    }

    // Only return if we have at least class and subject
    if (result.className && (result.subject || result.subjectShort)) {
      return result;
    }

    return null;
  };
}