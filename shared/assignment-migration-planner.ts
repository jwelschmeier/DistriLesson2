import { z } from "zod";
import { Assignment, Subject, Teacher } from "./schema";
import { 
  AssignmentDecision, 
  ClassPromotionPlan, 
  Conflict, 
  assignmentDecisionSchema,
  conflictSchema 
} from "./migration-types";
import { 
  evaluateTeacherMigration, 
  getSubjectAvailability,
  NRW_REALSCHULE_SUBJECT_GRADE_MAPPING 
} from "./subject-grade-mapping";
import { 
  getParallelGroupForSubject
} from "./parallel-subjects";

/**
 * Assignment Migration Planner for German Realschule (Grades 5-10)
 * 
 * Intelligent categorization of teacher assignment migrations using:
 * - NRW Realschule curriculum rules
 * - Subject-grade mapping evaluation
 * - Parallel subject group handling
 * - Break year detection (Bio 6→7, Phys 8→9)
 * 
 * Features:
 * - Auto migration for continuous subjects
 * - Manual review for breaks and parallel groups
 * - Impossible detection for graduation/missing subjects
 * - Comprehensive conflict detection
 */

// ===== TYPES AND SCHEMAS =====

export const assignmentMigrationOptionsSchema = z.object({
  preserveHours: z.boolean().optional().default(true),
  autoHandleParallelGroups: z.boolean().optional().default(true),
  validateTeacherQualifications: z.boolean().optional().default(true),
  includeInactiveTeachers: z.boolean().optional().default(false),
});

export const assignmentMigrationStatisticsSchema = z.object({
  totalAssignments: z.number().int().min(0),
  assignmentsAuto: z.number().int().min(0),
  assignmentsManual: z.number().int().min(0),
  assignmentsImpossible: z.number().int().min(0),
  conflictsCount: z.number().int().min(0),
  warningsCount: z.number().int().min(0),
  byGrade: z.record(z.string(), z.object({
    auto: z.number().int().min(0),
    manual: z.number().int().min(0),
    impossible: z.number().int().min(0),
  })),
  bySubject: z.record(z.string(), z.object({
    auto: z.number().int().min(0),
    manual: z.number().int().min(0),
    impossible: z.number().int().min(0),
  })),
});

export const assignmentMigrationResultSchema = z.object({
  decisions: z.array(assignmentDecisionSchema),
  statistics: assignmentMigrationStatisticsSchema,
  conflicts: z.array(conflictSchema),
});

export type AssignmentMigrationOptions = z.infer<typeof assignmentMigrationOptionsSchema>;
export type AssignmentMigrationStatistics = z.infer<typeof assignmentMigrationStatisticsSchema>;
export type AssignmentMigrationResult = z.infer<typeof assignmentMigrationResultSchema>;

// ===== CONSTANTS =====

/**
 * Special migration rules for specific subjects
 */
export const SPECIAL_MIGRATION_RULES = {
  // Subjects with known break years
  BREAK_SUBJECTS: {
    'Biologie': [7], // Bio reduziert in Klasse 7
    'Physik': [9],   // Physik reduziert in Klasse 9
  },
  
  // Subjects that graduate after certain grades
  TERMINATING_SUBJECTS: {
    // All subjects terminate after grade 10 (Realschule graduation)
  },
  
  // Special handling subjects
  SPECIAL_HANDLING: [
    'KR', 'ER', 'PP', // Religion parallel group
    'FS', 'SW', 'NW', 'IF', 'TC', 'MUS', // Differenzierung parallel group
  ],
} as const;

/**
 * Migration reasons for categorization
 */
export const MIGRATION_REASONS = {
  AUTO: {
    CONTINUOUS_SUBJECT: 'Kontinuierliches Fach - direkte Migration möglich',
    PARALLEL_GROUP_AUTO: 'Parallele Fächergruppe - automatische Migration',
    STANDARD_PROMOTION: 'Standard-Klassenstufenübergang',
  },
  MANUAL: {
    SUBJECT_BREAK: 'Fach pausiert/reduziert in Zieljahrgangsstufe - manuelle Überprüfung erforderlich',
    PARALLEL_GROUP_REVIEW: 'Parallele Fächergruppe - Schülerzuordnung überprüfen',
    HOUR_ADJUSTMENT: 'Stundenzahl ändert sich - manuelle Anpassung erforderlich',
    TEACHER_QUALIFICATION: 'Lehrerqualifikation für Zieljahrgangsstufe überprüfen',
    NON_CONSECUTIVE: 'Nicht-aufeinanderfolgender Jahrgangsstufenwechsel',
  },
  IMPOSSIBLE: {
    GRADUATION: 'Klasse 10 graduiert - keine Migration erforderlich',
    SUBJECT_NOT_AVAILABLE: 'Fach nicht in Zieljahrgangsstufe verfügbar',
    INVALID_GRADE: 'Ungültige Jahrgangsstufe für Migration',
    MISSING_TARGET_CLASS: 'Zielklasse nicht gefunden',
    INACTIVE_TEACHER: 'Lehrer nicht aktiv für nächstes Schuljahr',
  },
} as const;

// ===== CORE MIGRATION FUNCTIONS =====

/**
 * Main assignment migration planning function
 * Analyzes assignments and determines migration feasibility
 */
export function planAssignmentMigrations(
  assignments: Assignment[],
  classPromotions: ClassPromotionPlan[],
  fromYearId: string,
  toYearId: string,
  subjects: Subject[],
  teachers: Teacher[] = [],
  options: AssignmentMigrationOptions = {
    preserveHours: true,
    autoHandleParallelGroups: true,
    validateTeacherQualifications: true,
    includeInactiveTeachers: false,
  }
): AssignmentMigrationResult {
  const opts = assignmentMigrationOptionsSchema.parse(options);
  const decisions: AssignmentDecision[] = [];
  const conflicts: Conflict[] = [];
  
  // Create lookup maps for efficiency
  const classPromotionMap = new Map<string, ClassPromotionPlan>();
  classPromotions.forEach(promotion => {
    classPromotionMap.set(promotion.oldClassId, promotion);
  });
  
  const subjectMap = new Map<string, Subject>();
  subjects.forEach(subject => {
    subjectMap.set(subject.id, subject);
  });
  
  const teacherMap = new Map<string, Teacher>();
  teachers.forEach(teacher => {
    teacherMap.set(teacher.id, teacher);
  });
  
  // Process each assignment
  for (const assignment of assignments) {
    try {
      const decision = evaluateAssignmentMigration(
        assignment,
        classPromotionMap,
        subjectMap,
        teacherMap,
        opts
      );
      
      decisions.push(decision);
      
      // Collect any conflicts from this decision
      const assignmentConflicts = validateAssignmentDecision(decision, assignment, subjectMap, teacherMap);
      conflicts.push(...assignmentConflicts);
      
    } catch (error) {
      // Handle assignment evaluation errors
      conflicts.push({
        type: 'mapping_error',
        severity: 'error',
        message: `Fehler bei Assignment-Evaluation: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        relatedId: assignment.id,
        relatedType: 'assignment',
        suggestedResolution: 'Assignment manuell überprüfen und korrigieren',
        affectedItems: [assignment.id],
      });
    }
  }
  
  // Validate all decisions against schema before returning
  const validatedDecisions: AssignmentDecision[] = [];
  const schemaValidationConflicts: Conflict[] = [];
  
  for (const decision of decisions) {
    try {
      // Validate decision against schema
      const validatedDecision = assignmentDecisionSchema.parse(decision);
      validatedDecisions.push(validatedDecision);
    } catch (error) {
      // Collect schema validation errors as conflicts
      const errorMessage = error instanceof Error ? error.message : 'Schema validation error';
      schemaValidationConflicts.push({
        type: 'mapping_error',
        severity: 'error',
        message: `Assignment decision schema validation failed: ${errorMessage}`,
        relatedId: decision.assignmentId,
        relatedType: 'assignment',
        suggestedResolution: 'Fix assignment decision data to conform to schema requirements',
        affectedItems: [decision.assignmentId],
      });
    }
  }
  
  // Merge all conflicts
  const allConflicts = [...conflicts, ...schemaValidationConflicts];
  
  // Calculate statistics using validated decisions only
  const statistics = calculateMigrationStatistics(validatedDecisions, allConflicts);
  
  return {
    decisions: validatedDecisions,
    statistics,
    conflicts: allConflicts,
  };
}

/**
 * Evaluates migration feasibility for a single assignment
 */
function evaluateAssignmentMigration(
  assignment: Assignment,
  classPromotionMap: Map<string, ClassPromotionPlan>,
  subjectMap: Map<string, Subject>,
  teacherMap: Map<string, Teacher>,
  options: AssignmentMigrationOptions
): AssignmentDecision {
  // Get basic assignment info
  const subject = subjectMap.get(assignment.subjectId);
  const teacher = teacherMap.get(assignment.teacherId);
  const classPromotion = classPromotionMap.get(assignment.classId);
  
  if (!subject) {
    return createImpossibleDecision(
      assignment,
      teacher?.firstName + ' ' + teacher?.lastName || 'Unbekannt',
      'Unknown',
      MIGRATION_REASONS.IMPOSSIBLE.SUBJECT_NOT_AVAILABLE,
      undefined,
      classPromotion
    );
  }
  
  if (!classPromotion) {
    return createImpossibleDecision(
      assignment,
      teacher?.firstName + ' ' + teacher?.lastName || 'Unbekannt',
      subject.shortName,
      MIGRATION_REASONS.IMPOSSIBLE.MISSING_TARGET_CLASS
    );
  }
  
  const currentGrade = classPromotion.oldGrade;
  const targetGrade = classPromotion.newGrade;
  
  // Check for graduation (grade 10 → no migration)
  if (currentGrade === 10) {
    return createImpossibleDecision(
      assignment,
      teacher?.firstName + ' ' + teacher?.lastName || 'Unbekannt',
      subject.shortName,
      MIGRATION_REASONS.IMPOSSIBLE.GRADUATION,
      targetGrade,
      classPromotion
    );
  }
  
  // Check teacher status if validation enabled
  if (options.validateTeacherQualifications && teacher && !teacher.isActive && !options.includeInactiveTeachers) {
    return createImpossibleDecision(
      assignment,
      teacher.firstName + ' ' + teacher.lastName,
      subject.shortName,
      MIGRATION_REASONS.IMPOSSIBLE.INACTIVE_TEACHER,
      targetGrade,
      classPromotion
    );
  }
  
  // Evaluate subject-grade migration using existing function
  const migrationRule = evaluateTeacherMigration(currentGrade, targetGrade, subject.shortName);
  
  // Get parallel group information
  const parallelGroup = getParallelGroupForSubject(subject.shortName);
  
  // Create base decision object
  const baseDecision = {
    assignmentId: assignment.id,
    teacherId: assignment.teacherId,
    teacherName: teacher?.firstName + ' ' + teacher?.lastName || 'Unbekannt',
    subjectShortName: subject.shortName,
    oldClassId: assignment.classId,
    oldClassName: classPromotion.oldClassName,
    oldGrade: currentGrade,
    newClassId: undefined, // Will be set by migration execution engine
    newClassName: classPromotion.newClassName,
    newGrade: targetGrade,
    hoursPerWeek: assignment.hoursPerWeek,
    semester: (assignment.semester === "1" || assignment.semester === "2" ? assignment.semester : "1") as "1" | "2",
    parallelGroup: parallelGroup?.id || null,
    parallelSubjects: parallelGroup?.subjects || undefined,
    notes: [],
  };
  
  // Determine final decision based on migration rule
  switch (migrationRule) {
    case 'auto':
      return {
        ...baseDecision,
        decision: 'auto',
        reason: getAutoMigrationReason(subject.shortName, parallelGroup),
        migrationRule: 'auto',
      };
      
    case 'manual':
      return {
        ...baseDecision,
        decision: 'manual',
        reason: getManualMigrationReason(subject.shortName, currentGrade, targetGrade, parallelGroup),
        migrationRule: 'manual',
        notes: getManualMigrationNotes(subject.shortName, currentGrade, targetGrade),
      };
      
    case 'impossible':
      return {
        ...baseDecision,
        decision: 'impossible',
        reason: MIGRATION_REASONS.IMPOSSIBLE.SUBJECT_NOT_AVAILABLE,
        migrationRule: 'impossible',
      };
      
    default:
      return {
        ...baseDecision,
        decision: 'manual',
        reason: 'Unbekannte Migration-Regel - manuelle Überprüfung erforderlich',
        migrationRule: 'manual',
      };
  }
}

/**
 * Creates an impossible migration decision with proper grade handling
 */
function createImpossibleDecision(
  assignment: Assignment,
  teacherName: string,
  subjectShortName: string,
  reason: string,
  targetGrade?: number,
  classPromotion?: ClassPromotionPlan
): AssignmentDecision {
  // Use actual grade from class promotion or default to valid range
  const oldGrade = classPromotion?.oldGrade || 5; // Default to grade 5 if unknown
  const oldClassName = classPromotion?.oldClassName || 'Unbekannt';
  
  return {
    assignmentId: assignment.id,
    teacherId: assignment.teacherId,
    teacherName,
    subjectShortName,
    oldClassId: assignment.classId,
    oldClassName,
    oldGrade,
    newGrade: targetGrade,
    hoursPerWeek: assignment.hoursPerWeek,
    semester: (assignment.semester === "1" || assignment.semester === "2" ? assignment.semester : "1") as "1" | "2",
    decision: 'impossible',
    reason,
    migrationRule: 'impossible',
  };
}

/**
 * Determines the reason for auto migration
 */
function getAutoMigrationReason(subjectShortName: string, parallelGroup: any): string {
  if (parallelGroup) {
    if (parallelGroup.id === 'Religion') {
      return MIGRATION_REASONS.AUTO.PARALLEL_GROUP_AUTO;
    }
  }
  
  const subjectMapping = NRW_REALSCHULE_SUBJECT_GRADE_MAPPING[subjectShortName];
  if (subjectMapping?.continuity === 'continuous') {
    return MIGRATION_REASONS.AUTO.CONTINUOUS_SUBJECT;
  }
  
  return MIGRATION_REASONS.AUTO.STANDARD_PROMOTION;
}

/**
 * Determines the reason for manual migration
 */
function getManualMigrationReason(
  subjectShortName: string, 
  currentGrade: number, 
  targetGrade: number, 
  parallelGroup: any
): string {
  // Check for subject breaks
  const subjectMapping = NRW_REALSCHULE_SUBJECT_GRADE_MAPPING[subjectShortName];
  if (subjectMapping?.breaks && subjectMapping.breaks.includes(targetGrade)) {
    return MIGRATION_REASONS.MANUAL.SUBJECT_BREAK;
  }
  
  // Check for parallel group review
  if (parallelGroup) {
    if (parallelGroup.id === 'Differenzierung') {
      return MIGRATION_REASONS.MANUAL.PARALLEL_GROUP_REVIEW;
    }
  }
  
  // Check for non-consecutive grades
  if (Math.abs(targetGrade - currentGrade) > 1) {
    return MIGRATION_REASONS.MANUAL.NON_CONSECUTIVE;
  }
  
  return MIGRATION_REASONS.MANUAL.HOUR_ADJUSTMENT;
}

/**
 * Generates notes for manual migration decisions
 */
function getManualMigrationNotes(
  subjectShortName: string,
  currentGrade: number,
  targetGrade: number
): string[] {
  const notes: string[] = [];
  
  // Subject-specific notes
  if (subjectShortName === 'Biologie' && targetGrade === 7) {
    notes.push('Biologie reduziert in Klasse 7 - Stundenzahl anpassen');
  }
  
  if (subjectShortName === 'Physik' && targetGrade === 9) {
    notes.push('Physik reduziert in Klasse 9 - Stundenzahl anpassen');
  }
  
  // Parallel group notes
  const parallelGroup = getParallelGroupForSubject(subjectShortName);
  if (parallelGroup?.id === 'Differenzierung') {
    notes.push('Differenzierungsfach - Schülerwahl kann sich ändern');
    notes.push('Alternative Fächer verfügbar: ' + parallelGroup.subjects.join(', '));
  }
  
  // Grade transition notes
  if (Math.abs(targetGrade - currentGrade) > 1) {
    notes.push(`Ungewöhnlicher Jahrgangsstufenwechsel: ${currentGrade} → ${targetGrade}`);
  }
  
  return notes;
}

// ===== VALIDATION AND CONFLICT DETECTION =====

/**
 * Validates an assignment decision and detects conflicts
 */
function validateAssignmentDecision(
  decision: AssignmentDecision,
  originalAssignment: Assignment,
  subjectMap: Map<string, Subject>,
  teacherMap: Map<string, Teacher>
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  // Validate subject availability in target grade
  if (decision.newGrade && decision.decision !== 'impossible') {
    const availableSubjects = getSubjectAvailability(decision.newGrade);
    if (!availableSubjects.includes(decision.subjectShortName)) {
      conflicts.push({
        type: 'missing_subject',
        severity: 'error',
        message: `Fach "${decision.subjectShortName}" ist in Jahrgangsstufe ${decision.newGrade} nicht verfügbar`,
        relatedId: decision.assignmentId,
        relatedType: 'assignment',
        suggestedResolution: `Fach-Verfügbarkeit überprüfen oder alternative Zuordnung wählen`,
        affectedItems: [decision.assignmentId],
      });
    }
  }
  
  // Validate teacher qualifications
  const teacher = teacherMap.get(decision.teacherId);
  if (teacher && !teacher.subjects.includes(decision.subjectShortName)) {
    conflicts.push({
      type: 'inactive_teacher',
      severity: 'warning',
      message: `Lehrer "${decision.teacherName}" hat "${decision.subjectShortName}" nicht als Unterrichtsfach`,
      relatedId: decision.teacherId,
      relatedType: 'teacher',
      suggestedResolution: 'Lehrerqualifikation überprüfen oder anderen Lehrer zuweisen',
      affectedItems: [decision.assignmentId],
    });
  }
  
  return conflicts;
}

// ===== STATISTICS CALCULATION =====

/**
 * Calculates comprehensive migration statistics
 */
function calculateMigrationStatistics(
  decisions: AssignmentDecision[],
  conflicts: Conflict[]
): AssignmentMigrationStatistics {
  const stats = {
    totalAssignments: decisions.length,
    assignmentsAuto: 0,
    assignmentsManual: 0,
    assignmentsImpossible: 0,
    conflictsCount: conflicts.filter(c => c.severity === 'error').length,
    warningsCount: conflicts.filter(c => c.severity === 'warning').length,
    byGrade: {} as Record<string, { auto: number; manual: number; impossible: number; }>,
    bySubject: {} as Record<string, { auto: number; manual: number; impossible: number; }>,
  };
  
  // Count decisions by type
  decisions.forEach(decision => {
    switch (decision.decision) {
      case 'auto':
        stats.assignmentsAuto++;
        break;
      case 'manual':
        stats.assignmentsManual++;
        break;
      case 'impossible':
        stats.assignmentsImpossible++;
        break;
    }
    
    // By grade statistics
    const gradeKey = `${decision.oldGrade}→${decision.newGrade || 'N/A'}`;
    if (!stats.byGrade[gradeKey]) {
      stats.byGrade[gradeKey] = { auto: 0, manual: 0, impossible: 0 };
    }
    stats.byGrade[gradeKey][decision.decision]++;
    
    // By subject statistics
    const subjectKey = decision.subjectShortName;
    if (!stats.bySubject[subjectKey]) {
      stats.bySubject[subjectKey] = { auto: 0, manual: 0, impossible: 0 };
    }
    stats.bySubject[subjectKey][decision.decision]++;
  });
  
  return stats;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Groups assignment decisions by category for reporting
 */
export function groupDecisionsByCategory(decisions: AssignmentDecision[]): {
  [category: string]: {
    subjects: AssignmentDecision[];
    auto: number;
    manual: number;
    impossible: number;
  }
} {
  const categories = {
    'Kernfächer': { subjects: [], auto: 0, manual: 0, impossible: 0 },
    'Gesellschaftslehre': { subjects: [], auto: 0, manual: 0, impossible: 0 },
    'Naturwissenschaften': { subjects: [], auto: 0, manual: 0, impossible: 0 },
    'Sport & Ästhetik': { subjects: [], auto: 0, manual: 0, impossible: 0 },
    'Religion': { subjects: [], auto: 0, manual: 0, impossible: 0 },
    'Differenzierung': { subjects: [], auto: 0, manual: 0, impossible: 0 },
    'Sonstige': { subjects: [], auto: 0, manual: 0, impossible: 0 },
  } as any;
  
  const subjectCategoryMap: Record<string, string> = {
    'Deutsch': 'Kernfächer',
    'Mathematik': 'Kernfächer', 
    'Englisch': 'Kernfächer',
    'Geschichte': 'Gesellschaftslehre',
    'Politik': 'Gesellschaftslehre',
    'Erdkunde': 'Gesellschaftslehre',
    'Biologie': 'Naturwissenschaften',
    'Physik': 'Naturwissenschaften',
    'Chemie': 'Naturwissenschaften',
    'Sport': 'Sport & Ästhetik',
    'Kunst': 'Sport & Ästhetik',
    'Musik': 'Sport & Ästhetik',
    'KR': 'Religion',
    'ER': 'Religion',
    'PP': 'Religion',
    'FS': 'Differenzierung',
    'SW': 'Differenzierung',
    'NW': 'Differenzierung',
    'IF': 'Differenzierung',
    'TC': 'Differenzierung',
    'MUS': 'Differenzierung',
  };
  
  decisions.forEach(decision => {
    const category = subjectCategoryMap[decision.subjectShortName] || 'Sonstige';
    categories[category].subjects.push(decision);
    categories[category][decision.decision]++;
  });
  
  return categories;
}

/**
 * Generates a summary report of migration decisions
 */
export function generateMigrationSummary(result: AssignmentMigrationResult): {
  overview: string;
  breakdown: string;
  recommendations: string[];
} {
  const { statistics, conflicts, decisions } = result;
  
  const overview = `
Gesamt: ${statistics.totalAssignments} Assignments
✅ Automatisch: ${statistics.assignmentsAuto} (${Math.round(statistics.assignmentsAuto / statistics.totalAssignments * 100)}%)
⚠️  Manuell: ${statistics.assignmentsManual} (${Math.round(statistics.assignmentsManual / statistics.totalAssignments * 100)}%)
❌ Unmöglich: ${statistics.assignmentsImpossible} (${Math.round(statistics.assignmentsImpossible / statistics.totalAssignments * 100)}%)
🔴 Konflikte: ${statistics.conflictsCount}
⚠️  Warnungen: ${statistics.warningsCount}
  `.trim();
  
  const categoryBreakdown = groupDecisionsByCategory(decisions);
  const breakdown = Object.entries(categoryBreakdown)
    .map(([category, data]) => {
      const total = data.auto + data.manual + data.impossible;
      if (total === 0) return null;
      return `${category}: ${data.auto}/${data.manual}/${data.impossible} (Auto/Manual/Unmöglich)`;
    })
    .filter(Boolean)
    .join('\n');
  
  const recommendations = [
    'Überprüfen Sie alle "Manual" Assignments vor der Migration',
    'Biologie 6→7 und Physik 8→9 Assignments manuell anpassen (Pausenjahre)',
    'Differenzierungsfächer: Schülerwahl kann sich ändern',
    'Inaktive Lehrer vor Migration aktivieren oder ersetzen',
  ];
  
  if (statistics.conflictsCount > 0) {
    recommendations.unshift('🔴 Kritische Konflikte zuerst lösen!');
  }
  
  return {
    overview,
    breakdown,
    recommendations,
  };
}