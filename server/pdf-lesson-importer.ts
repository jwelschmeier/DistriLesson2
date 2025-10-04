import { PdfLessonParser, ParsedLesson, PdfParseResult } from './pdf-lesson-parser.js';
import { IStorage } from './storage.js';
import { Teacher, Subject, Class, Assignment, InsertAssignment } from '@shared/schema.js';
import { IntelligentMappingService, MappingConflict } from './intelligent-mapping-service.js';

export interface ImportMatch {
  className: string;
  classId: string | null;
  teacherShortName: string;
  teacherId: string | null;
  subjectName: string;
  subjectId: string | null;
}

export interface ImportConflict {
  type: 'class_not_found' | 'teacher_not_found' | 'subject_not_found' | 'duplicate_assignment' | 'intelligent_mapping_conflict';
  message: string;
  suggestion?: string;
  data: any;
  mappingConflict?: MappingConflict;
}

export interface ImportPreview {
  matches: ImportMatch[];
  conflicts: ImportConflict[];
  lessons: ParsedLesson[];
  summary: {
    totalLessons: number;
    matchedClasses: number;
    matchedTeachers: number;
    matchedSubjects: number;
    conflicts: number;
  };
}

export class PdfLessonImporter {
  private intelligentMapping: IntelligentMappingService;

  constructor(
    private storage: IStorage,
    private parser: PdfLessonParser
  ) {
    this.intelligentMapping = new IntelligentMappingService();
  }

  async previewImport(pdfBuffer: Buffer, schoolYearId: string): Promise<ImportPreview> {
    // Parse PDF
    const parseResult = await this.parser.parsePDF(pdfBuffer);
    
    if (parseResult.errors.length > 0) {
      throw new Error(`PDF-Parse-Fehler: ${parseResult.errors.join(', ')}`);
    }

    // Get existing data
    const [existingClasses, existingTeachers, existingSubjects, existingAssignments] = await Promise.all([
      this.storage.getClassesBySchoolYear(schoolYearId),
      this.storage.getTeachers(),
      this.storage.getSubjects(),
      this.storage.getAssignmentsBySchoolYear(schoolYearId)
    ]);

    // Create lookup maps
    const classMap = this.createClassMap(existingClasses);
    const teacherMap = this.createTeacherMap(existingTeachers);
    const subjectMap = this.createSubjectMap(existingSubjects);

    // PERFORMANCE OPTIMIZATION: Create Set for O(1) duplicate assignment detection
    const existingAssignmentKeys = new Set(
      existingAssignments.map(a => 
        `${a.classId}-${a.teacherId}-${a.subjectId}-${a.semester}`
      )
    );

    const matches: ImportMatch[] = [];
    const conflicts: ImportConflict[] = [];
    const allLessons: ParsedLesson[] = [];
    
    // PERFORMANCE OPTIMIZATION: Incremental summary counters instead of post-processing filters
    let matchedClassesCount = 0;
    let matchedTeachersCount = 0;
    let matchedSubjectsCount = 0;

    // Process each class
    for (const classData of parseResult.classes) {
      for (const lesson of classData.lessons) {
        allLessons.push(lesson);

        const match: ImportMatch = {
          className: lesson.className,
          classId: null,
          teacherShortName: lesson.teacherShortName,
          teacherId: null,
          subjectName: lesson.subject,
          subjectId: null
        };

        // Match class
        const normalizedClassName = this.normalizeClassName(lesson.className);
        const matchedClass = classMap.get(normalizedClassName);
        if (matchedClass) {
          match.classId = matchedClass.id;
          matchedClassesCount++; // OPTIMIZED: Increment counter instead of filtering later
        } else {
          conflicts.push({
            type: 'class_not_found',
            message: `Klasse "${lesson.className}" nicht im System gefunden`,
            suggestion: this.suggestSimilarClass(lesson.className, existingClasses),
            data: { className: lesson.className }
          });
        }

        // Match teacher
        const matchedTeacher = teacherMap.get(lesson.teacherShortName.toUpperCase());
        if (matchedTeacher) {
          match.teacherId = matchedTeacher.id;
          matchedTeachersCount++; // OPTIMIZED: Increment counter instead of filtering later
        } else {
          conflicts.push({
            type: 'teacher_not_found',
            message: `Lehrkraft "${lesson.teacherShortName}" nicht im System gefunden`,
            suggestion: this.suggestSimilarTeacher(lesson.teacherShortName, existingTeachers),
            data: { teacherShortName: lesson.teacherShortName }
          });
        }

        // Match subject using intelligent mapping
        const mappingResult = await this.intelligentMapping.mapSubject(lesson.subject, existingSubjects);
        if (mappingResult.autoResolved && mappingResult.subjectId) {
          match.subjectId = mappingResult.subjectId;
          matchedSubjectsCount++; // OPTIMIZED: Increment counter instead of filtering later
        } else if (mappingResult.conflict) {
          // Add intelligent mapping conflict
          conflicts.push({
            type: 'intelligent_mapping_conflict',
            message: `Fach "${lesson.subject}" konnte nicht eindeutig zugeordnet werden`,
            suggestion: mappingResult.conflict.possibleMatches.length > 0 
              ? `Mögliche Zuordnungen: ${mappingResult.conflict.possibleMatches.slice(0, 3).map(m => m.subject.name).join(', ')}`
              : 'Keine passenden Fächer gefunden',
            data: { subjectName: lesson.subject },
            mappingConflict: mappingResult.conflict
          });
        } else {
          // Fallback to old logic
          const matchedSubject = subjectMap.get(lesson.subject.toLowerCase());
          if (matchedSubject) {
            match.subjectId = matchedSubject.id;
            matchedSubjectsCount++; // OPTIMIZED: Increment counter instead of filtering later
          } else {
            conflicts.push({
              type: 'subject_not_found',
              message: `Fach "${lesson.subject}" nicht im System gefunden`,
              suggestion: this.suggestSimilarSubject(lesson.subject, existingSubjects),
              data: { subjectName: lesson.subject }
            });
          }
        }

        // OPTIMIZED: O(1) Set lookup with composite key instead of O(n) .find()
        if (match.classId && match.teacherId && match.subjectId) {
          const semesterStr = lesson.semester.toString() as "1" | "2";
          const assignmentKey = `${match.classId}-${match.teacherId}-${match.subjectId}-${semesterStr}`;
          
          if (existingAssignmentKeys.has(assignmentKey)) {
            conflicts.push({
              type: 'duplicate_assignment',
              message: `Zuweisung bereits vorhanden: ${lesson.subject} bei ${lesson.teacherShortName} für Klasse ${lesson.className} (Semester ${lesson.semester})`,
              data: { 
                lesson,
                existingAssignment: null, // Not needed for duplicate detection
                action: 'update_or_skip'
              }
            });
          }
        }

        matches.push(match);
      }
    }

    // OPTIMIZED: Use pre-computed counters instead of O(n) filter operations
    const summary = {
      totalLessons: allLessons.length,
      matchedClasses: matchedClassesCount,
      matchedTeachers: matchedTeachersCount,
      matchedSubjects: matchedSubjectsCount,
      conflicts: conflicts.length
    };

    return {
      matches,
      conflicts,
      lessons: allLessons,
      summary
    };
  }

  async applyImport(
    lessons: ParsedLesson[], 
    resolutions: { [key: string]: string }, 
    schoolYearId: string
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    // Get current data for final validation
    const [existingClasses, existingTeachers, existingSubjects] = await Promise.all([
      this.storage.getClassesBySchoolYear(schoolYearId),
      this.storage.getTeachers(),
      this.storage.getSubjects()
    ]);

    const classMap = this.createClassMap(existingClasses);
    const teacherMap = this.createTeacherMap(existingTeachers);
    const subjectMap = this.createSubjectMap(existingSubjects);

    for (const lesson of lessons) {
      try {
        // Apply resolutions
        const resolvedClassName = resolutions[`class_${lesson.className}`] || lesson.className;
        const resolvedTeacherShortName = resolutions[`teacher_${lesson.teacherShortName}`] || lesson.teacherShortName;
        const resolvedSubjectName = resolutions[`subject_${lesson.subject}`] || lesson.subject;

        // Find final IDs
        const classId = classMap.get(this.normalizeClassName(resolvedClassName))?.id;
        const teacherId = teacherMap.get(resolvedTeacherShortName.toUpperCase())?.id;
        const subjectId = subjectMap.get(resolvedSubjectName.toLowerCase())?.id;

        if (!classId || !teacherId || !subjectId) {
          errors.push(`Unvollständige Zuordnung für ${lesson.subject} bei ${lesson.teacherShortName} in Klasse ${lesson.className}`);
          skipped++;
          continue;
        }

        // Create assignment
        const assignment: InsertAssignment = {
          teacherId,
          subjectId,
          classId,
          schoolYearId,
          semester: lesson.semester.toString() as "1" | "2",
          hoursPerWeek: lesson.hours.toString()
        };

        await this.storage.createAssignment(assignment);
        imported++;

      } catch (error: any) {
        errors.push(`Fehler beim Import von ${lesson.subject}: ${error?.message || 'Unbekannter Fehler'}`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  }

  private createClassMap(classes: Class[]): Map<string, Class> {
    const map = new Map<string, Class>();
    for (const cls of classes) {
      const normalized = this.normalizeClassName(cls.name);
      map.set(normalized, cls);
    }
    return map;
  }

  private createTeacherMap(teachers: Teacher[]): Map<string, Teacher> {
    const map = new Map<string, Teacher>();
    for (const teacher of teachers) {
      map.set(teacher.shortName.toUpperCase(), teacher);
    }
    return map;
  }

  private createSubjectMap(subjects: Subject[]): Map<string, Subject> {
    const map = new Map<string, Subject>();
    for (const subject of subjects) {
      // Add by name
      map.set(subject.name.toLowerCase(), subject);
      // Add by shortName if available
      if (subject.shortName) {
        map.set(subject.shortName.toLowerCase(), subject);
      }
    }
    return map;
  }

  private normalizeClassName(className: string): string {
    return className.toUpperCase().trim();
  }

  private suggestSimilarClass(target: string, classes: Class[]): string {
    const normalized = this.normalizeClassName(target);
    for (const cls of classes) {
      const clsNormalized = this.normalizeClassName(cls.name);
      if (clsNormalized.includes(normalized.substring(0, 2)) || normalized.includes(clsNormalized.substring(0, 2))) {
        return cls.name;
      }
    }
    return '';
  }

  private suggestSimilarTeacher(target: string, teachers: Teacher[]): string {
    const targetUpper = target.toUpperCase();
    for (const teacher of teachers) {
      if (teacher.shortName.toUpperCase().includes(targetUpper) || targetUpper.includes(teacher.shortName.toUpperCase())) {
        return teacher.shortName;
      }
    }
    return '';
  }

  private suggestSimilarSubject(target: string, subjects: Subject[]): string {
    const targetLower = target.toLowerCase();
    for (const subject of subjects) {
      if (subject.name.toLowerCase().includes(targetLower) || targetLower.includes(subject.name.toLowerCase())) {
        return subject.name;
      }
      if (subject.shortName && (subject.shortName.toLowerCase().includes(targetLower) || targetLower.includes(subject.shortName.toLowerCase()))) {
        return subject.name;
      }
    }
    return '';
  }
}