import { z } from "zod";
import { nanoid } from "nanoid";
import { 
  SchoolYear, 
  Teacher, 
  Student, 
  Class, 
  Subject, 
  Assignment,
  InsertClass,
  InsertAssignment,
  InsertStudent
} from "@shared/schema";
import { type IStorage } from "../server/storage";
import { 
  MigrationPreview, 
  ManualDecision, 
  MigrationExecuteResponse, 
  ClassPromotionPlan, 
  AssignmentDecision, 
  StudentPromotionPlan,
  Conflict,
  migrationExecuteResponseSchema,
  manualDecisionSchema 
} from "./migration-types";
import { db } from "../server/db";

/**
 * Execute Engine for German Realschule School Year Migration (Grades 5-10)
 * 
 * Comprehensive transactional execution engine that provides:
 * - Atomic all-or-nothing migration commits
 * - Preconditions validation with data integrity checks
 * - Idempotency guard with execution tracking
 * - Comprehensive error handling and automatic rollback
 * - Manual decision override processing
 * - German education system compliance
 * 
 * SECURITY & VALIDATION:
 * - Input validation for all migration data
 * - SQL injection protection via prepared statements
 * - Referential integrity enforcement
 * - Authorization-ready architecture
 * 
 * GERMAN SCHOOL CONTEXT:
 * - Grade 10 graduation handling (no new assignments)
 * - Break subject manual approvals (Bio Gr.7, Physik Gr.9)
 * - Parallel subject grouping (Religion, Differenzierung)
 * - Class teacher relationship preservation
 */

// ===== EXECUTION TYPES & SCHEMAS =====

export const executeOptionsSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  setTargetAsCurrent: z.boolean().optional().default(false),
  createMissingSubjects: z.boolean().optional().default(false),
  preserveInactiveTeachers: z.boolean().optional().default(false),
  skipValidation: z.boolean().optional().default(false),
  executionTimeout: z.number().int().min(30).max(3600).optional().default(300), // 5 minutes default
});

export const executionSummarySchema = z.object({
  executionId: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  durationMs: z.number().int().min(0).optional(),
  classesCreated: z.number().int().min(0).default(0),
  assignmentsCreated: z.number().int().min(0).default(0),
  studentsUpdated: z.number().int().min(0).default(0),
  manualDecisionsApplied: z.number().int().min(0).default(0),
  conflictsResolved: z.number().int().min(0).default(0),
  warnings: z.array(z.string()).default([]),
  phases: z.array(z.object({
    phase: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
    durationMs: z.number().int().min(0).optional(),
    itemsProcessed: z.number().int().min(0).optional(),
    errors: z.array(z.string()).optional(),
  })).default([]),
});

export const preconditionCheckSchema = z.object({
  targetYearEmpty: z.boolean(),
  conflictsResolved: z.boolean(),
  manualDecisionsValid: z.boolean(),
  referentialIntegrity: z.boolean(),
  subjectsAvailable: z.boolean(),
  teachersActive: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const executionTrackingSchema = z.object({
  executionId: z.string(),
  fromYearId: z.string().uuid(),
  toYearId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'rolled_back']),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  checksum: z.string(), // For idempotency validation
  phases: z.record(z.object({
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    errorMessage: z.string().optional(),
  })),
  createdEntities: z.object({
    classes: z.array(z.string().uuid()).default([]),
    assignments: z.array(z.string().uuid()).default([]),
    updatedStudents: z.array(z.string().uuid()).default([]),
  }),
});

export type ExecuteOptions = z.infer<typeof executeOptionsSchema>;
export type ExecutionSummary = z.infer<typeof executionSummarySchema>;
export type PreconditionCheck = z.infer<typeof preconditionCheckSchema>;
export type ExecutionTracking = z.infer<typeof executionTrackingSchema>;

// ===== EXECUTION PHASES =====

export const EXECUTION_PHASES = {
  VALIDATION: 'preconditions_validation',
  IDEMPOTENCY_CHECK: 'idempotency_check',
  CLASS_CREATION: 'class_creation',
  ASSIGNMENT_CREATION: 'assignment_creation',
  STUDENT_UPDATE: 'student_update',
  METADATA_UPDATE: 'metadata_update',
  FINALIZATION: 'finalization',
} as const;

export type ExecutionPhase = typeof EXECUTION_PHASES[keyof typeof EXECUTION_PHASES];

// ===== ERROR TYPES =====

export class MigrationExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly phase: ExecutionPhase,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MigrationExecutionError';
  }
}

export class PreconditionViolationError extends MigrationExecutionError {
  constructor(message: string, details?: any) {
    super(message, 'PRECONDITION_VIOLATION', EXECUTION_PHASES.VALIDATION, details);
  }
}

export class IdempotencyViolationError extends MigrationExecutionError {
  constructor(message: string, details?: any) {
    super(message, 'IDEMPOTENCY_VIOLATION', EXECUTION_PHASES.IDEMPOTENCY_CHECK, details);
  }
}

// ===== MAIN EXECUTE FUNCTION =====

/**
 * Main execution function for school year migration
 * 
 * Performs atomic all-or-nothing migration with comprehensive validation,
 * idempotency guards, and rollback capabilities.
 */
export async function executeMigration(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[] = [],
  storage: IStorage,
  options: ExecuteOptions = {
    dryRun: false,
    setTargetAsCurrent: false,
    createMissingSubjects: false,
    preserveInactiveTeachers: false,
    skipValidation: false,
    executionTimeout: 300
  }
): Promise<MigrationExecuteResponse> {
  const opts = executeOptionsSchema.parse(options);
  const executionId = nanoid(12);
  const startTime = new Date().toISOString();
  
  // Initialize execution tracking
  let tracking: ExecutionTracking = {
    executionId,
    fromYearId: migrationPreview.fromYear.id,
    toYearId: migrationPreview.toYear.id,
    status: 'pending',
    startTime,
    checksum: generateMigrationChecksum(migrationPreview, manualDecisions),
    phases: Object.values(EXECUTION_PHASES).reduce((acc, phase) => {
      acc[phase] = { status: 'pending' };
      return acc;
    }, {} as Record<string, any>),
    createdEntities: {
      classes: [],
      assignments: [],
      updatedStudents: [],
    },
  };
  
  const summary: ExecutionSummary = {
    executionId,
    startTime,
    classesCreated: 0,
    assignmentsCreated: 0,
    studentsUpdated: 0,
    manualDecisionsApplied: 0,
    conflictsResolved: 0,
    warnings: [],
    phases: [],
  };

  try {
    // Phase 1: Preconditions Validation
    await executePhase(EXECUTION_PHASES.VALIDATION, tracking, summary, async () => {
      if (!opts.skipValidation) {
        const preconditions = await validatePreconditions(
          migrationPreview,
          manualDecisions,
          storage,
          opts
        );
        
        if (!preconditions.targetYearEmpty || 
            !preconditions.conflictsResolved || 
            !preconditions.manualDecisionsValid ||
            !preconditions.referentialIntegrity) {
          throw new PreconditionViolationError(
            "Migration preconditions nicht erfüllt: " + preconditions.errors.join(', '),
            preconditions
          );
        }
        
        summary.warnings.push(...preconditions.warnings);
      }
    });

    // Phase 2: Idempotency Check
    await executePhase(EXECUTION_PHASES.IDEMPOTENCY_CHECK, tracking, summary, async () => {
      const idempotencyCheck = await checkIdempotency(
        migrationPreview,
        manualDecisions,
        storage,
        tracking
      );
      
      if (!idempotencyCheck.canProceed) {
        throw new IdempotencyViolationError(
          idempotencyCheck.reason || "Migration bereits ausgeführt oder in Bearbeitung",
          idempotencyCheck
        );
      }
    });

    // Dry run mode - stop here and return preview
    if (opts.dryRun) {
      return {
        success: true,
        message: "Dry-Run erfolgreich abgeschlossen - Migration wurde NICHT ausgeführt",
        createdClasses: migrationPreview.classPromotions.length,
        createdAssignments: migrationPreview.assignmentDecisions.filter(d => d.decision === 'auto').length,
        movedStudents: migrationPreview.studentPromotions.filter(s => s.status === 'promote').length,
        warnings: summary.warnings,
        executionId,
        dryRun: true
      };
    }

    // Phase 3-6: Actual Migration (in transaction)
    tracking.status = 'running';
    
    const result = await db.transaction(async (tx) => {
      // Phase 3: Create Classes
      const createdClasses = await executePhase(EXECUTION_PHASES.CLASS_CREATION, tracking, summary, async () => {
        return await createClasses(migrationPreview.classPromotions, tx, storage, tracking, summary);
      });

      // Phase 4: Create Assignments
      const createdAssignments = await executePhase(EXECUTION_PHASES.ASSIGNMENT_CREATION, tracking, summary, async () => {
        return await createAssignments(
          migrationPreview.assignmentDecisions,
          manualDecisions,
          createdClasses,
          tx,
          storage,
          tracking,
          summary
        );
      });

      // Phase 5: Update Students
      const updatedStudents = await executePhase(EXECUTION_PHASES.STUDENT_UPDATE, tracking, summary, async () => {
        return await updateStudents(
          migrationPreview.studentPromotions,
          createdClasses,
          tx,
          storage,
          tracking,
          summary
        );
      });

      // Phase 6: Update Metadata
      await executePhase(EXECUTION_PHASES.METADATA_UPDATE, tracking, summary, async () => {
        if (opts.setTargetAsCurrent) {
          await setSchoolYearAsCurrent(migrationPreview.toYear.id, tx, storage);
        }
      });

      return {
        createdClasses,
        createdAssignments,
        updatedStudents,
      };
    });

    // Phase 7: Finalization
    await executePhase(EXECUTION_PHASES.FINALIZATION, tracking, summary, async () => {
      tracking.status = 'completed';
      tracking.endTime = new Date().toISOString();
      summary.endTime = tracking.endTime;
      summary.durationMs = new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
    });

    const response: MigrationExecuteResponse = {
      success: true,
      message: `Migration erfolgreich abgeschlossen. ${summary.classesCreated} Klassen, ${summary.assignmentsCreated} Zuweisungen und ${summary.studentsUpdated} Schüler verarbeitet.`,
      createdClasses: summary.classesCreated,
      createdAssignments: summary.assignmentsCreated,
      movedStudents: summary.studentsUpdated,
      warnings: summary.warnings,
      executionId,
      executionSummary: summary,
    };

    return migrationExecuteResponseSchema.parse(response);

  } catch (error: any) {
    // Error handling and rollback
    tracking.status = 'failed';
    tracking.endTime = new Date().toISOString();
    
    const errorMessage = error instanceof MigrationExecutionError 
      ? error.message 
      : `Unerwarteter Fehler während Migration: ${error.message}`;
    
    // Add phase-specific error information
    const currentPhase = getCurrentPhase(tracking);
    if (currentPhase) {
      tracking.phases[currentPhase].status = 'failed';
      tracking.phases[currentPhase].errorMessage = errorMessage;
      tracking.phases[currentPhase].endTime = new Date().toISOString();
    }

    return {
      success: false,
      message: errorMessage,
      createdClasses: 0,
      createdAssignments: 0,
      movedStudents: 0,
      errors: [errorMessage],
      executionId,
      phase: error instanceof MigrationExecutionError ? error.phase : undefined,
      rollbackApplied: true
    };
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Executes a migration phase with proper error handling and tracking
 */
async function executePhase<T>(
  phase: ExecutionPhase,
  tracking: ExecutionTracking,
  summary: ExecutionSummary,
  execution: () => Promise<T>
): Promise<T> {
  const phaseStart = new Date().toISOString();
  
  tracking.phases[phase] = {
    status: 'running',
    startTime: phaseStart,
  };
  
  const summaryPhase = {
    phase,
    status: 'running' as 'pending' | 'running' | 'completed' | 'failed',
    startTime: phaseStart,
  };
  summary.phases.push(summaryPhase);
  
  try {
    const result = await execution();
    
    const phaseEnd = new Date().toISOString();
    tracking.phases[phase].status = 'completed';
    tracking.phases[phase].endTime = phaseEnd;
    
    summaryPhase.status = 'completed';
    (summaryPhase as any).endTime = phaseEnd;
    (summaryPhase as any).durationMs = new Date(phaseEnd).getTime() - new Date(phaseStart).getTime();
    
    return result;
    
  } catch (error: any) {
    const phaseEnd = new Date().toISOString();
    tracking.phases[phase].status = 'failed';
    tracking.phases[phase].endTime = phaseEnd;
    tracking.phases[phase].errorMessage = error.message;
    
    summaryPhase.status = 'failed';
    (summaryPhase as any).endTime = phaseEnd;
    (summaryPhase as any).errors = [error.message];
    
    throw error;
  }
}

/**
 * Gets the currently executing phase from tracking
 */
function getCurrentPhase(tracking: ExecutionTracking): ExecutionPhase | null {
  for (const [phase, info] of Object.entries(tracking.phases)) {
    if (info.status === 'running') {
      return phase as ExecutionPhase;
    }
  }
  return null;
}

/**
 * Generates a unique checksum for migration data to ensure idempotency
 */
function generateMigrationChecksum(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[]
): string {
  const data = {
    fromYear: migrationPreview.fromYear.id,
    toYear: migrationPreview.toYear.id,
    classCount: migrationPreview.classPromotions.length,
    assignmentCount: migrationPreview.assignmentDecisions.length,
    studentCount: migrationPreview.studentPromotions.length,
    manualDecisionCount: manualDecisions.length,
    timestamp: Date.now(),
  };
  
  // Simple checksum generation (in production, use crypto.createHash)
  return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16);
}

// ===== PHASE IMPLEMENTATION STUBS =====
// These will be implemented in subsequent tasks

async function validatePreconditions(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[],
  storage: IStorage,
  options: ExecuteOptions
): Promise<PreconditionCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Validate Target Year Empty
  const targetYearEmpty = await validateTargetYearEmpty(
    migrationPreview.toYear.id,
    storage,
    errors,
    warnings
  );
  
  // 2. Validate Conflict Resolution
  const conflictsResolved = await validateConflictResolution(
    migrationPreview.conflicts,
    manualDecisions,
    errors,
    warnings
  );
  
  // 3. Validate Manual Decisions
  const manualDecisionsValid = await validateManualDecisions(
    migrationPreview.assignmentDecisions,
    manualDecisions,
    storage,
    errors,
    warnings
  );
  
  // 4. Validate Referential Integrity
  const referentialIntegrity = await validateReferentialIntegrity(
    migrationPreview,
    manualDecisions,
    storage,
    options,
    errors,
    warnings
  );
  
  // 5. Additional German School System Validations
  await validateGermanSchoolRules(
    migrationPreview,
    manualDecisions,
    errors,
    warnings
  );
  
  return preconditionCheckSchema.parse({
    targetYearEmpty,
    conflictsResolved,
    manualDecisionsValid,
    referentialIntegrity,
    subjectsAvailable: true, // Will be validated in referential integrity
    teachersActive: true, // Will be validated in referential integrity
    errors,
    warnings,
  });
}

/**
 * Validates that the target school year is empty and ready for migration
 */
async function validateTargetYearEmpty(
  toYearId: string,
  storage: IStorage,
  errors: string[],
  warnings: string[]
): Promise<boolean> {
  try {
    // Check for existing classes in target year
    const existingClasses = await storage.getClassesBySchoolYear(toYearId);
    if (existingClasses.length > 0) {
      errors.push(
        `Das Zieljahr enthält bereits ${existingClasses.length} Klassen. ` +
        `Migration kann nur in ein leeres Schuljahr erfolgen.`
      );
      return false;
    }
    
    // Check for existing students in target year
    const existingStudents = await storage.getStudentsBySchoolYear(toYearId);
    if (existingStudents.length > 0) {
      errors.push(
        `Das Zieljahr enthält bereits ${existingStudents.length} Schüler. ` +
        `Alle Schülerdaten müssen vor der Migration entfernt werden.`
      );
      return false;
    }
    
    // Check for existing assignments in target year
    const existingAssignments = await storage.getAssignmentsBySchoolYear(toYearId);
    if (existingAssignments.length > 0) {
      errors.push(
        `Das Zieljahr enthält bereits ${existingAssignments.length} Lehrerzuweisungen. ` +
        `Alle Zuweisungen müssen vor der Migration entfernt werden.`
      );
      return false;
    }
    
    return true;
    
  } catch (error: any) {
    errors.push(`Fehler bei der Überprüfung des Zieljahres: ${error.message}`);
    return false;
  }
}

/**
 * Validates that all error-level conflicts have been resolved through manual decisions
 */
async function validateConflictResolution(
  conflicts: Conflict[],
  manualDecisions: ManualDecision[],
  errors: string[],
  warnings: string[]
): Promise<boolean> {
  const errorConflicts = conflicts.filter(c => c.severity === 'error');
  const warningConflicts = conflicts.filter(c => c.severity === 'warning');
  
  if (errorConflicts.length === 0) {
    if (warningConflicts.length > 0) {
      warnings.push(
        `${warningConflicts.length} Warnungen gefunden. Migration kann fortgesetzt werden, ` +
        `aber manuelle Überprüfung wird empfohlen.`
      );
    }
    return true;
  }
  
  // Check if manual decisions address all error conflicts
  const resolvedConflictIds = new Set(
    manualDecisions
      .map(d => d.itemId)
      .filter(id => id) // Filter out undefined/null IDs
  );
  
  const unresolvedErrors = errorConflicts.filter(
    conflict => !conflict.relatedId || !resolvedConflictIds.has(conflict.relatedId)
  );
  
  if (unresolvedErrors.length > 0) {
    errors.push(
      `${unresolvedErrors.length} kritische Konflikte müssen vor Migration gelöst werden:`
    );
    
    unresolvedErrors.forEach((conflict, index) => {
      errors.push(`  ${index + 1}. ${conflict.message}`);
      if (conflict.suggestedResolution) {
        errors.push(`     Empfehlung: ${conflict.suggestedResolution}`);
      }
    });
    
    return false;
  }
  
  return true;
}

/**
 * Validates that manual decisions are complete and valid for all manual/impossible assignments
 */
async function validateManualDecisions(
  assignmentDecisions: AssignmentDecision[],
  manualDecisions: ManualDecision[],
  storage: IStorage,
  errors: string[],
  warnings: string[]
): Promise<boolean> {
  const manualAssignments = assignmentDecisions.filter(d => d.decision === 'manual');
  const impossibleAssignments = assignmentDecisions.filter(d => d.decision === 'impossible');
  
  // Create map of manual decisions by itemId for quick lookup
  const decisionMap = new Map<string, ManualDecision>();
  manualDecisions.forEach(decision => {
    decisionMap.set(decision.itemId, decision);
  });
  
  let isValid = true;
  
  // Check manual assignments
  for (const assignment of manualAssignments) {
    const decision = decisionMap.get(assignment.assignmentId);
    
    if (!decision) {
      errors.push(
        `Manuelle Entscheidung fehlt für Zuweisung: ${assignment.teacherName} -> ` +
        `${assignment.subjectShortName} in ${assignment.oldClassName}`
      );
      isValid = false;
      continue;
    }
    
    // Validate manual decision type
    if (decision.type !== 'assignment_override') {
      errors.push(
        `Falsche Entscheidungsart für Zuweisung ${assignment.assignmentId}: ` +
        `erwartet 'assignment_override', erhalten '${decision.type}'`
      );
      isValid = false;
      continue;
    }
    
    // Validate target class exists for assignments
    if (!decision.resolution.skip && decision.resolution.targetClassId) {
      try {
        const targetClass = await storage.getClass(decision.resolution.targetClassId);
        if (!targetClass) {
          errors.push(
            `Zielklasse nicht gefunden für Zuweisung ${assignment.assignmentId}: ` +
            `${decision.resolution.targetClassId}`
          );
          isValid = false;
        }
      } catch (error: any) {
        errors.push(
          `Fehler bei Überprüfung der Zielklasse ${decision.resolution.targetClassId}: ${error.message}`
        );
        isValid = false;
      }
    }
  }
  
  // Check impossible assignments - they should either be skipped or have manual resolution
  for (const assignment of impossibleAssignments) {
    const decision = decisionMap.get(assignment.assignmentId);
    
    if (!decision) {
      // Impossible assignments without decisions will be skipped by default
      warnings.push(
        `Unmögliche Zuweisung wird übersprungen: ${assignment.teacherName} -> ` +
        `${assignment.subjectShortName} in ${assignment.oldClassName} ` +
        `(Grund: ${assignment.reason || 'Nicht spezifiziert'})`
      );
      continue;
    }
    
    // If there's a decision for impossible assignment, validate it
    if (decision.type === 'assignment_override' && decision.resolution.targetClassId) {
      try {
        const targetClass = await storage.getClass(decision.resolution.targetClassId);
        if (!targetClass) {
          errors.push(
            `Zielklasse nicht gefunden für überschriebene Zuweisung ${assignment.assignmentId}: ` +
            `${decision.resolution.targetClassId}`
          );
          isValid = false;
        }
      } catch (error: any) {
        errors.push(
          `Fehler bei Überprüfung der Zielklasse ${decision.resolution.targetClassId}: ${error.message}`
        );
        isValid = false;
      }
    }
  }
  
  return isValid;
}

/**
 * Validates referential integrity across all entities in the migration
 */
async function validateReferentialIntegrity(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[],
  storage: IStorage,
  options: ExecuteOptions,
  errors: string[],
  warnings: string[]
): Promise<boolean> {
  let isValid = true;
  
  try {
    // Validate all teachers exist and are active
    const teacherIds = new Set<string>();
    migrationPreview.assignmentDecisions.forEach(a => teacherIds.add(a.teacherId));
    migrationPreview.classPromotions.forEach(c => {
      if (c.classTeacher1Id) teacherIds.add(c.classTeacher1Id);
      if (c.classTeacher2Id) teacherIds.add(c.classTeacher2Id);
    });
    
    for (const teacherId of Array.from(teacherIds)) {
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        errors.push(`Lehrer nicht gefunden: ${teacherId}`);
        isValid = false;
        continue;
      }
      
      if (!teacher.isActive && !options.preserveInactiveTeachers) {
        warnings.push(
          `Inaktiver Lehrer in Migration: ${teacher.firstName} ${teacher.lastName} (${teacher.shortName})`
        );
      }
    }
    
    // Validate all subjects exist
    const subjectShortNames = new Set<string>();
    migrationPreview.assignmentDecisions.forEach(a => subjectShortNames.add(a.subjectShortName));
    
    const allSubjects = await storage.getSubjects();
    const subjectsByShortName = new Map(allSubjects.map((s: Subject) => [s.shortName, s]));
    
    for (const shortName of Array.from(subjectShortNames)) {
      if (!subjectsByShortName.has(shortName)) {
        if (options.createMissingSubjects) {
          warnings.push(`Fach wird automatisch erstellt: ${shortName}`);
        } else {
          errors.push(`Fach nicht gefunden: ${shortName}`);
          isValid = false;
        }
      }
    }
    
    // Validate school years exist
    const fromYear = await storage.getSchoolYear(migrationPreview.fromYear.id);
    const toYear = await storage.getSchoolYear(migrationPreview.toYear.id);
    
    if (!fromYear) {
      errors.push(`Ausgangsjahr nicht gefunden: ${migrationPreview.fromYear.id}`);
      isValid = false;
    }
    
    if (!toYear) {
      errors.push(`Zieljahr nicht gefunden: ${migrationPreview.toYear.id}`);
      isValid = false;
    }
    
    // Validate manual decision target classes
    for (const decision of manualDecisions) {
      if (decision.resolution.targetClassId) {
        const targetClass = await storage.getClass(decision.resolution.targetClassId);
        if (!targetClass) {
          errors.push(
            `Zielklasse in manueller Entscheidung nicht gefunden: ${decision.resolution.targetClassId}`
          );
          isValid = false;
        }
      }
    }
    
  } catch (error: any) {
    errors.push(`Fehler bei Referentialitätsprüfung: ${error.message}`);
    isValid = false;
  }
  
  return isValid;
}

/**
 * Validates German school system specific rules
 */
async function validateGermanSchoolRules(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[],
  errors: string[],
  warnings: string[]
): Promise<void> {
  // OPTIMIZED: Single pass through classPromotions to collect all class-related metrics
  const invalidGradeProgression: typeof migrationPreview.classPromotions = [];
  const grade10Classes: typeof migrationPreview.classPromotions = [];
  const largeSizeClasses: typeof migrationPreview.classPromotions = [];
  
  for (const classPromotion of migrationPreview.classPromotions) {
    // Check for invalid grade progression (5-10 for Realschule)
    if (classPromotion.newGrade !== classPromotion.oldGrade + 1 && classPromotion.newGrade <= 10) {
      invalidGradeProgression.push(classPromotion);
    }
    
    // Check for grade 10 classes (graduation)
    if (classPromotion.oldGrade === 10) {
      grade10Classes.push(classPromotion);
    }
    
    // Check for large class sizes (>32 students)
    if (classPromotion.studentCount > 32) {
      largeSizeClasses.push(classPromotion);
    }
  }
  
  // OPTIMIZED: Single pass through assignmentDecisions to collect all assignment-related metrics
  let grade10AssignmentsCount = 0;
  const breakSubjectAssignments: typeof migrationPreview.assignmentDecisions = [];
  let manualBreakSubjectsCount = 0;
  const teacherAssignmentCounts = new Map<string, number>();
  
  for (const assignment of migrationPreview.assignmentDecisions) {
    // Check for grade 10 assignments
    if (assignment.oldGrade === 10) {
      grade10AssignmentsCount++;
    }
    
    // Check for break subjects (Biology Grade 7, Physics Grade 9)
    const isBreakSubject = (
      (assignment.subjectShortName === 'Bio' && assignment.oldGrade === 6 && assignment.newGrade === 7) ||
      (assignment.subjectShortName === 'Ph' && assignment.oldGrade === 8 && assignment.newGrade === 9)
    );
    
    if (isBreakSubject) {
      breakSubjectAssignments.push(assignment);
      if (assignment.decision === 'manual') {
        manualBreakSubjectsCount++;
      }
    }
    
    // Calculate teacher workload (only for auto assignments)
    if (assignment.decision === 'auto') {
      const current = teacherAssignmentCounts.get(assignment.teacherId) || 0;
      teacherAssignmentCounts.set(assignment.teacherId, current + assignment.hoursPerWeek);
    }
  }
  
  // Generate warnings based on collected metrics
  
  // Grade Progression Rules
  if (invalidGradeProgression.length > 0) {
    warnings.push(
      `${invalidGradeProgression.length} Klassen haben ungewöhnliche Stufenübergänge. ` +
      `Bitte überprüfen: ${invalidGradeProgression.map(c => `${c.oldClassName} (${c.oldGrade}->${c.newGrade})`).join(', ')}`
    );
  }
  
  // Grade 10 Graduation Validation
  if (grade10Classes.length > 0 && grade10AssignmentsCount > 0) {
    warnings.push(
      `${grade10Classes.length} Klassen der Stufe 10 werden abgeschlossen. ` +
      `${grade10AssignmentsCount} Lehrerzuweisungen sollten überprüft werden.`
    );
  }
  
  // Break Subject Validation
  if (manualBreakSubjectsCount > 0) {
    warnings.push(
      `${manualBreakSubjectsCount} Stundenwechselfächer (Bio Stufe 7, Physik Stufe 9) ` +
      `erfordern manuelle Überprüfung der Stundenanzahl.`
    );
  }
  
  // Class Size Validation
  if (largeSizeClasses.length > 0) {
    warnings.push(
      `${largeSizeClasses.length} Klassen überschreiten empfohlene Klassengröße (32 Schüler): ` +
      `${largeSizeClasses.map(c => `${c.newClassName} (${c.studentCount})`).join(', ')}`
    );
  }
  
  // Teacher Workload Warnings
  const overloadedTeachers: Array<{ teacherId: string; hours: number }> = [];
  for (const [teacherId, hours] of teacherAssignmentCounts.entries()) {
    if (hours > 28) { // Standard teaching load is ~25-28 hours
      overloadedTeachers.push({ teacherId, hours });
    }
  }
  
  if (overloadedTeachers.length > 0) {
    warnings.push(
      `${overloadedTeachers.length} Lehrer könnten überlastet sein (>28 Stunden): ` +
      `Durchschnitt ${Math.round(overloadedTeachers.reduce((sum, t) => sum + t.hours, 0) / overloadedTeachers.length)} Stunden`
    );
  }
}

async function checkIdempotency(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[],
  storage: IStorage,
  tracking: ExecutionTracking
): Promise<{ canProceed: boolean; reason?: string; existingExecution?: any }> {
  try {
    // 1. Check if target year is completely empty (fresh migration)
    const targetYearState = await analyzeTargetYearState(migrationPreview.toYear.id, storage);
    
    if (targetYearState.isEmpty) {
      // Fresh migration - can proceed
      return { canProceed: true };
    }
    
    // 2. Target year has data - determine if it's from previous execution
    const executionAnalysis = await analyzeExistingExecution(
      migrationPreview,
      manualDecisions,
      targetYearState,
      storage
    );
    
    if (executionAnalysis.isCompleteExecution) {
      // Migration already completed successfully
      return {
        canProceed: false,
        reason: `Migration bereits vollständig abgeschlossen. Zieljahr ${migrationPreview.toYear.name} ` +
                `enthält ${targetYearState.classCount} Klassen, ${targetYearState.assignmentCount} Zuweisungen ` +
                `und ${targetYearState.studentCount} Schüler von vorheriger Ausführung.`,
        existingExecution: executionAnalysis,
      };
    }
    
    if (executionAnalysis.isPartialExecution) {
      // Partial execution detected - analyze if we can resume
      const resumabilityCheck = await checkResumability(
        migrationPreview,
        manualDecisions,
        executionAnalysis,
        storage
      );
      
      if (!resumabilityCheck.canResume) {
        return {
          canProceed: false,
          reason: `Teilweise abgeschlossene Migration erkannt, aber nicht fortsetzbar: ${resumabilityCheck.reason}. ` +
                  `Zieljahr muss vor erneuter Migration vollständig geleert werden.`,
          existingExecution: executionAnalysis,
        };
      }
      
      // Can resume - but this is currently not implemented as it requires more complex logic
      return {
        canProceed: false,
        reason: `Teilweise abgeschlossene Migration erkannt. Automatische Fortsetzung ist nicht implementiert. ` +
                `Bitte leeren Sie das Zieljahr oder verwenden Sie manuelle Datenbereinigung.`,
        existingExecution: executionAnalysis,
      };
    }
    
    if (executionAnalysis.isConflictingData) {
      // Target year has conflicting data not from our migration
      return {
        canProceed: false,
        reason: `Zieljahr enthält Daten, die nicht von einer vorherigen Migration stammen. ` +
                `${targetYearState.classCount} Klassen, ${targetYearState.assignmentCount} Zuweisungen, ` +
                `${targetYearState.studentCount} Schüler müssen vor Migration entfernt werden.`,
        existingExecution: executionAnalysis,
      };
    }
    
    // Unknown state - err on the side of caution
    return {
      canProceed: false,
      reason: `Unbekannter Zustand des Zieljahres erkannt. Manuelle Überprüfung erforderlich.`,
      existingExecution: executionAnalysis,
    };
    
  } catch (error: any) {
    return {
      canProceed: false,
      reason: `Fehler bei Idempotenz-Überprüfung: ${error.message}`,
    };
  }
}

/**
 * Analyzes the current state of the target school year
 */
async function analyzeTargetYearState(
  toYearId: string,
  storage: IStorage
): Promise<{
  isEmpty: boolean;
  classCount: number;
  assignmentCount: number;
  studentCount: number;
  classes: Class[];
  assignments: Assignment[];
  students: Student[];
}> {
  const [classes, assignments, students] = await Promise.all([
    storage.getClassesBySchoolYear(toYearId),
    storage.getAssignmentsBySchoolYear(toYearId),
    storage.getStudentsBySchoolYear(toYearId),
  ]);
  
  return {
    isEmpty: classes.length === 0 && assignments.length === 0 && students.length === 0,
    classCount: classes.length,
    assignmentCount: assignments.length,
    studentCount: students.length,
    classes,
    assignments,
    students,
  };
}

/**
 * Analyzes existing data to determine if it's from a previous migration execution
 */
async function analyzeExistingExecution(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[],
  targetYearState: any,
  storage: IStorage
): Promise<{
  isCompleteExecution: boolean;
  isPartialExecution: boolean;
  isConflictingData: boolean;
  similarity: number;
  analysisDetails: any;
}> {
  const analysisDetails: any = {
    expectedClasses: migrationPreview.classPromotions.length,
    actualClasses: targetYearState.classCount,
    expectedAssignments: migrationPreview.assignmentDecisions.filter(d => d.decision === 'auto').length,
    actualAssignments: targetYearState.assignmentCount,
    expectedStudents: migrationPreview.studentPromotions.filter(s => s.status === 'promote').length,
    actualStudents: targetYearState.studentCount,
  };
  
  // Check class name patterns - do they match expected promotions?
  const classNameMatches = analyzeClassNamePatterns(
    migrationPreview.classPromotions,
    targetYearState.classes
  );
  analysisDetails.classNameMatches = classNameMatches;
  
  // Check grade progression patterns - are grades consistent with promotion?
  const gradeProgressionMatches = analyzeGradeProgressionPatterns(
    migrationPreview.classPromotions,
    targetYearState.classes
  );
  analysisDetails.gradeProgressionMatches = gradeProgressionMatches;
  
  // Check assignment patterns - do teacher-subject combinations match?
  const assignmentMatches = await analyzeAssignmentPatterns(
    migrationPreview.assignmentDecisions.filter(d => d.decision === 'auto'),
    targetYearState.assignments,
    storage
  );
  analysisDetails.assignmentMatches = assignmentMatches;
  
  // Calculate overall similarity score (0-1)
  const similarity = calculateSimilarityScore(classNameMatches, gradeProgressionMatches, assignmentMatches);
  
  // Determine execution state based on similarity and data completeness
  const isCompleteExecution = 
    similarity > 0.85 && // High similarity
    Math.abs(analysisDetails.actualClasses - analysisDetails.expectedClasses) <= 1 && // Allow small differences
    analysisDetails.actualAssignments >= analysisDetails.expectedAssignments * 0.9; // At least 90% assignments
    
  const isPartialExecution = 
    similarity > 0.6 && // Medium similarity
    (
      analysisDetails.actualClasses < analysisDetails.expectedClasses ||
      analysisDetails.actualAssignments < analysisDetails.expectedAssignments * 0.8
    );
    
  const isConflictingData = 
    similarity < 0.3 && // Low similarity
    (targetYearState.classCount > 0 || targetYearState.assignmentCount > 0);
  
  return {
    isCompleteExecution,
    isPartialExecution,
    isConflictingData,
    similarity,
    analysisDetails,
  };
}

/**
 * Analyzes class name patterns to detect migration consistency
 */
function analyzeClassNamePatterns(
  expectedPromotions: ClassPromotionPlan[],
  actualClasses: Class[]
): { matchCount: number; totalExpected: number; confidence: number } {
  let matchCount = 0;
  const expectedNames = new Set(expectedPromotions.map(p => p.newClassName));
  const actualNames = new Set(actualClasses.map(c => c.name));
  
  for (const expectedName of Array.from(expectedNames)) {
    if (actualNames.has(expectedName)) {
      matchCount++;
    }
  }
  
  const confidence = expectedNames.size > 0 ? matchCount / expectedNames.size : 0;
  
  return {
    matchCount,
    totalExpected: expectedNames.size,
    confidence,
  };
}

/**
 * Analyzes grade progression patterns to validate promotion logic
 */
function analyzeGradeProgressionPatterns(
  expectedPromotions: ClassPromotionPlan[],
  actualClasses: Class[]
): { validProgressions: number; totalClasses: number; confidence: number } {
  let validProgressions = 0;
  const actualClassMap = new Map(actualClasses.map(c => [c.name, c]));
  
  for (const promotion of expectedPromotions) {
    const actualClass = actualClassMap.get(promotion.newClassName);
    if (actualClass && actualClass.grade === promotion.newGrade) {
      validProgressions++;
    }
  }
  
  const confidence = expectedPromotions.length > 0 ? validProgressions / expectedPromotions.length : 0;
  
  return {
    validProgressions,
    totalClasses: expectedPromotions.length,
    confidence,
  };
}

/**
 * Analyzes assignment patterns to detect migration consistency
 */
async function analyzeAssignmentPatterns(
  expectedAssignments: AssignmentDecision[],
  actualAssignments: Assignment[],
  storage: IStorage
): Promise<{ matchCount: number; totalExpected: number; confidence: number }> {
  let matchCount = 0;
  
  // Get subject and class mappings for comparison
  const [subjects, classes] = await Promise.all([
    storage.getSubjects(),
    storage.getClasses(),
  ]);
  
  const subjectMap = new Map(subjects.map((s: Subject) => [s.shortName, s.id]));
  const classMap = new Map(classes.map((c: Class) => [c.name, c.id]));
  
  // Create signature for each expected assignment
  const expectedSignatures = new Set(
    expectedAssignments
      .filter(a => a.newClassName && subjectMap.has(a.subjectShortName))
      .map(a => `${a.teacherId}-${subjectMap.get(a.subjectShortName)}-${classMap.get(a.newClassName!)}-${a.hoursPerWeek}-${a.semester}`)
      .filter(sig => !sig.includes('undefined'))
  );
  
  // Create signature for each actual assignment
  const actualSignatures = new Set(
    actualAssignments.map(a => `${a.teacherId}-${a.subjectId}-${a.classId}-${a.hoursPerWeek}-${a.semester}`)
  );
  
  // Count matches
  for (const expectedSig of Array.from(expectedSignatures)) {
    if (actualSignatures.has(expectedSig)) {
      matchCount++;
    }
  }
  
  const confidence = expectedSignatures.size > 0 ? matchCount / expectedSignatures.size : 0;
  
  return {
    matchCount,
    totalExpected: expectedSignatures.size,
    confidence,
  };
}

/**
 * Calculates overall similarity score based on pattern matches
 */
function calculateSimilarityScore(
  classMatches: { confidence: number },
  gradeMatches: { confidence: number },
  assignmentMatches: { confidence: number }
): number {
  // Weighted average: classes (40%), grades (30%), assignments (30%)
  return (
    classMatches.confidence * 0.4 +
    gradeMatches.confidence * 0.3 +
    assignmentMatches.confidence * 0.3
  );
}

/**
 * Checks if a partial execution can be safely resumed
 */
async function checkResumability(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[],
  executionAnalysis: any,
  storage: IStorage
): Promise<{ canResume: boolean; reason: string; resumeStrategy?: string }> {
  // For now, we don't support resume operations due to complexity
  // This would require:
  // 1. Identifying exactly which operations completed
  // 2. Validating data consistency of partial state
  // 3. Determining safe operations to retry
  // 4. Handling potential referential integrity issues
  
  return {
    canResume: false,
    reason: "Automatische Fortsetzung partieller Migrationen ist aktuell nicht implementiert",
  };
}

/**
 * Enhanced checksum generation with migration content hashing
 */
function generateMigrationContentChecksum(
  migrationPreview: MigrationPreview,
  manualDecisions: ManualDecision[]
): string {
  // Create deterministic representation of migration content
  const content = {
    fromYear: migrationPreview.fromYear.id,
    toYear: migrationPreview.toYear.id,
    classes: migrationPreview.classPromotions
      .sort((a, b) => a.oldClassName.localeCompare(b.oldClassName))
      .map(c => ({
        old: `${c.oldClassName}-${c.oldGrade}`,
        new: `${c.newClassName}-${c.newGrade}`,
        students: c.studentCount,
      })),
    assignments: migrationPreview.assignmentDecisions
      .filter(a => a.decision === 'auto')
      .sort((a, b) => `${a.teacherId}-${a.subjectShortName}`.localeCompare(`${b.teacherId}-${b.subjectShortName}`))
      .map(a => ({
        teacher: a.teacherId,
        subject: a.subjectShortName,
        oldClass: a.oldClassName,
        newClass: a.newClassName,
        hours: a.hoursPerWeek,
        semester: a.semester,
      })),
    manualDecisions: manualDecisions
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
      .map(d => ({
        item: d.itemId,
        type: d.type,
        resolution: d.resolution,
      })),
  };
  
  // Simple checksum (in production, use crypto.createHash with SHA-256)
  const jsonStr = JSON.stringify(content);
  return Buffer.from(jsonStr).toString('base64').slice(0, 32);
}

async function createClasses(
  classPromotions: ClassPromotionPlan[],
  tx: any,
  storage: IStorage,
  tracking: ExecutionTracking,
  summary: ExecutionSummary
): Promise<Map<string, string>> {
  const createdClassMap = new Map<string, string>(); // oldClassId -> newClassId
  const newClassIds: string[] = [];
  
  try {
    // Import required schema tables and utilities
    const { classes } = await import("@shared/schema");
    const { nanoid } = await import("nanoid");
    
    for (const promotion of classPromotions) {
      // Skip Grade 10 graduations (no new classes created)
      if (promotion.oldGrade === 10 && promotion.newGrade > 10) {
        continue;
      }
      
      // Create new class record
      const newClassId = nanoid();
      const newClass: InsertClass = {
        name: promotion.newClassName,
        grade: promotion.newGrade,
        studentCount: promotion.studentCount,
        subjectHours: promotion.subjectHours || {},
        classTeacher1Id: promotion.classTeacher1Id || null,
        classTeacher2Id: promotion.classTeacher2Id || null,
        schoolYearId: tracking.toYearId,
      };
      
      // Insert class within transaction
      const [createdClass] = await tx.insert(classes).values(newClass).returning();
      
      if (!createdClass) {
        throw new Error(`Fehler beim Erstellen der Klasse ${promotion.newClassName}`);
      }
      
      // Track creation
      createdClassMap.set(promotion.oldClassId, createdClass.id);
      newClassIds.push(createdClass.id);
      tracking.createdEntities.classes.push(createdClass.id);
      
      summary.classesCreated++;
      
      // Update phase progress if available
      const currentPhase = summary.phases[summary.phases.length - 1];
      if (currentPhase) {
        currentPhase.itemsProcessed = (currentPhase.itemsProcessed || 0) + 1;
      }
    }
    
    return createdClassMap;
    
  } catch (error: any) {
    // Add context to error
    throw new MigrationExecutionError(
      `Fehler beim Erstellen der Klassen: ${error.message}`,
      'CLASS_CREATION_FAILED',
      EXECUTION_PHASES.CLASS_CREATION,
      { 
        totalPromotions: classPromotions.length,
        createdSoFar: newClassIds.length,
        error: error.message 
      }
    );
  }
}

async function createAssignments(
  assignmentDecisions: AssignmentDecision[],
  manualDecisions: ManualDecision[],
  createdClasses: Map<string, string>,
  tx: any,
  storage: IStorage,
  tracking: ExecutionTracking,
  summary: ExecutionSummary
): Promise<string[]> {
  const createdAssignmentIds: string[] = [];
  
  try {
    // Import required dependencies
    const { assignments, subjects } = await import("@shared/schema");
    const { nanoid } = await import("nanoid");
    const { eq } = await import("drizzle-orm");
    
    // Get all subjects for mapping short names to IDs
    const allSubjects = await storage.getSubjects();
    const subjectMap = new Map(allSubjects.map((s: Subject) => [s.shortName, s.id]));
    
    // Create map of manual decisions for quick lookup
    const manualDecisionMap = new Map<string, ManualDecision>();
    manualDecisions.forEach(decision => {
      manualDecisionMap.set(decision.itemId, decision);
    });
    
    // Process automatic assignments
    const autoAssignments = assignmentDecisions.filter(d => d.decision === 'auto');
    for (const assignmentDecision of autoAssignments) {
      const newClassId = createdClasses.get(assignmentDecision.oldClassId);
      if (!newClassId) {
        // Class might have graduated, skip assignment
        if (assignmentDecision.oldGrade === 10) {
          continue;
        }
        throw new Error(
          `Neue Klasse nicht gefunden für Zuweisung: ${assignmentDecision.oldClassName} -> ${assignmentDecision.newClassName}`
        );
      }
      
      const subjectId = subjectMap.get(assignmentDecision.subjectShortName);
      if (!subjectId) {
        throw new Error(`Fach nicht gefunden: ${assignmentDecision.subjectShortName}`);
      }
      
      // Create assignment record
      const newAssignment: InsertAssignment = {
        teacherId: assignmentDecision.teacherId,
        classId: newClassId,
        subjectId: subjectId,
        hoursPerWeek: assignmentDecision.hoursPerWeek,
        semester: assignmentDecision.semester,
        schoolYearId: tracking.toYearId,
      };
      
      // Insert assignment within transaction
      const [createdAssignment] = await tx.insert(assignments).values(newAssignment).returning();
      
      if (!createdAssignment) {
        throw new Error(
          `Fehler beim Erstellen der Zuweisung: ${assignmentDecision.teacherName} -> ` +
          `${assignmentDecision.subjectShortName} in ${assignmentDecision.newClassName}`
        );
      }
      
      createdAssignmentIds.push(createdAssignment.id);
      tracking.createdEntities.assignments.push(createdAssignment.id);
      summary.assignmentsCreated++;
    }
    
    // Process manual assignments with override decisions
    const manualAssignments = assignmentDecisions.filter(d => d.decision === 'manual');
    for (const assignmentDecision of manualAssignments) {
      const manualDecision = manualDecisionMap.get(assignmentDecision.assignmentId);
      
      if (!manualDecision) {
        // Manual assignment without decision is skipped
        continue;
      }
      
      if (manualDecision.resolution.skip) {
        // Explicitly skipped by manual decision
        continue;
      }
      
      // Process manual assignment override
      let targetClassId: string;
      
      if (manualDecision.resolution.targetClassId) {
        // Use specific target class from manual decision
        targetClassId = manualDecision.resolution.targetClassId;
      } else {
        // Use default promoted class
        targetClassId = createdClasses.get(assignmentDecision.oldClassId)!;
        if (!targetClassId) {
          throw new Error(
            `Zielklasse nicht verfügbar für manuelle Zuweisung: ${assignmentDecision.oldClassName}`
          );
        }
      }
      
      const subjectId = subjectMap.get(assignmentDecision.subjectShortName);
      if (!subjectId) {
        throw new Error(`Fach nicht gefunden: ${assignmentDecision.subjectShortName}`);
      }
      
      // Create manual assignment record
      const newAssignment: InsertAssignment = {
        teacherId: assignmentDecision.teacherId,
        classId: targetClassId,
        subjectId: subjectId,
        hoursPerWeek: assignmentDecision.hoursPerWeek,
        semester: assignmentDecision.semester,
        schoolYearId: tracking.toYearId,
      };
      
      // Insert assignment within transaction
      const [createdAssignment] = await tx.insert(assignments).values(newAssignment).returning();
      
      if (!createdAssignment) {
        throw new Error(
          `Fehler beim Erstellen der manuellen Zuweisung: ${assignmentDecision.teacherName} -> ` +
          `${assignmentDecision.subjectShortName}`
        );
      }
      
      createdAssignmentIds.push(createdAssignment.id);
      tracking.createdEntities.assignments.push(createdAssignment.id);
      summary.assignmentsCreated++;
      summary.manualDecisionsApplied++;
    }
    
    // Process impossible assignments with manual override decisions
    const impossibleAssignments = assignmentDecisions.filter(d => d.decision === 'impossible');
    for (const assignmentDecision of impossibleAssignments) {
      const manualDecision = manualDecisionMap.get(assignmentDecision.assignmentId);
      
      if (!manualDecision || manualDecision.resolution.skip) {
        // No manual decision or explicitly skipped - leave as impossible
        continue;
      }
      
      // Manual override for impossible assignment
      if (manualDecision.resolution.targetClassId) {
        const subjectId = subjectMap.get(assignmentDecision.subjectShortName);
        if (!subjectId) {
          throw new Error(`Fach nicht gefunden: ${assignmentDecision.subjectShortName}`);
        }
        
        // Create override assignment record
        const newAssignment: InsertAssignment = {
          teacherId: assignmentDecision.teacherId,
          classId: manualDecision.resolution.targetClassId,
          subjectId: subjectId,
          hoursPerWeek: assignmentDecision.hoursPerWeek,
          semester: assignmentDecision.semester,
          schoolYearId: tracking.toYearId,
        };
        
        // Insert assignment within transaction
        const [createdAssignment] = await tx.insert(assignments).values(newAssignment).returning();
        
        if (!createdAssignment) {
          throw new Error(
            `Fehler beim Erstellen der überschriebenen Zuweisung: ${assignmentDecision.teacherName} -> ` +
            `${assignmentDecision.subjectShortName}`
          );
        }
        
        createdAssignmentIds.push(createdAssignment.id);
        tracking.createdEntities.assignments.push(createdAssignment.id);
        summary.assignmentsCreated++;
        summary.manualDecisionsApplied++;
        summary.conflictsResolved++;
      }
    }
    
    return createdAssignmentIds;
    
  } catch (error: any) {
    // Add context to error
    throw new MigrationExecutionError(
      `Fehler beim Erstellen der Zuweisungen: ${error.message}`,
      'ASSIGNMENT_CREATION_FAILED',
      EXECUTION_PHASES.ASSIGNMENT_CREATION,
      { 
        totalDecisions: assignmentDecisions.length,
        manualDecisions: manualDecisions.length,
        createdSoFar: createdAssignmentIds.length,
        error: error.message 
      }
    );
  }
}

async function updateStudents(
  studentPromotions: StudentPromotionPlan[],
  createdClasses: Map<string, string>,
  tx: any,
  storage: IStorage,
  tracking: ExecutionTracking,
  summary: ExecutionSummary
): Promise<string[]> {
  const updatedStudentIds: string[] = [];
  
  try {
    // Import required dependencies
    const { students } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    for (const promotion of studentPromotions) {
      // Skip students who are graduating
      if (promotion.status === 'graduate') {
        continue;
      }
      
      // Skip students with conflicts (should be resolved before execution)
      if (promotion.status === 'conflict') {
        summary.warnings.push(
          `Schüler mit Konflikt übersprungen: ${promotion.studentName} (${promotion.oldClassName})`
        );
        continue;
      }
      
      // Get target class ID
      const newClassId = createdClasses.get(promotion.oldClassId);
      if (!newClassId) {
        throw new Error(
          `Neue Klasse nicht gefunden für Schüler ${promotion.studentName}: ${promotion.oldClassName}`
        );
      }
      
      // Update student record within transaction
      const updateResult = await tx
        .update(students)
        .set({
          classId: newClassId,
          grade: promotion.newGrade!,
          schoolYearId: tracking.toYearId,
        })
        .where(eq(students.id, promotion.studentId))
        .returning();
      
      if (updateResult.length === 0) {
        throw new Error(`Schüler nicht gefunden oder konnte nicht aktualisiert werden: ${promotion.studentName}`);
      }
      
      updatedStudentIds.push(promotion.studentId);
      tracking.createdEntities.updatedStudents.push(promotion.studentId);
      summary.studentsUpdated++;
      
      // Update phase progress if available
      const currentPhase = summary.phases[summary.phases.length - 1];
      if (currentPhase) {
        currentPhase.itemsProcessed = (currentPhase.itemsProcessed || 0) + 1;
      }
    }
    
    return updatedStudentIds;
    
  } catch (error: any) {
    // Add context to error
    throw new MigrationExecutionError(
      `Fehler beim Aktualisieren der Schüler: ${error.message}`,
      'STUDENT_UPDATE_FAILED',
      EXECUTION_PHASES.STUDENT_UPDATE,
      { 
        totalPromotions: studentPromotions.length,
        updatedSoFar: updatedStudentIds.length,
        error: error.message 
      }
    );
  }
}

async function setSchoolYearAsCurrent(
  schoolYearId: string,
  tx: any,
  storage: IStorage
): Promise<void> {
  try {
    // Import required dependencies
    const { schoolYears } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    // First, set all school years to not current
    await tx.update(schoolYears).set({ isCurrent: false });
    
    // Then set the specified school year as current
    const updateResult = await tx
      .update(schoolYears)
      .set({ isCurrent: true })
      .where(eq(schoolYears.id, schoolYearId))
      .returning();
    
    if (updateResult.length === 0) {
      throw new Error(`Schuljahr nicht gefunden oder konnte nicht aktualisiert werden: ${schoolYearId}`);
    }
    
  } catch (error: any) {
    // Add context to error
    throw new MigrationExecutionError(
      `Fehler beim Setzen des aktuellen Schuljahres: ${error.message}`,
      'SCHOOL_YEAR_UPDATE_FAILED',
      EXECUTION_PHASES.METADATA_UPDATE,
      { 
        schoolYearId,
        error: error.message 
      }
    );
  }
}