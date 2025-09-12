import fs from 'fs';

export interface ParsedLesson {
  className: string;
  semester: number;
  subject: string;
  hours: number;
  teacherShortName: string;
  isSupplementary?: boolean; // Förder, SOL, etc.
}

export interface ParsedClassPlan {
  className: string;
  lessons: ParsedLesson[];
  teachers: string[];
}

export interface PdfParseResult {
  classes: ParsedClassPlan[];
  errors: string[];
  warnings: string[];
}

export class PdfLessonParser {
  
  async parsePDF(pdfBuffer: Buffer): Promise<PdfParseResult> {
    const result: PdfParseResult = {
      classes: [],
      errors: [],
      warnings: []
    };

    try {
      // Dynamically import pdfjs-dist to avoid startup issues
      const pdfjs = await import('pdfjs-dist');
      
      // Extract text from PDF
      const text = await this.extractTextFromPDF(pdfBuffer, pdfjs);
      
      // Split into class sections
      const classSections = this.extractClassSections(text);
      
      for (const section of classSections) {
        try {
          const classData = this.parseClassSection(section);
          if (classData) {
            result.classes.push(classData);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Fehler beim Parsen der Klasse: ${errorMessage}`);
        }
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`PDF-Parse-Fehler: ${errorMessage}`);
    }

    return result;
  }

  private async extractTextFromPDF(pdfBuffer: Buffer, pdfjs: any): Promise<string> {
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjs.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;
    
    let fullText = '';
    
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      fullText += pageText + '\n';
    }
    
    return fullText;
  }

  private extractClassSections(text: string): string[] {
    const sections: string[] = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let currentSection = '';
    let inClass = false;
    
    for (const line of lines) {
      if (this.isClassHeader(line)) {
        if (currentSection && inClass) {
          sections.push(currentSection);
        }
        currentSection = line + '\n';
        inClass = true;
      } else if (inClass) {
        currentSection += line + '\n';
      }
    }
    
    // Add the last section
    if (currentSection && inClass) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  private isClassHeader(line: string): boolean {
    return line.includes('Unterrichtsplan für Klasse') || 
           !!(line.match(/^\d{2}[a-zA-Z]$/)) || // e.g., "05a"
           !!(line.match(/Klasse \d{2}[a-zA-Z]/));
  }

  private parseClassSection(section: string): ParsedClassPlan | null {
    const lines = section.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Extract class name
    const className = this.extractClassName(lines[0]);
    if (!className) return null;

    const lessons: ParsedLesson[] = [];
    const teachers: string[] = [];
    let currentSemester = 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for semester headers
      if (line.includes('1. Halbjahr')) {
        currentSemester = 1;
        continue;
      } else if (line.includes('2. Halbjahr')) {
        currentSemester = 2;
        continue;
      }
      
      // Check for teacher list
      if (line.startsWith('Lehrkräfte:')) {
        const teacherList = line.replace('Lehrkräfte:', '').trim();
        teachers.push(...teacherList.split(',').map(t => t.trim()));
        continue;
      }
      
      // Parse lesson line
      const lesson = this.parseLessonLine(line, className, currentSemester);
      if (lesson) {
        lessons.push(lesson);
      }
    }

    return {
      className,
      lessons,
      teachers
    };
  }

  private extractClassName(header: string): string | null {
    // Try to match "Unterrichtsplan für Klasse 05a"
    let match = header.match(/Klasse (\d{2}[a-zA-Z])/);
    if (match) return match[1];
    
    // Try to match direct class name like "05a"
    match = header.match(/^(\d{2}[a-zA-Z])$/);
    if (match) return match[1];
    
    return null;
  }

  private parseLessonLine(line: string, className: string, semester: number): ParsedLesson | null {
    // Patterns to match:
    // "Deutsch (4 Stunden) bei NOL"
    // "Deutsch Förder 1. Hj. (1 Stunde) bei NOL"
    // "SOL 1. Hj. (1 Stunde) bei KAU"
    
    const patterns = [
      // Standard pattern: Subject (hours) bei Teacher
      /^(.+?)\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/,
      // Förder pattern: Subject Förder ... (hours) bei Teacher
      /^(.+?)\s+Förder.+?\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/,
      // Semester-specific pattern: Subject 1./2. Hj. (hours) bei Teacher
      /^(.+?)\s+[12]\.\s*Hj\.\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const subject = match[1].trim();
        const hours = parseFloat(match[2].replace(',', '.'));
        const teacher = match[3].trim();
        
        const isSupplementary = subject.toLowerCase().includes('förder') || 
                               subject.toLowerCase().includes('sol') ||
                               subject.toLowerCase().includes('ag');

        return {
          className,
          semester,
          subject: this.normalizeSubjectName(subject),
          hours,
          teacherShortName: teacher,
          isSupplementary
        };
      }
    }

    return null;
  }

  private normalizeSubjectName(subject: string): string {
    // Clean up subject names
    let normalized = subject
      .replace(/\s+Förder.*$/i, '') // Remove "Förder 1. Hj." etc.
      .replace(/\s+[12]\.\s*Hj\..*$/i, '') // Remove "1. Hj." etc.
      .trim();

    // Map common subject variations
    const subjectMappings: { [key: string]: string } = {
      'Deutsch': 'Deutsch',
      'Englisch': 'Englisch',
      'Mathematik': 'Mathematik',
      'Politik': 'Politik',
      'Erdkunde': 'Erdkunde',
      'Geschichte': 'Geschichte',
      'Biologie': 'Biologie',
      'Physik': 'Physik',
      'Chemie': 'Chemie',
      'Kunst': 'Kunst',
      'Musik': 'Musik',
      'Sport': 'Sport',
      'Informatik': 'Informatik',
      'SOL': 'Soziales Lernen',
      'kath. Religion': 'Katholische Religionslehre',
      'Evangelische Religon': 'Evangelische Religionslehre', // Note: "Religon" in source
      'Praktische Philosophie': 'Praktische Philosophie'
    };

    return subjectMappings[normalized] || normalized;
  }
}