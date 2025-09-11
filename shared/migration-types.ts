import { z } from "zod";
import { SchoolYear, Teacher, Student, Class, Subject, Assignment } from "./schema";

// ===== ZOD SCHEMAS FOR VALIDATION =====

export const migrationPreviewRequestSchema = z.object({
  fromYearId: z.string().uuid("Ungültige Schuljahr-ID für Ausgangsjahr"),
  toYearId: z.string().uuid("Ungültige Schuljahr-ID für Zieljahr"),
  options: z.object({
    includeGraduating: z.boolean().optional().default(true),
    namingStrategy: z.enum(['auto', 'manual']).optional().default('auto'),
    preserveClassTeachers: z.boolean().optional().default(true),
  }).optional().default({}),
});

export const manualDecisionSchema = z.object({
  type: z.enum(['class_rename', 'assignment_override', 'student_placement']),
  itemId: z.string().uuid("Ungültige Item-ID"),
  resolution: z.object({
    newClassName: z.string().min(1).max(50).optional(),
    targetClassId: z.string().uuid().optional(),
    skip: z.boolean().optional(),
    graduate: z.boolean().optional(),
  }),
});

export const migrationExecuteRequestSchema = z.object({
  fromYearId: z.string().uuid("Ungültige Schuljahr-ID für Ausgangsjahr"),
  toYearId: z.string().uuid("Ungültige Schuljahr-ID für Zieljahr"),
  namingStrategy: z.enum(['auto', 'manual'], {
    errorMap: () => ({ message: "Benennungsstrategie muss 'auto' oder 'manual' sein" })
  }),
  manualDecisions: z.array(manualDecisionSchema).optional().default([]),
  options: z.object({
    createMissingSubjects: z.boolean().optional().default(false),
    preserveInactiveTeachers: z.boolean().optional().default(false),
  }).optional().default({}),
});

export const classPromotionPlanSchema = z.object({
  oldClassId: z.string().uuid(),
  oldClassName: z.string(),
  oldGrade: z.number().int().min(5).max(10),
  newClassName: z.string().min(1).max(50),
  newGrade: z.number().int().min(5).max(10),
  subjectHours: z.record(z.string(), z.number().min(0)),
  teacherIds: z.array(z.string().uuid()),
  studentCount: z.number().int().min(0),
  classTeacher1Id: z.string().uuid().nullable().optional(),
  classTeacher2Id: z.string().uuid().nullable().optional(),
});

export const assignmentDecisionSchema = z.object({
  assignmentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  subjectShortName: z.string(),
  oldClassId: z.string().uuid(),
  oldClassName: z.string(),
  oldGrade: z.number().int().min(5).max(10),
  newClassId: z.string().uuid().optional(),
  newClassName: z.string().optional(),
  newGrade: z.number().int().min(5).max(10).optional(),
  hoursPerWeek: z.number().min(0.5).max(10),
  semester: z.enum(['1', '2']),
  decision: z.enum(['auto', 'manual', 'impossible']),
  reason: z.string().optional(),
  migrationRule: z.enum(['auto', 'manual', 'impossible']).optional(),
  parallelGroup: z.string().nullable().optional(),
  parallelSubjects: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
});

export const studentPromotionPlanSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string(),
  oldClassId: z.string().uuid(),
  oldClassName: z.string(),
  oldGrade: z.number().int().min(5).max(10),
  newClassId: z.string().uuid().optional(),
  newClassName: z.string().optional(),
  newGrade: z.number().int().min(5).max(10).optional(),
  status: z.enum(['promote', 'graduate', 'conflict']),
  reason: z.string().optional(),
});

export const migrationStatisticsSchema = z.object({
  totalClasses: z.number().int().min(0),
  classesPromoted: z.number().int().min(0),
  classesGraduated: z.number().int().min(0),
  totalAssignments: z.number().int().min(0),
  assignmentsAuto: z.number().int().min(0),
  assignmentsManual: z.number().int().min(0),
  assignmentsImpossible: z.number().int().min(0),
  totalStudents: z.number().int().min(0),
  studentsPromoted: z.number().int().min(0),
  studentsGraduated: z.number().int().min(0),
  conflictsCount: z.number().int().min(0),
  warningsCount: z.number().int().min(0),
});

export const conflictSchema = z.object({
  type: z.enum(['class_name_collision', 'missing_subject', 'inactive_teacher', 'mapping_error', 'student_conflict']),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  relatedId: z.string().uuid().optional(),
  relatedType: z.enum(['class', 'teacher', 'student', 'assignment', 'subject']).optional(),
  suggestedResolution: z.string().optional(),
  affectedItems: z.array(z.string()).optional(),
});

export const migrationPreviewSchema = z.object({
  fromYear: z.object({
    id: z.string().uuid(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isCurrent: z.boolean(),
  }),
  toYear: z.object({
    id: z.string().uuid(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isCurrent: z.boolean(),
  }),
  classPromotions: z.array(classPromotionPlanSchema),
  assignmentDecisions: z.array(assignmentDecisionSchema),
  studentPromotions: z.array(studentPromotionPlanSchema),
  statistics: migrationStatisticsSchema,
  conflicts: z.array(conflictSchema),
});

export const migrationExecuteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  createdClasses: z.number().int().min(0),
  createdAssignments: z.number().int().min(0),
  movedStudents: z.number().int().min(0),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export const migrationContextSchema = z.object({
  fromYear: z.object({
    id: z.string().uuid(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isCurrent: z.boolean(),
  }),
  toYear: z.object({
    id: z.string().uuid(),
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isCurrent: z.boolean(),
  }),
  teachers: z.array(z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    shortName: z.string(),
    subjects: z.array(z.string()),
    isActive: z.boolean(),
  })),
  subjects: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    shortName: z.string(),
    category: z.string(),
  })),
  fromClasses: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    grade: z.number().int(),
    studentCount: z.number().int(),
  })),
  fromAssignments: z.array(z.object({
    id: z.string().uuid(),
    teacherId: z.string().uuid(),
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    hoursPerWeek: z.number(),
    semester: z.string(),
  })),
  fromStudents: z.array(z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    classId: z.string().uuid(),
    grade: z.number().int(),
  })),
});

// ===== TYPE INFERENCE FROM ZOD SCHEMAS =====

export type MigrationPreviewRequest = z.infer<typeof migrationPreviewRequestSchema>;
export type MigrationExecuteRequest = z.infer<typeof migrationExecuteRequestSchema>;
export type ManualDecision = z.infer<typeof manualDecisionSchema>;
export type ClassPromotionPlan = z.infer<typeof classPromotionPlanSchema>;
export type AssignmentDecision = z.infer<typeof assignmentDecisionSchema>;
export type StudentPromotionPlan = z.infer<typeof studentPromotionPlanSchema>;
export type MigrationStatistics = z.infer<typeof migrationStatisticsSchema>;
export type Conflict = z.infer<typeof conflictSchema>;
export type MigrationPreview = z.infer<typeof migrationPreviewSchema>;
export type MigrationExecuteResponse = z.infer<typeof migrationExecuteResponseSchema>;
export type MigrationContext = z.infer<typeof migrationContextSchema>;


// ===== ZOD SCHEMAS FOR UTILITY TYPES =====

export const migrationDecisionSummarySchema = z.object({
  category: z.enum(['Kernfächer', 'Gesellschaftslehre', 'Naturwissenschaften', 'Sport & Ästhetik', 'Religion', 'Differenzierung']),
  subjects: z.array(z.object({
    shortName: z.string(),
    name: z.string(),
    auto: z.number().int().min(0),
    manual: z.number().int().min(0),
    impossible: z.number().int().min(0),
  })),
  totals: z.object({
    auto: z.number().int().min(0),
    manual: z.number().int().min(0),
    impossible: z.number().int().min(0),
  }),
});

export const classTransitionSummarySchema = z.object({
  fromGrade: z.number().int().min(5).max(10),
  toGrade: z.number().int().min(5).max(10),
  classCount: z.number().int().min(0),
  studentCount: z.number().int().min(0),
  assignmentCount: z.number().int().min(0),
  conflicts: z.array(conflictSchema),
});

export const teacherWorkloadAnalysisSchema = z.object({
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  shortName: z.string(),
  currentHours: z.number().min(0),
  projectedHours: z.number().min(0),
  maxHours: z.number().min(0),
  assignmentChanges: z.object({
    retained: z.number().int().min(0),
    lost: z.number().int().min(0),
    gained: z.number().int().min(0),
    manual: z.number().int().min(0),
  }),
  subjects: z.array(z.string()),
  isActive: z.boolean(),
});

// ===== CONSTANTS =====

/**
 * Available naming strategies for class promotion
 */
export const NAMING_STRATEGIES = {
  auto: 'Automatische Benennung (5a → 6a)',
  manual: 'Manuelle Benennung erforderlich',
} as const;

/**
 * Migration decision types with German descriptions
 */
export const MIGRATION_DECISION_DESCRIPTIONS = {
  auto: 'Automatische Migration möglich',
  manual: 'Manuelle Überprüfung erforderlich',
  impossible: 'Migration nicht möglich',
} as const;

/**
 * Student promotion status descriptions
 */
export const STUDENT_STATUS_DESCRIPTIONS = {
  promote: 'Versetzung',
  graduate: 'Abschluss',
  conflict: 'Konflikt - manuelle Bearbeitung nötig',
} as const;

/**
 * Conflict severity levels with colors for UI
 */
export const CONFLICT_SEVERITY_CONFIG = {
  error: {
    label: 'Fehler',
    color: 'destructive',
    icon: 'AlertCircle',
  },
  warning: {
    label: 'Warnung', 
    color: 'warning',
    icon: 'AlertTriangle',
  },
} as const;

// Export all utility types
export type MigrationDecisionSummary = z.infer<typeof migrationDecisionSummarySchema>;
export type ClassTransitionSummary = z.infer<typeof classTransitionSummarySchema>;
export type TeacherWorkloadAnalysis = z.infer<typeof teacherWorkloadAnalysisSchema>;