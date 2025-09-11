import { z } from "zod";
import { Student } from "./schema";
import { 
  ClassPromotionPlan, 
  StudentPromotionPlan, 
  Conflict, 
  studentPromotionPlanSchema,
  conflictSchema 
} from "./migration-types";

/**
 * Student Promotion Planner for German Realschule (Grades 5-10)
 * 
 * Handles automatic promotion of students from one school year to the next:
 * - Grades 5-9: Promote to next grade (5→6, 6→7, ..., 9→10)
 * - Grade 10: Graduate (no promotion, students receive Mittlere Reife)
 * 
 * Features:
 * - Class-based promotion mapping
 * - German education system compliance
 * - Conflict detection and resolution suggestions
 * - Comprehensive statistics tracking
 */

// ===== TYPES AND SCHEMAS =====

export const studentPromotionOptionsSchema = z.object({
  handleOrphanedStudents: z.boolean().optional().default(true),
  allowOvercrowding: z.boolean().optional().default(false),
  maxClassSize: z.number().int().min(1).max(40).optional().default(30),
  preserveStudentClassGroups: z.boolean().optional().default(true),
  graduateGrade10: z.boolean().optional().default(true),
});

export const studentPromotionStatisticsSchema = z.object({
  totalStudents: z.number().int().min(0),
  studentsPromoted: z.number().int().min(0),
  studentsGraduated: z.number().int().min(0),
  studentsWithConflicts: z.number().int().min(0),
  byGrade: z.record(z.string(), z.object({
    promoted: z.number().int().min(0),
    graduated: z.number().int().min(0),
    conflicts: z.number().int().min(0),
  })),
  promotionsByClass: z.record(z.string(), z.object({
    oldClassName: z.string(),
    newClassName: z.string().optional(),
    studentsPromoted: z.number().int().min(0),
    studentsGraduated: z.number().int().min(0),
  })),
});

export const studentPromotionResultSchema = z.object({
  promotions: z.array(studentPromotionPlanSchema),
  statistics: studentPromotionStatisticsSchema,
  conflicts: z.array(conflictSchema),
});

export type StudentPromotionOptions = z.infer<typeof studentPromotionOptionsSchema>;
export type StudentPromotionStatistics = z.infer<typeof studentPromotionStatisticsSchema>;
export type StudentPromotionResult = z.infer<typeof studentPromotionResultSchema>;

// ===== CONSTANTS =====

/**
 * Valid grade ranges for German Realschule
 */
export const VALID_STUDENT_GRADES = {
  MIN: 5,
  MAX: 10,
  GRADUATION_GRADE: 10,
} as const;

/**
 * German education progression rules
 */
export const PROMOTION_RULES = {
  // Standard grade progression (5→6, 6→7, etc.)
  GRADE_PROGRESSION: {
    5: 6,
    6: 7,
    7: 8,
    8: 9,
    9: 10,
    10: null, // Grade 10 graduates (Mittlere Reife)
  },
  
  // Graduation certificate types
  GRADUATION_TYPES: {
    10: 'Mittlere Reife', // Standard Realschule graduation
  },
} as const;

/**
 * Student status descriptions for German context
 */
export const STUDENT_STATUS_DESCRIPTIONS = {
  promote: 'Versetzung in die nächste Jahrgangsstufe',
  graduate: 'Abschluss mit Mittlerer Reife',
  conflict: 'Konflikt - manuelle Bearbeitung erforderlich',
} as const;

// ===== HELPER FUNCTIONS =====

/**
 * Checks if a grade is valid for German Realschule
 */
export function isValidStudentGrade(grade: number): boolean {
  return grade >= VALID_STUDENT_GRADES.MIN && grade <= VALID_STUDENT_GRADES.MAX;
}

/**
 * Determines the promotion action for a student based on their current grade
 */
export function getStudentPromotionAction(grade: number): 'promote' | 'graduate' | 'invalid' {
  if (!isValidStudentGrade(grade)) {
    return 'invalid';
  }
  
  if (grade === VALID_STUDENT_GRADES.GRADUATION_GRADE) {
    return 'graduate';
  }
  
  return 'promote';
}

/**
 * Gets the target grade for promotion
 */
export function getPromotionTargetGrade(currentGrade: number): number | null {
  return PROMOTION_RULES.GRADE_PROGRESSION[currentGrade as keyof typeof PROMOTION_RULES.GRADE_PROGRESSION] || null;
}

/**
 * Creates a class promotion lookup map for efficient student-to-class mapping
 */
export function createClassPromotionMap(classPromotions: ClassPromotionPlan[]): Map<string, ClassPromotionPlan> {
  const map = new Map<string, ClassPromotionPlan>();
  
  classPromotions.forEach(promotion => {
    map.set(promotion.oldClassId, promotion);
  });
  
  return map;
}

/**
 * Generates a full student name for display purposes
 */
export function formatStudentName(student: Student): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

// ===== VALIDATION FUNCTIONS =====

/**
 * Validates student data for potential promotion issues
 */
export function validateStudentForPromotion(student: Student): Conflict[] {
  const conflicts: Conflict[] = [];
  const studentName = formatStudentName(student);
  
  // Check for missing or invalid grade
  if (!student.grade || !isValidStudentGrade(student.grade)) {
    conflicts.push({
      type: 'student_conflict',
      severity: 'error',
      message: `Schüler "${studentName}" hat eine ungültige Jahrgangsstufe: ${student.grade}`,
      relatedId: student.id,
      relatedType: 'student',
      suggestedResolution: 'Korrigieren Sie die Jahrgangsstufe auf einen Wert zwischen 5 und 10',
      affectedItems: [student.id],
    });
  }
  
  // Check for missing class assignment
  if (!student.classId) {
    conflicts.push({
      type: 'student_conflict',
      severity: 'error',
      message: `Schüler "${studentName}" ist keiner Klasse zugeordnet`,
      relatedId: student.id,
      relatedType: 'student',
      suggestedResolution: 'Weisen Sie den Schüler einer Klasse zu oder schließen Sie ihn von der Migration aus',
      affectedItems: [student.id],
    });
  }
  
  // Check for missing name parts
  if (!student.firstName?.trim() || !student.lastName?.trim()) {
    conflicts.push({
      type: 'student_conflict',
      severity: 'warning',
      message: `Schüler mit ID "${student.id}" hat unvollständige Namensangaben`,
      relatedId: student.id,
      relatedType: 'student',
      suggestedResolution: 'Vervollständigen Sie Vor- und Nachname des Schülers',
      affectedItems: [student.id],
    });
  }
  
  return conflicts;
}

/**
 * Detects conflicts when students cannot be promoted due to missing class mappings
 */
export function detectStudentPromotionConflicts(
  students: Student[],
  classPromotionMap: Map<string, ClassPromotionPlan>,
  options: StudentPromotionOptions
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  // Group students by class for analysis
  const studentsByClass = new Map<string, Student[]>();
  students.forEach(student => {
    if (!student.classId) return;
    
    if (!studentsByClass.has(student.classId)) {
      studentsByClass.set(student.classId, []);
    }
    studentsByClass.get(student.classId)!.push(student);
  });
  
  // Check each class for promotion issues
  studentsByClass.forEach((classStudents, classId) => {
    const promotion = classPromotionMap.get(classId);
    
    if (!promotion) {
      // No promotion plan for this class
      conflicts.push({
        type: 'mapping_error',
        severity: 'error',
        message: `Keine Klassenbeförderung geplant für Klasse mit ID "${classId}" (${classStudents.length} Schüler betroffen)`,
        relatedId: classId,
        relatedType: 'class',
        suggestedResolution: 'Erstellen Sie einen Beförderungsplan für diese Klasse oder migrieren Sie die Schüler manuell',
        affectedItems: classStudents.map(s => s.id),
      });
      return;
    }
    
    // Check for grade mismatch between students and class promotion
    const gradeIssues = classStudents.filter(student => student.grade !== promotion.oldGrade);
    if (gradeIssues.length > 0) {
      conflicts.push({
        type: 'mapping_error',
        severity: 'warning',
        message: `Jahrgangsstufen-Konflikt: ${gradeIssues.length} Schüler in Klasse "${promotion.oldClassName}" haben abweichende Jahrgangsstufen`,
        relatedId: classId,
        relatedType: 'class',
        suggestedResolution: 'Überprüfen Sie die Klassenzuordnungen oder korrigieren Sie die Jahrgangsstufen',
        affectedItems: gradeIssues.map(s => s.id),
      });
    }
    
    // Check for potential overcrowding (if limits are enabled)
    if (!options.allowOvercrowding && options.maxClassSize) {
      const promotingStudents = classStudents.filter(s => 
        getStudentPromotionAction(s.grade) === 'promote'
      );
      
      if (promotingStudents.length > options.maxClassSize) {
        conflicts.push({
          type: 'student_conflict',
          severity: 'warning',
          message: `Potenzielle Überfüllung: Klasse "${promotion.newClassName}" würde ${promotingStudents.length} Schüler erhalten (Limit: ${options.maxClassSize})`,
          relatedId: classId,
          relatedType: 'class',
          suggestedResolution: 'Erwägen Sie eine Klassenteilung oder erhöhen Sie das Klassenlimit',
          affectedItems: promotingStudents.map(s => s.id),
        });
      }
    }
  });
  
  return conflicts;
}

// ===== MAIN PLANNING FUNCTION =====

/**
 * Plans student promotions for the transition from one school year to the next
 * 
 * @param students Students in the source school year
 * @param classPromotions Class promotion plans (from class-promotion-planner)
 * @param fromYearId Source school year ID
 * @param toYearId Target school year ID
 * @param options Additional options for student promotion planning
 * @returns Student promotion plan with conflicts and statistics
 */
export function planStudentPromotions(
  students: Student[],
  classPromotions: ClassPromotionPlan[],
  fromYearId: string,
  toYearId: string,
  options: Partial<StudentPromotionOptions> = {}
): StudentPromotionResult {
  const defaultOptions = {
    handleOrphanedStudents: true,
    allowOvercrowding: false,
    maxClassSize: 30,
    preserveStudentClassGroups: true,
    graduateGrade10: true,
  };
  const opts = { ...defaultOptions, ...options };
  
  const promotions: StudentPromotionPlan[] = [];
  const conflicts: Conflict[] = [];
  const classPromotionMap = createClassPromotionMap(classPromotions);
  
  // Initialize statistics tracking
  let totalStudents = 0;
  let studentsPromoted = 0;
  let studentsGraduated = 0;
  let studentsWithConflicts = 0;
  
  const byGrade: Record<string, { promoted: number; graduated: number; conflicts: number }> = {};
  const promotionsByClass: Record<string, { 
    oldClassName: string; 
    newClassName?: string; 
    studentsPromoted: number; 
    studentsGraduated: number; 
  }> = {};
  
  // Initialize grade statistics
  for (let grade = VALID_STUDENT_GRADES.MIN; grade <= VALID_STUDENT_GRADES.MAX; grade++) {
    byGrade[grade.toString()] = { promoted: 0, graduated: 0, conflicts: 0 };
  }
  
  // Detect system-wide conflicts first
  const systemConflicts = detectStudentPromotionConflicts(students, classPromotionMap, opts);
  conflicts.push(...systemConflicts);
  
  // Process each student
  for (const student of students) {
    totalStudents++;
    const studentName = formatStudentName(student);
    const gradeStr = student.grade?.toString() || 'unknown';
    
    // Validate student data
    const studentConflicts = validateStudentForPromotion(student);
    conflicts.push(...studentConflicts);
    
    // Skip students with critical errors
    const hasErrors = studentConflicts.some(c => c.severity === 'error');
    if (hasErrors) {
      studentsWithConflicts++;
      if (byGrade[gradeStr]) {
        byGrade[gradeStr].conflicts++;
      }
      continue;
    }
    
    // Determine promotion action
    const action = getStudentPromotionAction(student.grade);
    
    if (action === 'invalid') {
      conflicts.push({
        type: 'student_conflict',
        severity: 'error',
        message: `Schüler "${studentName}" kann nicht befördert werden: ungültige Jahrgangsstufe ${student.grade}`,
        relatedId: student.id,
        relatedType: 'student',
        suggestedResolution: 'Korrigieren Sie die Jahrgangsstufe oder schließen Sie den Schüler von der Migration aus',
        affectedItems: [student.id],
      });
      
      studentsWithConflicts++;
      if (byGrade[gradeStr]) {
        byGrade[gradeStr].conflicts++;
      }
      continue;
    }
    
    // Handle graduation (Grade 10)
    if (action === 'graduate') {
      if (opts.graduateGrade10) {
        const promotion: StudentPromotionPlan = {
          studentId: student.id,
          studentName,
          oldClassId: student.classId || '',
          oldClassName: getClassNameFromPromotion(student.classId, classPromotionMap) || 'Unbekannte Klasse',
          oldGrade: student.grade,
          // No new class/grade for graduates
          status: 'graduate',
          reason: STUDENT_STATUS_DESCRIPTIONS.graduate,
        };
        
        promotions.push(promotion);
        studentsGraduated++;
        
        if (byGrade[gradeStr]) {
          byGrade[gradeStr].graduated++;
        }
        
        // Update class statistics
        updateClassStatistics(promotionsByClass, student, classPromotionMap, 'graduate');
      }
      continue;
    }
    
    // Handle promotion (Grades 5-9)
    if (action === 'promote') {
      const classPromotion = classPromotionMap.get(student.classId || '');
      
      if (!classPromotion) {
        // Orphaned student - no class promotion plan
        if (opts.handleOrphanedStudents) {
          conflicts.push({
            type: 'student_conflict',
            severity: 'error',
            message: `Schüler "${studentName}" kann nicht befördert werden: keine Klassenbeförderung für Klasse "${student.classId}"`,
            relatedId: student.id,
            relatedType: 'student',
            suggestedResolution: 'Erstellen Sie einen Klassenbeförderungsplan oder weisen Sie den Schüler manuell zu',
            affectedItems: [student.id],
          });
          
          const promotion: StudentPromotionPlan = {
            studentId: student.id,
            studentName,
            oldClassId: student.classId || '',
            oldClassName: 'Unbekannte Klasse',
            oldGrade: student.grade,
            status: 'conflict',
            reason: 'Keine Klassenbeförderung verfügbar',
          };
          
          promotions.push(promotion);
          studentsWithConflicts++;
          
          if (byGrade[gradeStr]) {
            byGrade[gradeStr].conflicts++;
          }
        }
        continue;
      }
      
      // Create promotion plan
      const targetGrade = getPromotionTargetGrade(student.grade);
      
      if (targetGrade === null) {
        conflicts.push({
          type: 'mapping_error',
          severity: 'error',
          message: `Ungültiger Beförderungsweg für Schüler "${studentName}" von Jahrgangsstufe ${student.grade}`,
          relatedId: student.id,
          relatedType: 'student',
          suggestedResolution: 'Überprüfen Sie die Jahrgangsstufe des Schülers',
          affectedItems: [student.id],
        });
        
        studentsWithConflicts++;
        if (byGrade[gradeStr]) {
          byGrade[gradeStr].conflicts++;
        }
        continue;
      }
      
      // Verify grade consistency with class promotion
      if (targetGrade !== classPromotion.newGrade) {
        conflicts.push({
          type: 'mapping_error',
          severity: 'warning',
          message: `Jahrgangsstufen-Konflikt für Schüler "${studentName}": erwartet ${targetGrade}, Klasse wird zu ${classPromotion.newGrade} befördert`,
          relatedId: student.id,
          relatedType: 'student',
          suggestedResolution: 'Überprüfen Sie die Konsistenz zwischen Schüler- und Klassenbeförderung',
          affectedItems: [student.id],
        });
      }
      
      const promotion: StudentPromotionPlan = {
        studentId: student.id,
        studentName,
        oldClassId: student.classId || '',
        oldClassName: classPromotion.oldClassName,
        oldGrade: student.grade,
        newClassId: generateNewClassId(classPromotion), // Would need implementation based on target year
        newClassName: classPromotion.newClassName,
        newGrade: targetGrade,
        status: 'promote',
        reason: STUDENT_STATUS_DESCRIPTIONS.promote,
      };
      
      promotions.push(promotion);
      studentsPromoted++;
      
      if (byGrade[gradeStr]) {
        byGrade[gradeStr].promoted++;
      }
      
      // Update class statistics
      updateClassStatistics(promotionsByClass, student, classPromotionMap, 'promote');
    }
  }
  
  // Compile final statistics
  const statistics: StudentPromotionStatistics = {
    totalStudents,
    studentsPromoted,
    studentsGraduated,
    studentsWithConflicts,
    byGrade,
    promotionsByClass,
  };
  
  return {
    promotions,
    statistics,
    conflicts,
  };
}

// ===== UTILITY FUNCTIONS =====

/**
 * Gets class name from promotion plan or returns fallback
 */
function getClassNameFromPromotion(
  classId: string | null,
  classPromotionMap: Map<string, ClassPromotionPlan>
): string | null {
  if (!classId) return null;
  const promotion = classPromotionMap.get(classId);
  return promotion?.oldClassName || null;
}

/**
 * Updates class-level statistics tracking
 */
function updateClassStatistics(
  promotionsByClass: Record<string, any>,
  student: Student,
  classPromotionMap: Map<string, ClassPromotionPlan>,
  action: 'promote' | 'graduate'
): void {
  const classId = student.classId;
  if (!classId) return;
  
  const classPromotion = classPromotionMap.get(classId);
  const key = classId;
  
  if (!promotionsByClass[key]) {
    promotionsByClass[key] = {
      oldClassName: classPromotion?.oldClassName || 'Unbekannte Klasse',
      newClassName: classPromotion?.newClassName,
      studentsPromoted: 0,
      studentsGraduated: 0,
    };
  }
  
  if (action === 'promote') {
    promotionsByClass[key].studentsPromoted++;
  } else if (action === 'graduate') {
    promotionsByClass[key].studentsGraduated++;
  }
}

/**
 * Generates a new class ID for the target year (placeholder implementation)
 * In production, this would create or reference the actual target class
 */
function generateNewClassId(classPromotion: ClassPromotionPlan): string {
  // This is a placeholder - in reality, you'd either:
  // 1. Reference an existing class ID in the target year
  // 2. Generate a new ID that will be created during migration execution
  return `${classPromotion.oldClassId}_promoted_to_${classPromotion.newGrade}`;
}

// ===== ANALYSIS FUNCTIONS =====

/**
 * Analyzes student promotion statistics by grade
 */
export function analyzePromotionsByGrade(
  statistics: StudentPromotionStatistics
): Array<{
  grade: number;
  totalStudents: number;
  promotionRate: number;
  graduationRate: number;
  conflictRate: number;
}> {
  const analysis = [];
  
  for (let grade = VALID_STUDENT_GRADES.MIN; grade <= VALID_STUDENT_GRADES.MAX; grade++) {
    const gradeData = statistics.byGrade[grade.toString()];
    const totalStudents = gradeData.promoted + gradeData.graduated + gradeData.conflicts;
    
    if (totalStudents > 0) {
      analysis.push({
        grade,
        totalStudents,
        promotionRate: gradeData.promoted / totalStudents,
        graduationRate: gradeData.graduated / totalStudents,
        conflictRate: gradeData.conflicts / totalStudents,
      });
    }
  }
  
  return analysis;
}

/**
 * Gets promotion summary for display purposes
 */
export function getPromotionSummary(result: StudentPromotionResult): {
  successRate: number;
  criticalConflicts: number;
  warnings: number;
  readyForExecution: boolean;
} {
  const { statistics, conflicts } = result;
  const totalProcessed = statistics.studentsPromoted + statistics.studentsGraduated;
  const successRate = statistics.totalStudents > 0 ? totalProcessed / statistics.totalStudents : 0;
  
  const criticalConflicts = conflicts.filter(c => c.severity === 'error').length;
  const warnings = conflicts.filter(c => c.severity === 'warning').length;
  
  return {
    successRate,
    criticalConflicts,
    warnings,
    readyForExecution: criticalConflicts === 0 && totalProcessed > 0,
  };
}