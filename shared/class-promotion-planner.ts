import { z } from "zod";
import { Class } from "./schema";
import { 
  ClassPromotionPlan, 
  Conflict, 
  classPromotionPlanSchema,
  conflictSchema 
} from "./migration-types";

/**
 * Class Promotion Planner for German Realschule (Grades 5-10)
 * 
 * Handles automatic promotion of classes from one school year to the next:
 * - Grades 5-9: Promote to next grade (5→6, 6→7, ..., 9→10)
 * - Grade 10: Graduate (no promotion, students receive Mittlere Reife)
 * 
 * Features:
 * - Deterministic naming strategies (auto/manual)
 * - German naming pattern support
 * - Conflict detection and resolution suggestions
 * - Subject hours and teacher preservation
 */

// ===== TYPES AND SCHEMAS =====

export const promotionOptionsSchema = z.object({
  preserveClassTeachers: z.boolean().optional().default(true),
  copySubjectHours: z.boolean().optional().default(true),
  handleEmptyClasses: z.boolean().optional().default(false),
  graduateGrade10: z.boolean().optional().default(true),
});

export const promotionStatisticsSchema = z.object({
  totalClasses: z.number().int().min(0),
  promoted: z.number().int().min(0),
  graduated: z.number().int().min(0),
  manualReview: z.number().int().min(0),
  conflicts: z.number().int().min(0),
});

export const promotionResultSchema = z.object({
  promotions: z.array(classPromotionPlanSchema),
  conflicts: z.array(conflictSchema),
  statistics: promotionStatisticsSchema,
});

export type PromotionOptions = z.infer<typeof promotionOptionsSchema>;
export type PromotionStatistics = z.infer<typeof promotionStatisticsSchema>;
export type PromotionResult = z.infer<typeof promotionResultSchema>;

// ===== CONSTANTS =====

/**
 * Valid grade ranges for German Realschule
 */
export const VALID_GRADES = {
  MIN: 5,
  MAX: 10,
  GRADUATION_GRADE: 10,
} as const;

/**
 * German class naming patterns (regex patterns for detection)
 */
export const GERMAN_CLASS_PATTERNS = {
  // Standard patterns: "5a", "5A", "05a", "05A"
  STANDARD: /^(\d{1,2})([a-zA-Z])$/,
  
  // With spaces: "5 a", "5 A", "05 a"
  WITH_SPACE: /^(\d{1,2})\s+([a-zA-Z])$/,
  
  // With prefix: "Klasse 5a", "Klasse 5A"
  WITH_PREFIX: /^(Klasse\s+)?(\d{1,2})([a-zA-Z])$/i,
  
  // Roman numerals: "V-A", "VI-B" (less common but possible)
  ROMAN: /^([IVX]+)-?([a-zA-Z])$/i,
  
  // Just grade: "5", "05", "10"
  GRADE_ONLY: /^(\d{1,2})$/,
} as const;

/**
 * Roman numeral to Arabic conversion (for grades 5-10)
 */
export const ROMAN_TO_ARABIC = {
  'V': 5,
  'VI': 6,
  'VII': 7,
  'VIII': 8,
  'IX': 9,
  'X': 10,
} as const;

/**
 * Arabic to Roman numeral conversion
 */
export const ARABIC_TO_ROMAN = {
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
  10: 'X',
} as const;

// ===== NAMING FUNCTIONS =====

/**
 * Extracts grade and suffix information from a German class name
 */
export function parseGermanClassName(className: string): {
  grade: number | null;
  suffix: string | null;
  pattern: string | null;
  isValid: boolean;
} {
  const trimmed = className.trim();
  
  // Try standard pattern: "5a", "05a"
  let match = trimmed.match(GERMAN_CLASS_PATTERNS.STANDARD);
  if (match) {
    const grade = parseInt(match[1], 10);
    return {
      grade: isValidGrade(grade) ? grade : null,
      suffix: match[2],
      pattern: 'standard',
      isValid: isValidGrade(grade),
    };
  }
  
  // Try with space: "5 a"
  match = trimmed.match(GERMAN_CLASS_PATTERNS.WITH_SPACE);
  if (match) {
    const grade = parseInt(match[1], 10);
    return {
      grade: isValidGrade(grade) ? grade : null,
      suffix: match[2],
      pattern: 'with_space',
      isValid: isValidGrade(grade),
    };
  }
  
  // Try with prefix: "Klasse 5a"
  match = trimmed.match(GERMAN_CLASS_PATTERNS.WITH_PREFIX);
  if (match) {
    const grade = parseInt(match[2], 10);
    return {
      grade: isValidGrade(grade) ? grade : null,
      suffix: match[3],
      pattern: 'with_prefix',
      isValid: isValidGrade(grade),
    };
  }
  
  // Try Roman numerals: "V-A", "VI-B"
  match = trimmed.match(GERMAN_CLASS_PATTERNS.ROMAN);
  if (match) {
    const romanGrade = match[1].toUpperCase();
    const grade = ROMAN_TO_ARABIC[romanGrade as keyof typeof ROMAN_TO_ARABIC];
    return {
      grade: grade || null,
      suffix: match[2],
      pattern: 'roman',
      isValid: grade !== undefined,
    };
  }
  
  // Try grade only: "5", "10"
  match = trimmed.match(GERMAN_CLASS_PATTERNS.GRADE_ONLY);
  if (match) {
    const grade = parseInt(match[1], 10);
    return {
      grade: isValidGrade(grade) ? grade : null,
      suffix: null,
      pattern: 'grade_only',
      isValid: isValidGrade(grade),
    };
  }
  
  return {
    grade: null,
    suffix: null,
    pattern: null,
    isValid: false,
  };
}

/**
 * Generates a promoted class name based on the original pattern
 */
export function generatePromotedClassName(
  originalName: string,
  currentGrade: number,
  newGrade: number,
): string {
  const parsed = parseGermanClassName(originalName);
  
  if (!parsed.isValid || !parsed.pattern) {
    // Fallback for unparseable names
    return `${newGrade}${parsed.suffix || 'a'}`;
  }
  
  switch (parsed.pattern) {
    case 'standard':
      // "5a" → "6a", maintain leading zero if present
      const hasLeadingZero = originalName.match(/^0\d/);
      const gradeStr = hasLeadingZero ? newGrade.toString().padStart(2, '0') : newGrade.toString();
      return `${gradeStr}${parsed.suffix}`;
      
    case 'with_space':
      // "5 a" → "6 a"
      return `${newGrade} ${parsed.suffix}`;
      
    case 'with_prefix':
      // "Klasse 5a" → "Klasse 6a"
      const prefixMatch = originalName.match(/^(Klasse\s+)/i);
      const prefix = prefixMatch ? prefixMatch[1] : 'Klasse ';
      return `${prefix}${newGrade}${parsed.suffix}`;
      
    case 'roman':
      // "V-A" → "VI-A"
      const romanGrade = ARABIC_TO_ROMAN[newGrade as keyof typeof ARABIC_TO_ROMAN];
      if (romanGrade) {
        const separator = originalName.includes('-') ? '-' : '';
        return `${romanGrade}${separator}${parsed.suffix}`;
      }
      // Fallback to standard if Roman numeral not available
      return `${newGrade}${parsed.suffix}`;
      
    case 'grade_only':
      // "5" → "6"
      return newGrade.toString();
      
    default:
      return `${newGrade}${parsed.suffix || 'a'}`;
  }
}

/**
 * Checks if a grade is valid for German Realschule
 */
export function isValidGrade(grade: number): boolean {
  return grade >= VALID_GRADES.MIN && grade <= VALID_GRADES.MAX;
}

/**
 * Determines if a class should be promoted or graduated
 */
export function getPromotionAction(grade: number): 'promote' | 'graduate' | 'invalid' {
  if (!isValidGrade(grade)) {
    return 'invalid';
  }
  
  if (grade === VALID_GRADES.GRADUATION_GRADE) {
    return 'graduate';
  }
  
  return 'promote';
}

// ===== CONFLICT DETECTION =====

/**
 * Detects naming conflicts when multiple classes would have the same promoted name
 */
export function detectNamingConflicts(
  promotions: ClassPromotionPlan[],
  existingClassNames: string[] = [],
): Conflict[] {
  const conflicts: Conflict[] = [];
  const nameCount = new Map<string, ClassPromotionPlan[]>();
  
  // Group promotions by target name
  promotions.forEach(promotion => {
    const name = promotion.newClassName;
    if (!nameCount.has(name)) {
      nameCount.set(name, []);
    }
    nameCount.get(name)!.push(promotion);
  });
  
  // Check for duplicates within promotions
  nameCount.forEach((classes, targetName) => {
    if (classes.length > 1) {
      conflicts.push({
        type: 'class_name_collision',
        severity: 'error',
        message: `Mehrere Klassen würden den Namen "${targetName}" erhalten: ${classes.map(c => c.oldClassName).join(', ')}`,
        suggestedResolution: `Verwenden Sie manuelle Benennung oder fügen Sie Suffixe hinzu (z.B. "${targetName}-1", "${targetName}-2")`,
        affectedItems: classes.map(c => c.oldClassId),
      });
    }
  });
  
  // Check for conflicts with existing classes in target year
  promotions.forEach(promotion => {
    if (existingClassNames.includes(promotion.newClassName)) {
      conflicts.push({
        type: 'class_name_collision',
        severity: 'error',
        message: `Klasse "${promotion.newClassName}" existiert bereits im Zieljahr`,
        relatedId: promotion.oldClassId,
        relatedType: 'class',
        suggestedResolution: `Wählen Sie einen anderen Namen oder verwenden Sie einen Suffix (z.B. "${promotion.newClassName}-2")`,
        affectedItems: [promotion.oldClassId],
      });
    }
  });
  
  return conflicts;
}

/**
 * Validates class data for potential issues
 */
export function validateClassForPromotion(classData: Class): Conflict[] {
  const conflicts: Conflict[] = [];
  
  // Check for missing or invalid grade
  if (!classData.grade || !isValidGrade(classData.grade)) {
    conflicts.push({
      type: 'mapping_error',
      severity: 'error',
      message: `Klasse "${classData.name}" hat eine ungültige Jahrgangsstufe: ${classData.grade}`,
      relatedId: classData.id,
      relatedType: 'class',
      suggestedResolution: 'Korrigieren Sie die Jahrgangsstufe auf einen Wert zwischen 5 und 10',
      affectedItems: [classData.id],
    });
  }
  
  // Check for empty classes (if option enabled)
  if (classData.studentCount === 0) {
    conflicts.push({
      type: 'mapping_error',
      severity: 'warning',
      message: `Klasse "${classData.name}" hat keine Schüler`,
      relatedId: classData.id,
      relatedType: 'class',
      suggestedResolution: 'Überprüfen Sie, ob diese Klasse befördert werden soll oder gelöscht werden kann',
      affectedItems: [classData.id],
    });
  }
  
  // Check for unparseable class name
  const parsed = parseGermanClassName(classData.name);
  if (!parsed.isValid) {
    conflicts.push({
      type: 'mapping_error',
      severity: 'warning',
      message: `Klassenname "${classData.name}" folgt keinem erkannten deutschen Namensschema`,
      relatedId: classData.id,
      relatedType: 'class',
      suggestedResolution: 'Verwenden Sie manuelle Benennung oder korrigieren Sie den Namen (z.B. "5a", "6B", "Klasse 7c")',
      affectedItems: [classData.id],
    });
  }
  
  return conflicts;
}

// ===== MAIN PLANNING FUNCTION =====

/**
 * Plans class promotions for the transition from one school year to the next
 * 
 * @param fromYearClasses Classes in the source school year
 * @param fromYearId Source school year ID
 * @param toYearId Target school year ID
 * @param namingStrategy 'auto' for automatic naming, 'manual' for manual review
 * @param options Additional options for promotion planning
 * @param existingToYearClassNames Names of classes already existing in target year
 * @returns Promotion plan with conflicts and statistics
 */
export function planClassPromotions(
  fromYearClasses: Class[],
  fromYearId: string,
  toYearId: string,
  namingStrategy: 'auto' | 'manual',
  options: Partial<PromotionOptions> = {},
  existingToYearClassNames: string[] = [],
): PromotionResult {
  const defaultOptions = {
    preserveClassTeachers: true,
    copySubjectHours: true,
    handleEmptyClasses: false,
    graduateGrade10: true,
  };
  const opts = { ...defaultOptions, ...options };
  const promotions: ClassPromotionPlan[] = [];
  const conflicts: Conflict[] = [];
  
  let promotedCount = 0;
  let graduatedCount = 0;
  let manualReviewCount = 0;
  
  // Process each class
  for (const classData of fromYearClasses) {
    // Validate class data
    const classConflicts = validateClassForPromotion(classData);
    conflicts.push(...classConflicts);
    
    // Skip classes with critical errors
    const hasErrors = classConflicts.some(c => c.severity === 'error');
    if (hasErrors) {
      continue;
    }
    
    // Determine promotion action
    const action = getPromotionAction(classData.grade);
    
    if (action === 'invalid') {
      conflicts.push({
        type: 'mapping_error',
        severity: 'error',
        message: `Klasse "${classData.name}" kann nicht befördert werden: ungültige Jahrgangsstufe ${classData.grade}`,
        relatedId: classData.id,
        relatedType: 'class',
        suggestedResolution: 'Korrigieren Sie die Jahrgangsstufe oder schließen Sie diese Klasse von der Beförderung aus',
        affectedItems: [classData.id],
      });
      continue;
    }
    
    if (action === 'graduate') {
      if (opts.graduateGrade10) {
        graduatedCount++;
        // Grade 10 classes graduate - no promotion plan needed
        continue;
      } else {
        // If not graduating grade 10, skip
        continue;
      }
    }
    
    // Handle promotion (grades 5-9)
    const newGrade = classData.grade + 1;
    let newClassName: string;
    
    if (namingStrategy === 'auto') {
      // Automatic naming
      const parsed = parseGermanClassName(classData.name);
      if (parsed.isValid) {
        newClassName = generatePromotedClassName(classData.name, classData.grade, newGrade);
      } else {
        // Fallback for unparseable names
        newClassName = `${newGrade}a`;
        manualReviewCount++;
        conflicts.push({
          type: 'mapping_error',
          severity: 'warning',
          message: `Automatische Benennung für Klasse "${classData.name}" nicht möglich`,
          relatedId: classData.id,
          relatedType: 'class',
          suggestedResolution: `Verwenden Sie den vorgeschlagenen Namen "${newClassName}" oder wählen Sie einen benutzerdefinierten Namen`,
          affectedItems: [classData.id],
        });
      }
    } else {
      // Manual naming - generate default but mark for review
      const parsed = parseGermanClassName(classData.name);
      newClassName = parsed.isValid 
        ? generatePromotedClassName(classData.name, classData.grade, newGrade)
        : `${newGrade}a`;
      manualReviewCount++;
    }
    
    // Create promotion plan
    const promotion: ClassPromotionPlan = {
      oldClassId: classData.id,
      oldClassName: classData.name,
      oldGrade: classData.grade,
      newClassName,
      newGrade,
      subjectHours: opts.copySubjectHours ? { ...classData.subjectHours } : {},
      teacherIds: [], // Will be populated by assignment migration planner
      studentCount: classData.studentCount,
      classTeacher1Id: opts.preserveClassTeachers ? classData.classTeacher1Id : null,
      classTeacher2Id: opts.preserveClassTeachers ? classData.classTeacher2Id : null,
    };
    
    promotions.push(promotion);
    promotedCount++;
  }
  
  // Detect naming conflicts
  const namingConflicts = detectNamingConflicts(promotions, existingToYearClassNames);
  conflicts.push(...namingConflicts);
  
  // Generate statistics
  const statistics: PromotionStatistics = {
    totalClasses: fromYearClasses.length,
    promoted: promotedCount,
    graduated: graduatedCount,
    manualReview: manualReviewCount,
    conflicts: conflicts.filter(c => c.severity === 'error').length,
  };
  
  return {
    promotions,
    conflicts,
    statistics,
  };
}

// ===== UTILITY FUNCTIONS =====

/**
 * Generates suggested alternative names when conflicts occur
 */
export function generateAlternativeNames(
  originalName: string,
  conflictingNames: string[],
  maxSuggestions: number = 3,
): string[] {
  const suggestions: string[] = [];
  const nameSet = new Set(conflictingNames);
  
  // Try numeric suffixes: "6a-1", "6a-2"
  for (let i = 1; i <= maxSuggestions && suggestions.length < maxSuggestions; i++) {
    const candidate = `${originalName}-${i}`;
    if (!nameSet.has(candidate)) {
      suggestions.push(candidate);
    }
  }
  
  // Try letter variations if original has letter suffix
  const parsed = parseGermanClassName(originalName);
  if (parsed.suffix && suggestions.length < maxSuggestions) {
    const suffixCode = parsed.suffix.charCodeAt(0);
    for (let i = 1; i <= 3 && suggestions.length < maxSuggestions; i++) {
      const newSuffixCode = suffixCode + i;
      if (newSuffixCode <= 'z'.charCodeAt(0)) {
        const newSuffix = String.fromCharCode(newSuffixCode);
        const candidate = originalName.replace(parsed.suffix, newSuffix);
        if (!nameSet.has(candidate)) {
          suggestions.push(candidate);
        }
      }
    }
  }
  
  return suggestions;
}

/**
 * Creates a summary of promotion results by grade
 */
export function summarizePromotionsByGrade(promotions: ClassPromotionPlan[]): {
  grade: number;
  count: number;
  classes: string[];
}[] {
  const gradeMap = new Map<number, { count: number; classes: string[] }>();
  
  promotions.forEach(promotion => {
    const grade = promotion.oldGrade;
    if (!gradeMap.has(grade)) {
      gradeMap.set(grade, { count: 0, classes: [] });
    }
    const entry = gradeMap.get(grade)!;
    entry.count++;
    entry.classes.push(`${promotion.oldClassName} → ${promotion.newClassName}`);
  });
  
  return Array.from(gradeMap.entries())
    .map(([grade, data]) => ({ grade, ...data }))
    .sort((a, b) => a.grade - b.grade);
}

/**
 * Validates the complete promotion result
 */
export function validatePromotionResult(result: PromotionResult): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for critical conflicts
  const criticalConflicts = result.conflicts.filter(c => c.severity === 'error');
  if (criticalConflicts.length > 0) {
    errors.push(`${criticalConflicts.length} kritische Konflikte gefunden`);
  }
  
  // Check for naming collisions
  const namingConflicts = result.conflicts.filter(c => c.type === 'class_name_collision');
  if (namingConflicts.length > 0) {
    errors.push(`${namingConflicts.length} Namenskonflikte gefunden`);
  }
  
  // Check statistics consistency
  const { statistics } = result;
  const totalProcessed = statistics.promoted + statistics.graduated;
  if (totalProcessed !== statistics.totalClasses - statistics.conflicts) {
    warnings.push('Statistiken sind inkonsistent - einige Klassen wurden möglicherweise übersprungen');
  }
  
  // Check for empty result
  if (result.promotions.length === 0 && statistics.totalClasses > 0) {
    warnings.push('Keine Klassen zur Beförderung gefunden trotz vorhandener Eingabeklassen');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}