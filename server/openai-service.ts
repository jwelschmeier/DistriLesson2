import OpenAI from "openai";
import { storage } from "./storage";
import { insertAssignmentSchema, insertTeacherSchema, insertClassSchema, insertSubjectSchema } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ParsedScheduleData {
  teachers: Array<{
    name: string;
    shortName: string;
    qualifications: string[];
  }>;
  classes: Array<{
    name: string;
    grade: number;
    studentCount: number;
  }>;
  subjects: Array<{
    name: string;
    shortName: string;
    category: string;
  }>;
  assignments: Array<{
    teacherShortName: string;
    className: string;
    subjectShortName: string;
    hoursPerWeek: number;
    semester: number;
  }>;
}

export class OpenAIHelpService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async getHelpResponse(userQuestion: string): Promise<string> {
    try {
      const systemPrompt = `Du bist ein hilfreicher Assistent für das deutsche Stundenplan-Verwaltungssystem "DistriLesson PLANNER". 

      Das System verwaltet:
      - Lehrer (mit Qualifikationen und Stundendeputaten)
      - Klassen (mit Schülerzahlen und Stundenvorgaben)
      - Fächer (mit Parallelgruppen für Religion/Differenzierung)
      - Stundenpläne und Zuweisungen
      - Planstellenberechnung nach deutschen Schulstandards
      - Master-Stundenplan mit Semester-Planung
      - CSV-Import für Massendaten
      - Admin-Panel für Benutzerverwaltung

      Hauptfunktionen:
      - Dashboard mit Übersichten
      - Lehrerverwaltung (Kürzel, Namen, Fächer, Deputate)
      - Klassenverwaltung (Jahrgänge, Schülerzahlen, Zielstunden)
      - Fächerverwaltung (auch mit Parallelgruppen)
      - Stundenplanoptimierung
      - Planstellenberechnung
      - Schuljahreswechsel
      - CSV/ChatGPT Import

      Antworte auf Deutsch in freundlichem Ton. Erkläre Funktionen, Prozesse und gib praktische Tipps für die Nutzung des Systems.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userQuestion
          }
        ],
        max_completion_tokens: 1000
      });

      return response.choices[0].message.content || "Entschuldigung, ich konnte keine Antwort generieren.";
    } catch (error) {
      console.error("OpenAI help error:", error);
      throw new Error(`Fehler beim Generieren der Hilfe-Antwort: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    }
  }
}

export class OpenAIScheduleService {
  /**
   * Normalize class names to match database format (e.g., "5a" -> "05A")
   */
  private normalizeClassName(className: string): string {
    if (!className || typeof className !== 'string') return className;
    
    // Extract grade (number) and class letters (supports multiple letters like "fs", "tk")
    const match = className.match(/^(\d{1,2})([a-zA-Z]*)$/);
    if (!match) return className;
    
    const [, grade, letter] = match;
    // Pad grade with leading zero if single digit, uppercase the letters
    const normalizedGrade = grade.padStart(2, '0');
    const normalizedLetter = letter.toUpperCase();
    
    return `${normalizedGrade}${normalizedLetter}`;
  }

  async parseScheduleText(scheduleText: string): Promise<ParsedScheduleData> {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    console.log("Parsing schedule text with OpenAI GPT-5...");
    
    // Intelligent input trimming - preserve structure
    const maxInputLength = 2000;
    let trimmedText = scheduleText;
    if (scheduleText.length > maxInputLength) {
      // Try to keep complete lines when trimming
      const lines = scheduleText.split('\n');
      let charCount = 0;
      let includedLines = [];
      
      for (const line of lines) {
        if (charCount + line.length + 1 <= maxInputLength) {
          includedLines.push(line);
          charCount += line.length + 1;
        } else {
          break;
        }
      }
      
      trimmedText = includedLines.join('\n') + (includedLines.length < lines.length ? '\n...(weitere Daten)' : '');
    }

    const prompt = `Analysiere diesen deutschen Stundenplan und extrahiere die Daten als JSON.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt in diesem Format:
{
  "teachers": [{"name": "Vollname oder null", "shortName": "ABC", "qualifications": ["D", "M"]}],
  "classes": [{"name": "5a", "grade": 5, "studentCount": null}],
  "subjects": [{"name": "Deutsch", "shortName": "D", "category": "Hauptfach"}],
  "assignments": [{"teacherShortName": "ABC", "className": "5a", "subjectShortName": "D", "hoursPerWeek": 4, "semester": 1}]
}

Wichtige Regeln:
- Lehrer-Kürzel sind meist 2-4 Buchstaben (z.B. "MÜL", "SCH")
- Klassen wie "5a", "10b", "Q1" normalisieren
- Semester: 1 = erstes Halbjahr, 2 = zweites Halbjahr

Fachkürzel (GENAU verwenden):
- PK = Politik (NICHT PP!)
- PP = Praktische Philosophie
- KR = Katholische Religion, ER = Evangelische Religion
- D = Deutsch, M = Mathe, E = Englisch
- FS = Französisch, SW = Sozialwissenschaften, NW = Naturwissenschaften
- IF = Informatik, TC = Technik
- BI = Biologie, CH = Chemie, PH = Physik
- GE = Geschichte, EK = Erdkunde
- KU = Kunst, MU = Musik, SP = Sport
- HW = Hauswirtschaft, TX = Textil

Stundenplan-Text:
${trimmedText}`;

    console.log("Prompt length:", prompt.length, "Input length:", scheduleText.length);
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Using GPT-4o for better reliability and token handling
        messages: [
          {
            role: "system",
            content: "Du bist ein Experte für deutsche Schulstundenpläne. Antworte ausschließlich mit validen JSON-Daten."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }, // Use JSON mode as per blueprint
        max_tokens: 4000, // Using max_tokens for GPT-4o compatibility
        temperature: 0.1 // Low temperature for consistent output
      });

      const content = response.choices[0].message.content;
      console.log("OpenAI Response:", {
        contentLength: content?.length || 0,
        finishReason: response.choices[0].finish_reason,
        hasContent: !!content
      });

      if (!content) {
        throw new Error("OpenAI returned empty response");
      }

      if (response.choices[0].finish_reason === 'length') {
        console.warn("Response was truncated, trying with shorter input...");
        // Retry with much shorter input
        const shorterText = scheduleText.substring(0, 800);
        return this.parseScheduleText(shorterText);
      }

      const parsedData = JSON.parse(content);
      
      // Validate structure
      if (!parsedData.teachers || !parsedData.classes || !parsedData.subjects || !parsedData.assignments) {
        throw new Error("Invalid data structure returned by OpenAI");
      }
      
      console.log("Successfully parsed:", {
        teachers: parsedData.teachers?.length || 0,
        classes: parsedData.classes?.length || 0,
        subjects: parsedData.subjects?.length || 0,
        assignments: parsedData.assignments?.length || 0
      });

      return parsedData as ParsedScheduleData;
    } catch (error) {
      console.error("OpenAI parsing error:", error);
      if (error instanceof SyntaxError) {
        throw new Error("Fehler beim Parsen der OpenAI Antwort. Die JSON-Antwort war unvollständig oder fehlerhaft.");
      }
      throw new Error("Fehler beim Parsen des Stundenplans mit ChatGPT: " + (error as Error).message);
    }
  }

  async importParsedData(parsedData: ParsedScheduleData): Promise<{
    teachers: number;
    classes: number;
    subjects: number;
    assignments: number;
    errors: string[];
  }> {
    const result = {
      teachers: 0,
      classes: 0,
      subjects: 0,
      assignments: 0,
      errors: [] as string[]
    };

    try {
      // PERFORMANCE OPTIMIZATION: Load all master data once before loops
      console.log('[PERF] Loading master data for ChatGPT import...');
      const [
        existingTeachers,
        existingClasses,
        existingSubjects,
        schoolYears,
        existingAssignments
      ] = await Promise.all([
        storage.getTeachers(),
        storage.getClasses(),
        storage.getSubjects(),
        storage.getSchoolYears(),
        storage.getAssignments()
      ]);

      // Find current school year
      const currentSchoolYear = schoolYears.find(sy => sy.isCurrent);
      if (!currentSchoolYear) {
        result.errors.push("Kein aktuelles Schuljahr gefunden. Import abgebrochen.");
        return result;
      }

      // PERFORMANCE OPTIMIZATION: Create lookup Maps for O(1) access
      const teachersByShortName = new Map(
        existingTeachers.map(t => [t.shortName, t])
      );
      const classesByName = new Map(
        existingClasses.map(c => [c.name, c])
      );
      const subjectsByShortName = new Map(
        existingSubjects.map(s => [s.shortName, s])
      );

      // PERFORMANCE OPTIMIZATION: Create duplicate detection Sets with composite keys
      const existingTeacherShortNames = new Set(
        existingTeachers.map(t => t.shortName)
      );
      const existingClassNames = new Set(
        existingClasses.map(c => c.name)
      );
      const existingSubjectShortNames = new Set(
        existingSubjects.map(s => s.shortName)
      );
      const existingAssignmentKeys = new Set(
        existingAssignments.map(a => 
          `${a.teacherId}-${a.classId}-${a.subjectId}-${a.schoolYearId}-${a.semester}`
        )
      );

      console.log('[PERF] Master data loaded:', {
        teachers: existingTeachers.length,
        classes: existingClasses.length,
        subjects: existingSubjects.length,
        assignments: existingAssignments.length
      });

      // 1. Import Teachers
      for (const teacherData of parsedData.teachers) {
        try {
          const shortName = teacherData.shortName || "";
          
          // OPTIMIZED: O(1) Set lookup instead of O(n) .find()
          if (existingTeacherShortNames.has(shortName)) {
            continue; // Teacher already exists, skip
          }

          // Handle null/undefined teacher names safely
          const fullName = teacherData.name || teacherData.shortName || "Unbekannt";
          const nameParts = fullName.split(' ');
          
          const validatedTeacher = insertTeacherSchema.parse({
            firstName: nameParts[0] || teacherData.shortName || "Unbekannt",
            lastName: nameParts.slice(1).join(' ') || "",
            shortName: shortName,
            email: `${shortName.toLowerCase()}@schule.de`,
            currentHours: "0",
            qualifications: teacherData.qualifications || [],
            notes: "Importiert via ChatGPT"
          });

          const newTeacher = await storage.createTeacher(validatedTeacher);
          result.teachers++;
          
          // Update lookup structures for subsequent operations
          teachersByShortName.set(shortName, newTeacher);
          existingTeacherShortNames.add(shortName);
        } catch (error) {
          result.errors.push(`Lehrer ${teacherData.shortName}: ${(error as Error).message}`);
        }
      }

      // 2. Import Classes
      for (const classData of parsedData.classes) {
        try {
          // Normalize class name to match database format (e.g., "5a" -> "05A")
          const normalizedClassName = this.normalizeClassName(classData.name);
          
          // OPTIMIZED: O(1) Set lookup instead of O(n) .find()
          if (existingClassNames.has(normalizedClassName)) {
            continue; // Class already exists, skip
          }
          
          const validatedClass = insertClassSchema.parse({
            name: normalizedClassName,
            type: "klasse",
            grade: classData.grade,
            studentCount: classData.studentCount || 25,
            subjectHours: {},
            targetHoursTotal: null,
            targetHoursSemester1: null,
            targetHoursSemester2: null,
            classTeacher1Id: null,
            classTeacher2Id: null,
            schoolYearId: null
          });

          const newClass = await storage.createClass(validatedClass);
          result.classes++;
          
          // Update lookup structures for subsequent operations
          classesByName.set(normalizedClassName, newClass);
          existingClassNames.add(normalizedClassName);
        } catch (error) {
          result.errors.push(`Klasse ${classData.name} (normalisiert zu ${this.normalizeClassName(classData.name)}): ${(error as Error).message}`);
        }
      }

      // 3. Import Subjects
      for (const subjectData of parsedData.subjects) {
        try {
          const shortName = subjectData.shortName;
          
          // OPTIMIZED: O(1) Set lookup instead of O(n) .find()
          if (existingSubjectShortNames.has(shortName)) {
            result.subjects++; // Count as processed
            continue;
          }
          
          const validatedSubject = insertSubjectSchema.parse({
            name: subjectData.name,
            shortName: shortName,
            category: subjectData.category || "Hauptfach",
            hoursPerWeek: {},
            parallelGroup: null
          });

          const newSubject = await storage.createSubject(validatedSubject);
          result.subjects++;
          
          // Update lookup structures for subsequent operations
          subjectsByShortName.set(shortName, newSubject);
          existingSubjectShortNames.add(shortName);
        } catch (error) {
          result.errors.push(`Fach ${subjectData.shortName}: ${(error as Error).message}`);
        }
      }

      // 4. Import Assignments
      for (const assignmentData of parsedData.assignments) {
        try {
          // Skip assignments with null/empty className (e.g., AGs without specific class)
          if (!assignmentData.className || assignmentData.className.trim() === '') {
            console.log(`Skipping assignment without class: ${assignmentData.teacherShortName} - ${assignmentData.subjectShortName}`);
            continue;
          }
          
          // Normalize class name for matching
          const normalizedClassName = this.normalizeClassName(assignmentData.className);
          
          // OPTIMIZED: O(1) Map lookups instead of O(n) .find()
          const teacher = teachersByShortName.get(assignmentData.teacherShortName);
          const classObj = classesByName.get(normalizedClassName);
          const subject = subjectsByShortName.get(assignmentData.subjectShortName);

          if (!teacher) {
            result.errors.push(`Lehrer mit Kürzel "${assignmentData.teacherShortName}" nicht gefunden`);
            continue;
          }
          if (!classObj) {
            result.errors.push(`Klasse "${assignmentData.className}" (normalisiert zu "${normalizedClassName}") nicht gefunden`);
            continue;
          }
          if (!subject) {
            result.errors.push(`Fach "${assignmentData.subjectShortName}" nicht gefunden`);
            continue;
          }

          // OPTIMIZED: O(1) Set lookup with composite key instead of O(n) .find()
          const semesterStr = (assignmentData.semester || 1).toString() as "1" | "2";
          const assignmentKey = `${teacher.id}-${classObj.id}-${subject.id}-${currentSchoolYear.id}-${semesterStr}`;
          
          if (existingAssignmentKeys.has(assignmentKey)) {
            continue; // Assignment already exists, skip
          }

          const validatedAssignment = insertAssignmentSchema.parse({
            teacherId: teacher.id,
            classId: classObj.id,
            subjectId: subject.id,
            schoolYearId: currentSchoolYear.id,
            hoursPerWeek: assignmentData.hoursPerWeek,
            semester: semesterStr,
            teamTeachingId: null
          });

          await storage.createAssignment(validatedAssignment);
          result.assignments++;
          
          // Update duplicate detection Set
          existingAssignmentKeys.add(assignmentKey);
        } catch (error) {
          const normalizedClassName = this.normalizeClassName(assignmentData.className);
          result.errors.push(`Zuweisung ${assignmentData.teacherShortName}-${assignmentData.className}(→${normalizedClassName})-${assignmentData.subjectShortName}: ${(error as Error).message}`);
        }
      }

      console.log('[PERF] ChatGPT import completed:', result);
      return result;
    } catch (error) {
      result.errors.push("Allgemeiner Import-Fehler: " + (error as Error).message);
      return result;
    }
  }
}

export const openaiScheduleService = new OpenAIScheduleService();