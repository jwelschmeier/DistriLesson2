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
      // Dynamically import pdfjs-dist legacy build for Node.js compatibility
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      // Extract text from PDF
      const text = await this.extractTextFromPDF(pdfBuffer, pdfjs);
      
      // Debug: Log extracted text to understand PDF structure
      console.log('DEBUG: Extracted PDF text (first 1000 chars):');
      console.log(text.substring(0, 1000));
      console.log('DEBUG: Total text length:', text.length);
      
      // Split into class sections
      const classSections = this.extractClassSections(text);
      console.log('DEBUG: Found class sections:', classSections.length);
      classSections.forEach((section, index) => {
        console.log(`DEBUG: Section ${index}:`, section.substring(0, 200));
      });
      
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
    
    // Split text by class headers using regex
    const classPattern = /Unterrichtsplan für Klasse (\d{2}[a-zA-Z])/g;
    const matches = Array.from(text.matchAll(classPattern));
    
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];
      
      const startIndex = currentMatch.index!;
      const endIndex = nextMatch ? nextMatch.index! : text.length;
      
      const sectionText = text.substring(startIndex, endIndex);
      sections.push(sectionText);
    }
    
    return sections;
  }

  private isClassHeader(line: string): boolean {
    return line.includes('Unterrichtsplan für Klasse') || 
           !!(line.match(/^\d{2}[a-zA-Z]$/)) || // e.g., "05a"
           !!(line.match(/Klasse \d{2}[a-zA-Z]/));
  }

  private parseClassSection(section: string): ParsedClassPlan | null {
    // Extract class name from the section
    const classMatch = section.match(/Unterrichtsplan für Klasse (\d{2}[a-zA-Z])/);
    if (!classMatch) return null;
    
    const className = classMatch[1];
    const lessons: ParsedLesson[] = [];
    const teachers: string[] = [];

    // Split into semester sections
    const semesterSections = section.split(/(?=[12]\.\s*Halbjahr)/);
    
    for (const semesterSection of semesterSections) {
      let currentSemester = 1;
      
      // Determine semester
      if (semesterSection.includes('2. Halbjahr')) {
        currentSemester = 2;
      } else if (semesterSection.includes('1. Halbjahr')) {
        currentSemester = 1;
      } else {
        continue; // Skip sections without semester info
      }
      
      // Find all subject lines in this semester section
      const subjectPattern = /([^()]+?)\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})/g;
      let match;
      
      while ((match = subjectPattern.exec(semesterSection)) !== null) {
        const subject = match[1].trim();
        const hours = parseFloat(match[2].replace(',', '.'));
        const teacher = match[3].trim();
        
        const isSupplementary = subject.toLowerCase().includes('förder') || 
                               subject.toLowerCase().includes('sol') ||
                               subject.toLowerCase().includes('ag');

        lessons.push({
          className,
          semester: currentSemester,
          subject: this.normalizeSubjectName(subject),
          hours,
          teacherShortName: teacher,
          isSupplementary
        });
      }
    }

    // Extract teacher list
    const teacherMatch = section.match(/Lehrkräfte:\s*(.+?)$/m);
    if (teacherMatch) {
      teachers.push(...teacherMatch[1].split(',').map(t => t.trim()));
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
    // Clean up line: normalize whitespace and trim
    const cleanLine = line.replace(/\s+/g, ' ').trim();
    
    // Patterns to match (adjusted for cleaned text):
    // "Deutsch (4 Stunden) bei NOL"
    // "Deutsch Förder 1. Hj. (1 Stunde) bei NOL"
    // "SOL 1. Hj. (1 Stunde) bei KAU"
    
    const patterns = [
      // Standard pattern: Subject (hours) bei Teacher
      /^(.+?)\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/,
      // Semester-specific pattern: Subject 1./2. Hj. (hours) bei Teacher  
      /^(.+?)\s+[12]\.\s*Hj\.\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/,
      // Förder pattern: Subject Förder ... (hours) bei Teacher
      /^(.+?)\s+Förder.+?\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/
    ];

    for (const pattern of patterns) {
      const match = cleanLine.match(pattern);
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

  // Static method to normalize subject names for consistent matching
  static normalizeSubjectName(subject: string): string {
    // Clean up subject names - remove semester and Förder suffixes
    let normalized = subject
      .replace(/\s+Förder.*$/i, '') // Remove "Förder 1. Hj." etc.
      .replace(/\s+[12]\.\s*Hj\..*$/i, '') // Remove "1. Hj." etc.
      .trim()
      .toLowerCase(); // Normalize to lowercase for matching

    // Handle common variations and typos
    const normalizations: { [key: string]: string } = {
      'evangelische religon': 'evangelische religion', // Fix common typo
      'kath. religion': 'katholische religion',
      'kath religion': 'katholische religion',
      'ev. religion': 'evangelische religion',
      'ev religion': 'evangelische religion',
      'sol': 'soziales lernen',
      'pp': 'praktische philosophie',
      'haus- wirtschaft': 'hauswirtschaft',
      'hauswirtschaft': 'hauswirtschaft'
    };

    return normalizations[normalized] || normalized;
  }

  private normalizeSubjectName(subject: string): string {
    return PdfLessonParser.normalizeSubjectName(subject);
  }
}