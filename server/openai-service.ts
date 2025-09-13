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

export class OpenAIScheduleService {
  async parseScheduleText(scheduleText: string): Promise<ParsedScheduleData> {
    const prompt = `
Du bist ein Experte für deutsche Stundenpläne und SCHILD NRW Datenstrukturen. 
Analysiere den folgenden Stundenplan-Text und extrahiere alle relevanten Informationen.

WICHTIGE REGELN:
1. Lehrer-Kürzel sind normalerweise 2-4 Buchstaben (z.B. "MÜL", "SCH", "BRA")
2. Klassen-Namen folgen dem Format wie "5a", "10b", "Q1", "Q2" etc.
3. Fächer haben Standard-Abkürzungen wie "D", "M", "E", "BIO", "CH", "PH", "KU", "MU", "SP", "REL", "PP", "SoWi", "GE", "EK"
4. Stundenzahlen pro Woche sind normalerweise 1-6 Stunden
5. Semester: 1 = erstes Halbjahr, 2 = zweites Halbjahr

Gib die Daten in folgendem JSON-Format zurück:
{
  "teachers": [
    {
      "name": "Vollständiger Name",
      "shortName": "Kürzel",
      "qualifications": ["Fach1", "Fach2"]
    }
  ],
  "classes": [
    {
      "name": "5a",
      "grade": 5,
      "studentCount": 25
    }
  ],
  "subjects": [
    {
      "name": "Deutsch",
      "shortName": "D",
      "category": "Hauptfach"
    }
  ],
  "assignments": [
    {
      "teacherShortName": "MÜL",
      "className": "5a",
      "subjectShortName": "D",
      "hoursPerWeek": 4,
      "semester": 1
    }
  ]
}

STUNDENPLAN-TEXT:
${scheduleText}
`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "Du bist ein Experte für deutsche Schulstundenpläne. Antworte immer mit validen JSON-Daten."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.1
      });

      const parsedData = JSON.parse(response.choices[0].message.content!);
      return parsedData as ParsedScheduleData;
    } catch (error) {
      console.error("OpenAI parsing error:", error);
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
      // 1. Import Teachers
      for (const teacherData of parsedData.teachers) {
        try {
          const validatedTeacher = insertTeacherSchema.parse({
            firstName: teacherData.name.split(' ')[0] || "",
            lastName: teacherData.name.split(' ').slice(1).join(' ') || teacherData.name,
            shortName: teacherData.shortName,
            email: `${teacherData.shortName.toLowerCase()}@schule.de`,
            currentHours: "0",
            qualifications: teacherData.qualifications || [],
            notes: "Importiert via ChatGPT"
          });

          // Check if teacher already exists
          const existingTeachers = await storage.getTeachers();
          const exists = existingTeachers.find(t => t.shortName === teacherData.shortName);
          
          if (!exists) {
            await storage.createTeacher(validatedTeacher);
            result.teachers++;
          }
        } catch (error) {
          result.errors.push(`Lehrer ${teacherData.shortName}: ${(error as Error).message}`);
        }
      }

      // 2. Import Classes
      for (const classData of parsedData.classes) {
        try {
          const validatedClass = insertClassSchema.parse({
            name: classData.name,
            grade: classData.grade,
            studentCount: classData.studentCount || 25,
            subjectHours: {},
            targetHoursTotal: "",
            targetHoursSemester1: "",
            targetHoursSemester2: ""
          });

          const existingClasses = await storage.getClasses();
          const exists = existingClasses.find(c => c.name === classData.name);
          
          if (!exists) {
            await storage.createClass(validatedClass);
            result.classes++;
          }
        } catch (error) {
          result.errors.push(`Klasse ${classData.name}: ${(error as Error).message}`);
        }
      }

      // 3. Import Subjects
      for (const subjectData of parsedData.subjects) {
        try {
          const validatedSubject = insertSubjectSchema.parse({
            name: subjectData.name,
            shortName: subjectData.shortName,
            category: subjectData.category || "Hauptfach",
            hoursPerWeek: {},
            parallelGroup: null
          });

          const existingSubjects = await storage.getSubjects();
          const exists = existingSubjects.find(s => s.shortName === subjectData.shortName);
          
          if (!exists) {
            await storage.createSubject(validatedSubject);
            result.subjects++;
          }
        } catch (error) {
          result.errors.push(`Fach ${subjectData.shortName}: ${(error as Error).message}`);
        }
      }

      // 4. Import Assignments
      const teachers = await storage.getTeachers();
      const classes = await storage.getClasses();
      const subjects = await storage.getSubjects();
      const schoolYears = await storage.getSchoolYears();
      const currentSchoolYear = schoolYears.find(sy => sy.isCurrent);

      if (!currentSchoolYear) {
        result.errors.push("Kein aktuelles Schuljahr gefunden. Zuweisungen können nicht importiert werden.");
        return result;
      }

      // Get existing assignments to check for duplicates
      const existingAssignments = await storage.getAssignments();

      for (const assignmentData of parsedData.assignments) {
        try {
          const teacher = teachers.find(t => t.shortName === assignmentData.teacherShortName);
          const classObj = classes.find(c => c.name === assignmentData.className);
          const subject = subjects.find(s => s.shortName === assignmentData.subjectShortName);

          if (!teacher) {
            result.errors.push(`Lehrer mit Kürzel "${assignmentData.teacherShortName}" nicht gefunden`);
            continue;
          }
          if (!classObj) {
            result.errors.push(`Klasse "${assignmentData.className}" nicht gefunden`);
            continue;
          }
          if (!subject) {
            result.errors.push(`Fach "${assignmentData.subjectShortName}" nicht gefunden`);
            continue;
          }

          // Check for duplicate assignment
          const exists = existingAssignments.find(a => 
            a.teacherId === teacher.id &&
            a.classId === classObj.id &&
            a.subjectId === subject.id &&
            a.schoolYearId === currentSchoolYear.id &&
            a.semester === (assignmentData.semester || 1)
          );

          if (exists) {
            result.errors.push(`Zuweisung ${assignmentData.teacherShortName}-${assignmentData.className}-${assignmentData.subjectShortName} existiert bereits`);
            continue;
          }

          const validatedAssignment = insertAssignmentSchema.parse({
            teacherId: teacher.id,
            classId: classObj.id,
            subjectId: subject.id,
            schoolYearId: currentSchoolYear.id,
            hoursPerWeek: assignmentData.hoursPerWeek.toString(),
            semester: assignmentData.semester || 1,
            teamTeachingId: null
          });

          await storage.createAssignment(validatedAssignment);
          result.assignments++;
        } catch (error) {
          result.errors.push(`Zuweisung ${assignmentData.teacherShortName}-${assignmentData.className}-${assignmentData.subjectShortName}: ${(error as Error).message}`);
        }
      }

      return result;
    } catch (error) {
      result.errors.push("Allgemeiner Import-Fehler: " + (error as Error).message);
      return result;
    }
  }
}

export const openaiScheduleService = new OpenAIScheduleService();