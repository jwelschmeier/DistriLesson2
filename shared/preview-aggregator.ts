import { z } from "zod";
import { SchoolYear, Teacher, Assignment } from "./schema";
import { 
  ClassPromotionPlan, 
  AssignmentDecision, 
  StudentPromotionPlan, 
  MigrationPreview,
  MigrationStatistics, 
  Conflict,
  migrationPreviewSchema,
  conflictSchema,
  migrationStatisticsSchema
} from "./migration-types";
import { 
  getSubjectAvailability,
  NRW_REALSCHULE_SUBJECT_GRADE_MAPPING 
} from "./subject-grade-mapping";
import { 
  getParallelGroupForSubject 
} from "./parallel-subjects";

/**
 * Preview Aggregator for German Realschule School Year Migration (Grades 5-10)
 * 
 * Comprehensive aggregation engine that combines:
 * - Class promotion plans (from class-promotion-planner.ts)
 * - Assignment migration decisions (from assignment-migration-planner.ts)  
 * - Student promotion plans (from student-promotion-planner.ts)
 * 
 * Features:
 * - Teacher workload analysis with hour deltas
 * - Break subject identification (Bio Grade 7, Physics Grade 9)
 * - Conflict aggregation and deduplication
 * - Statistics across all migration dimensions
 * - German education system compliance
 */

// ===== TEACHER WORKLOAD ANALYSIS TYPES =====

export const teacherWorkloadAnalysisSchema = z.object({
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  currentHours: z.number().min(0),
  projectedHours: z.number().min(0),
  hoursDelta: z.number(),
  assignmentChanges: z.object({
    auto: z.number().int().min(0),
    manual: z.number().int().min(0),
    impossible: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  subjectsOnBreak: z.array(z.string()),
  parallelSubjects: z.array(z.string()),
  conflicts: z.array(conflictSchema),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export const aggregationOptionsSchema = z.object({
  includeWorkloadAnalysis: z.boolean().optional().default(true),
  calculateHourDeltas: z.boolean().optional().default(true),
  detectBreakSubjects: z.boolean().optional().default(true),
  deduplicateConflicts: z.boolean().optional().default(true),
  sortResults: z.boolean().optional().default(true),
});

export type TeacherWorkloadAnalysis = z.infer<typeof teacherWorkloadAnalysisSchema>;
export type AggregationOptions = z.infer<typeof aggregationOptionsSchema>;

// ===== CONSTANTS =====

/**
 * Break subjects with known grade transitions in NRW Realschule
 */
export const BREAK_SUBJECTS: Record<string, number[]> = {
  'Biologie': [7], // Biology reduced in Grade 7
  'Physik': [9],   // Physics reduced in Grade 9
  'Chemie': [8],   // Chemistry starts in Grade 8 (intro break)
};

/**
 * Risk thresholds for teacher workload changes
 */
export const RISK_THRESHOLDS = {
  LOW_DELTA: 2,    // ±2 hours = low risk
  HIGH_DELTA: 5,   // ±5 hours = high risk
  HIGH_CONFLICT: 3, // 3+ conflicts = high risk
} as const;

/**
 * Priority weights for different migration decision types
 */
export const DECISION_WEIGHTS = {
  auto: 1.0,       // Full confidence
  manual: 0.7,     // Requires review
  impossible: 0.0, // No migration
} as const;

// ===== CORE AGGREGATION FUNCTION =====

/**
 * Main aggregation function that combines all migration components into a comprehensive preview
 */
export function aggregateMigrationPreview(
  classPromotions: ClassPromotionPlan[],
  assignmentDecisions: AssignmentDecision[],
  studentPromotions: StudentPromotionPlan[],
  fromYear: SchoolYear,
  toYear: SchoolYear,
  existingConflicts: Conflict[] = [],
  currentAssignments: Assignment[] = [],
  teachers: Teacher[] = [],
  options: AggregationOptions = {
    includeWorkloadAnalysis: true,
    calculateHourDeltas: true,
    detectBreakSubjects: true,
    deduplicateConflicts: true,
    sortResults: true,
  }
): MigrationPreview {
  const opts = aggregationOptionsSchema.parse(options);
  
  // Aggregate comprehensive statistics
  const statistics = calculateMigrationStatistics(
    classPromotions,
    assignmentDecisions,
    studentPromotions,
    existingConflicts
  );
  
  // Aggregate and deduplicate conflicts
  const aggregatedConflicts = opts.deduplicateConflicts 
    ? deduplicateConflicts([
        ...existingConflicts,
        ...extractConflictsFromDecisions(assignmentDecisions),
        ...extractConflictsFromPromotions(studentPromotions),
      ])
    : [
        ...existingConflicts,
        ...extractConflictsFromDecisions(assignmentDecisions),
        ...extractConflictsFromPromotions(studentPromotions),
      ];
  
  // Generate teacher workload analysis if requested
  const teacherWorkloadAnalysis = opts.includeWorkloadAnalysis
    ? calculateTeacherWorkloadAnalysis(
        assignmentDecisions,
        currentAssignments,
        teachers,
        aggregatedConflicts,
        opts
      )
    : [];
  
  // Sort results for consistent output
  const sortedClassPromotions = opts.sortResults 
    ? [...classPromotions].sort((a, b) => {
        if (a.oldGrade !== b.oldGrade) return a.oldGrade - b.oldGrade;
        return a.oldClassName.localeCompare(b.oldClassName);
      })
    : classPromotions;
    
  const sortedAssignmentDecisions = opts.sortResults
    ? [...assignmentDecisions].sort((a, b) => {
        if (a.oldGrade !== b.oldGrade) return a.oldGrade - b.oldGrade;
        if (a.oldClassName !== b.oldClassName) return a.oldClassName.localeCompare(b.oldClassName);
        return a.subjectShortName.localeCompare(b.subjectShortName);
      })
    : assignmentDecisions;
    
  const sortedStudentPromotions = opts.sortResults
    ? [...studentPromotions].sort((a, b) => {
        if (a.oldGrade !== b.oldGrade) return a.oldGrade - b.oldGrade;
        if (a.oldClassName !== b.oldClassName) return a.oldClassName.localeCompare(b.oldClassName);
        return a.studentName.localeCompare(b.studentName);
      })
    : studentPromotions;
  
  // Construct the final migration preview
  const preview: MigrationPreview = {
    fromYear: {
      id: fromYear.id,
      name: fromYear.name,
      startDate: fromYear.startDate,
      endDate: fromYear.endDate,
      isCurrent: fromYear.isCurrent,
    },
    toYear: {
      id: toYear.id,
      name: toYear.name,
      startDate: toYear.startDate,
      endDate: toYear.endDate,
      isCurrent: toYear.isCurrent,
    },
    classPromotions: sortedClassPromotions,
    assignmentDecisions: sortedAssignmentDecisions,
    studentPromotions: sortedStudentPromotions,
    statistics,
    conflicts: aggregatedConflicts,
  };
  
  // Validate the final preview against schema
  return migrationPreviewSchema.parse(preview);
}

// ===== STATISTICS CALCULATION =====

/**
 * Calculates comprehensive migration statistics across all dimensions
 * OPTIMIZED: Single-pass counting instead of multiple O(n) filter operations
 */
export function calculateMigrationStatistics(
  classPromotions: ClassPromotionPlan[],
  assignmentDecisions: AssignmentDecision[],
  studentPromotions: StudentPromotionPlan[],
  conflicts: Conflict[]
): MigrationStatistics {
  // OPTIMIZED: Single pass for class statistics
  const totalClasses = classPromotions.length;
  let classesPromoted = 0;
  let classesGraduated = 0;
  
  for (const promotion of classPromotions) {
    if (promotion.newGrade <= 10) classesPromoted++;
    if (promotion.oldGrade === 10) classesGraduated++;
  }
  
  // OPTIMIZED: Single pass for assignment statistics
  const totalAssignments = assignmentDecisions.length;
  let assignmentsAuto = 0;
  let assignmentsManual = 0;
  let assignmentsImpossible = 0;
  
  for (const decision of assignmentDecisions) {
    if (decision.decision === 'auto') assignmentsAuto++;
    else if (decision.decision === 'manual') assignmentsManual++;
    else if (decision.decision === 'impossible') assignmentsImpossible++;
  }
  
  // OPTIMIZED: Single pass for student statistics
  const totalStudents = studentPromotions.length;
  let studentsPromoted = 0;
  let studentsGraduated = 0;
  
  for (const promotion of studentPromotions) {
    if (promotion.status === 'promote') studentsPromoted++;
    else if (promotion.status === 'graduate') studentsGraduated++;
  }
  
  // OPTIMIZED: Single pass for conflict statistics
  let conflictsCount = 0;
  let warningsCount = 0;
  
  for (const conflict of conflicts) {
    if (conflict.severity === 'error') conflictsCount++;
    else if (conflict.severity === 'warning') warningsCount++;
  }
  
  const statistics: MigrationStatistics = {
    totalClasses,
    classesPromoted,
    classesGraduated,
    totalAssignments,
    assignmentsAuto,
    assignmentsManual,
    assignmentsImpossible,
    totalStudents,
    studentsPromoted,
    studentsGraduated,
    conflictsCount,
    warningsCount,
  };
  
  return migrationStatisticsSchema.parse(statistics);
}

// ===== TEACHER WORKLOAD ANALYSIS =====

/**
 * Calculates teacher workload analysis including hour deltas and risk assessment
 */
export function calculateTeacherWorkloadAnalysis(
  assignmentDecisions: AssignmentDecision[],
  currentAssignments: Assignment[],
  teachers: Teacher[],
  conflicts: Conflict[],
  options: AggregationOptions
): TeacherWorkloadAnalysis[] {
  const teacherMap = new Map<string, Teacher>();
  teachers.forEach(teacher => teacherMap.set(teacher.id, teacher));
  
  // Group assignments by teacher for analysis
  const currentByTeacher = new Map<string, Assignment[]>();
  currentAssignments.forEach(assignment => {
    if (!currentByTeacher.has(assignment.teacherId)) {
      currentByTeacher.set(assignment.teacherId, []);
    }
    currentByTeacher.get(assignment.teacherId)!.push(assignment);
  });
  
  const decisionsByTeacher = new Map<string, AssignmentDecision[]>();
  assignmentDecisions.forEach(decision => {
    if (!decisionsByTeacher.has(decision.teacherId)) {
      decisionsByTeacher.set(decision.teacherId, []);
    }
    decisionsByTeacher.get(decision.teacherId)!.push(decision);
  });
  
  const conflictsByTeacher = new Map<string, Conflict[]>();
  conflicts.forEach(conflict => {
    if (conflict.relatedType === 'teacher' && conflict.relatedId) {
      if (!conflictsByTeacher.has(conflict.relatedId)) {
        conflictsByTeacher.set(conflict.relatedId, []);
      }
      conflictsByTeacher.get(conflict.relatedId)!.push(conflict);
    }
  });
  
  const workloadAnalyses: TeacherWorkloadAnalysis[] = [];
  
  // Analyze each teacher with assignment decisions
  decisionsByTeacher.forEach((decisions, teacherId) => {
    const teacher = teacherMap.get(teacherId);
    if (!teacher) return;
    
    const currentTeacherAssignments = currentByTeacher.get(teacherId) || [];
    const currentHours = currentTeacherAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    
    // Calculate projected hours based on migration decisions
    const autoDecisions = decisions.filter(d => d.decision === 'auto');
    const projectedHours = autoDecisions.reduce((sum, d) => sum + d.hoursPerWeek, 0);
    const hoursDelta = projectedHours - currentHours;
    
    // Analyze assignment changes
    const assignmentChanges = {
      auto: decisions.filter(d => d.decision === 'auto').length,
      manual: decisions.filter(d => d.decision === 'manual').length,
      impossible: decisions.filter(d => d.decision === 'impossible').length,
      total: decisions.length,
    };
    
    // Identify subjects on break (require manual review)
    const subjectsOnBreak = options.detectBreakSubjects 
      ? identifyBreakSubjects(decisions)
      : [];
      
    // Identify parallel subjects
    const parallelSubjects = identifyParallelSubjects(decisions);
    
    // Get teacher-specific conflicts
    const teacherConflicts = conflictsByTeacher.get(teacherId) || [];
    
    // Assess risk level
    const riskLevel = assessTeacherRiskLevel(hoursDelta, assignmentChanges, teacherConflicts);
    
    const analysis: TeacherWorkloadAnalysis = {
      teacherId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      currentHours,
      projectedHours,
      hoursDelta,
      assignmentChanges,
      subjectsOnBreak,
      parallelSubjects,
      conflicts: teacherConflicts,
      riskLevel,
    };
    
    workloadAnalyses.push(analysis);
  });
  
  // Sort by risk level and hour delta for priority review
  return workloadAnalyses.sort((a, b) => {
    const riskOrder = { high: 3, medium: 2, low: 1 };
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[b.riskLevel] - riskOrder[a.riskLevel]; // High risk first
    }
    return Math.abs(b.hoursDelta) - Math.abs(a.hoursDelta); // Larger deltas first
  });
}

/**
 * Identifies subjects that are on break for specific teachers
 */
export function identifyBreakSubjects(decisions: AssignmentDecision[]): string[] {
  const breakSubjects: string[] = [];
  
  decisions.forEach(decision => {
    const subject = decision.subjectShortName;
    
    // Check if subject has known break years
    if (decision.decision === 'manual' && decision.reason) {
      // Look for break-related reasons
      if (decision.reason.includes('pausiert') || decision.reason.includes('reduziert')) {
        if (!breakSubjects.includes(subject)) {
          breakSubjects.push(subject);
        }
      }
    }
    
    // Check specific break subjects
    Object.entries(BREAK_SUBJECTS).forEach(([subjectName, breakGrades]) => {
      if (subject.includes(subjectName.substring(0, 3)) && decision.newGrade !== undefined) {
        if (breakGrades.includes(decision.newGrade)) {
          if (!breakSubjects.includes(subject)) {
            breakSubjects.push(subject);
          }
        }
      }
    });
  });
  
  return breakSubjects.sort();
}

/**
 * Identifies parallel group subjects for a teacher
 */
export function identifyParallelSubjects(decisions: AssignmentDecision[]): string[] {
  const parallelSubjects: string[] = [];
  
  decisions.forEach(decision => {
    if (decision.parallelGroup) {
      if (!parallelSubjects.includes(decision.subjectShortName)) {
        parallelSubjects.push(decision.subjectShortName);
      }
    }
  });
  
  return parallelSubjects.sort();
}

/**
 * Assesses risk level for teacher migration
 */
export function assessTeacherRiskLevel(
  hoursDelta: number,
  assignmentChanges: { auto: number; manual: number; impossible: number; total: number },
  conflicts: Conflict[]
): 'low' | 'medium' | 'high' {
  const errorConflicts = conflicts.filter(c => c.severity === 'error').length;
  const manualReviewNeeded = assignmentChanges.manual;
  const impossibleAssignments = assignmentChanges.impossible;
  
  // High risk conditions
  if (
    Math.abs(hoursDelta) >= RISK_THRESHOLDS.HIGH_DELTA ||
    errorConflicts >= RISK_THRESHOLDS.HIGH_CONFLICT ||
    impossibleAssignments > 0
  ) {
    return 'high';
  }
  
  // Medium risk conditions
  if (
    Math.abs(hoursDelta) >= RISK_THRESHOLDS.LOW_DELTA ||
    manualReviewNeeded > 0 ||
    conflicts.length > 0
  ) {
    return 'medium';
  }
  
  return 'low';
}

// ===== CONFLICT MANAGEMENT =====

/**
 * Extracts conflicts from assignment decisions
 */
export function extractConflictsFromDecisions(decisions: AssignmentDecision[]): Conflict[] {
  const conflicts: Conflict[] = [];
  
  decisions.forEach(decision => {
    if (decision.decision === 'impossible' || decision.decision === 'manual') {
      conflicts.push({
        type: 'mapping_error',
        severity: decision.decision === 'impossible' ? 'error' : 'warning',
        message: decision.reason || `${decision.decision === 'impossible' ? 'Unmögliche' : 'Manuelle'} Migration für ${decision.teacherName} - ${decision.subjectShortName} (${decision.oldClassName})`,
        relatedId: decision.teacherId,
        relatedType: 'teacher',
        suggestedResolution: decision.decision === 'impossible' 
          ? 'Assignment kann nicht migriert werden - manuelle Neuzuordnung erforderlich'
          : 'Manuelle Überprüfung und Anpassung erforderlich',
        affectedItems: [decision.assignmentId],
      });
    }
  });
  
  return conflicts;
}

/**
 * Extracts conflicts from student promotions
 */
export function extractConflictsFromPromotions(promotions: StudentPromotionPlan[]): Conflict[] {
  const conflicts: Conflict[] = [];
  
  promotions.forEach(promotion => {
    if (promotion.status === 'conflict') {
      conflicts.push({
        type: 'student_conflict',
        severity: 'error',
        message: promotion.reason || `Konflikt bei Schülerversetzung: ${promotion.studentName} (${promotion.oldClassName})`,
        relatedId: promotion.studentId,
        relatedType: 'student',
        suggestedResolution: 'Schülerversetzung manuell überprüfen und korrigieren',
        affectedItems: [promotion.studentId],
      });
    }
  });
  
  return conflicts;
}

/**
 * Deduplicates conflicts by type and relatedId
 */
export function deduplicateConflicts(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>();
  const deduped: Conflict[] = [];
  
  conflicts.forEach(conflict => {
    const key = `${conflict.type}:${conflict.relatedId || 'none'}:${conflict.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(conflict);
    }
  });
  
  // Sort by severity and type for consistent output
  return deduped.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1; // Errors first
    }
    return a.type.localeCompare(b.type);
  });
}

// ===== VALIDATION AND UTILITIES =====

/**
 * Validates the completeness of migration data
 */
export function validateMigrationCompleteness(preview: MigrationPreview): {
  isComplete: boolean;
  missingComponents: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  if (preview.classPromotions.length === 0) {
    missing.push('Keine Klassenversetzungen geplant');
  }
  
  if (preview.assignmentDecisions.length === 0) {
    missing.push('Keine Lehrerversetzungen geplant');
  }
  
  if (preview.studentPromotions.length === 0) {
    missing.push('Keine Schülerversetzungen geplant');
  }
  
  // Check for high-risk scenarios
  const errorConflicts = preview.conflicts.filter(c => c.severity === 'error');
  if (errorConflicts.length > 0) {
    warnings.push(`${errorConflicts.length} kritische Konflikte erfordern Aufmerksamkeit`);
  }
  
  const impossibleAssignments = preview.assignmentDecisions.filter(d => d.decision === 'impossible').length;
  if (impossibleAssignments > 0) {
    warnings.push(`${impossibleAssignments} Zuordnungen können nicht automatisch migriert werden`);
  }
  
  return {
    isComplete: missing.length === 0,
    missingComponents: missing,
    warnings,
  };
}

/**
 * Generates a summary report for migration preview
 */
export function generateMigrationSummary(preview: MigrationPreview): {
  overview: string;
  keyMetrics: Array<{ label: string; value: string | number; status: 'success' | 'warning' | 'error' }>;
  recommendations: string[];
} {
  const stats = preview.statistics;
  const conflicts = preview.conflicts;
  
  const overview = `Migration von ${preview.fromYear.name} nach ${preview.toYear.name} umfasst ${stats.totalClasses} Klassen, ${stats.totalAssignments} Zuordnungen und ${stats.totalStudents} Schüler.`;
  
  const keyMetrics: Array<{ label: string; value: string | number; status: 'success' | 'warning' | 'error' }> = [
    {
      label: 'Klassen befördert',
      value: `${stats.classesPromoted}/${stats.totalClasses}`,
      status: stats.classesPromoted === stats.totalClasses ? 'success' as const : 'warning' as const,
    },
    {
      label: 'Automatische Zuordnungen',
      value: `${stats.assignmentsAuto}/${stats.totalAssignments}`,
      status: stats.assignmentsAuto / stats.totalAssignments > 0.8 ? 'success' as const : 'warning' as const,
    },
    {
      label: 'Schüler befördert',
      value: `${stats.studentsPromoted}/${stats.totalStudents}`,
      status: stats.studentsPromoted === stats.totalStudents ? 'success' as const : 'warning' as const,
    },
    {
      label: 'Konflikte',
      value: stats.conflictsCount,
      status: stats.conflictsCount === 0 ? 'success' as const : stats.conflictsCount < 5 ? 'warning' as const : 'error' as const,
    },
  ];
  
  const recommendations: string[] = [];
  
  if (stats.assignmentsManual > 0) {
    recommendations.push(`${stats.assignmentsManual} Zuordnungen erfordern manuelle Überprüfung`);
  }
  
  if (stats.assignmentsImpossible > 0) {
    recommendations.push(`${stats.assignmentsImpossible} Zuordnungen können nicht migriert werden - Neuzuordnung erforderlich`);
  }
  
  if (conflicts.filter(c => c.severity === 'error').length > 0) {
    recommendations.push('Kritische Konflikte vor Migration beheben');
  }
  
  return {
    overview,
    keyMetrics,
    recommendations,
  };
}