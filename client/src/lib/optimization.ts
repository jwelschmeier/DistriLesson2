import type { Teacher, Class, Subject, Assignment } from "@shared/schema";
import { createCorrectedCurriculumHours } from "@shared/parallel-subjects";

export interface OptimizationConstraints {
  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];
  currentAssignments: Assignment[];
  settings: OptimizationSettings;
}

export interface OptimizationSettings {
  prioritizeQualifications: boolean;
  balanceWorkload: boolean;
  minimizeConflicts: boolean;
  respectMaxHours: boolean;
  allowPartialAssignments: boolean;
}

export interface OptimizationResult {
  newAssignments: number;
  resolvedConflicts: number;
  efficiencyGain: number;
  overallScore: "optimal" | "good" | "warning" | "poor";
  metrics: OptimizationMetric[];
  warnings: string[];
  recommendedAssignments: RecommendedAssignment[];
}

export interface OptimizationMetric {
  name: string;
  score: number;
  description: string;
}

export interface RecommendedAssignment {
  teacherId: string;
  classId: string;
  subjectId: string;
  hoursPerWeek: number;
  confidence: number;
  reasoning: string[];
}

interface TeacherWorkload {
  teacherId: string;
  currentHours: number;
  maxHours: number;
  utilization: number;
  subjects: string[];
  qualifications: string[];
}

interface ClassRequirement {
  classId: string;
  subjectId: string;
  requiredHours: number;
  currentHours: number;
  priority: number;
}

interface ClassTotalHoursConstraint {
  classId: string;
  targetTotalHours: number;
  currentTotalHours: number;
  isHardConstraint: boolean;
  remainingHours: number;
}

interface ConflictMatrix {
  [key: string]: {
    type: "qualification" | "workload" | "schedule" | "preference" | "total_hours";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
  };
}

// NRW Realschule curriculum requirements (Stundentafel) - korrigiert für parallele Fächer
const NRW_CURRICULUM_HOURS: Record<number, Record<string, number>> = createCorrectedCurriculumHours();

export function runOptimization(constraints: OptimizationConstraints): OptimizationResult {
  const { teachers, classes, subjects, currentAssignments, settings } = constraints;
  
  // Initialize optimization state
  const teacherWorkloads = calculateTeacherWorkloads(teachers, currentAssignments);
  const classRequirements = calculateClassRequirements(classes, subjects, currentAssignments);
  const classTotalHoursConstraints = calculateClassTotalHoursConstraints(classes, currentAssignments);
  const conflictMatrix = analyzeConflicts(teachers, classes, subjects, currentAssignments);
  
  // Generate recommended assignments using constraint satisfaction
  const recommendations = generateRecommendations(
    teacherWorkloads,
    classRequirements,
    classTotalHoursConstraints,
    conflictMatrix,
    settings
  );
  
  // Calculate optimization metrics
  const metrics = calculateOptimizationMetrics(
    teacherWorkloads,
    classRequirements,
    classTotalHoursConstraints,
    recommendations,
    settings
  );
  
  // Determine overall score and warnings
  const { overallScore, warnings } = evaluateOptimizationResult(metrics, recommendations);
  
  // Calculate efficiency improvements
  const efficiencyGain = calculateEfficiencyGain(currentAssignments, recommendations);
  const resolvedConflicts = Object.keys(conflictMatrix).length - countRemainingConflicts(recommendations, conflictMatrix);
  
  return {
    newAssignments: recommendations.length,
    resolvedConflicts: Math.max(0, resolvedConflicts),
    efficiencyGain,
    overallScore,
    metrics,
    warnings,
    recommendedAssignments: recommendations,
  };
}

function calculateTeacherWorkloads(teachers: Teacher[], currentAssignments: Assignment[]): TeacherWorkload[] {
  return teachers.map(teacher => {
    const teacherAssignments = currentAssignments.filter(a => a.teacherId === teacher.id);
    const currentHours = teacherAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    
    return {
      teacherId: teacher.id,
      currentHours,
      maxHours: parseFloat(teacher.maxHours),
      utilization: (currentHours / parseFloat(teacher.maxHours)) * 100,
      subjects: teacher.subjects,
      qualifications: teacher.qualifications,
    };
  });
}

function calculateClassRequirements(
  classes: Class[],
  subjects: Subject[],
  currentAssignments: Assignment[]
): ClassRequirement[] {
  const requirements: ClassRequirement[] = [];
  
  classes.forEach(classData => {
    const curriculumHours = NRW_CURRICULUM_HOURS[classData.grade] || {};
    
    // Calculate current total hours for this class
    const classAssignments = currentAssignments.filter(a => a.classId === classData.id);
    const currentTotalHours = classAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    
    // Check if targetHoursTotal is set as a hard constraint
    const targetTotalHours = classData.targetHoursTotal ? parseFloat(classData.targetHoursTotal) : null;
    const totalRemainingHours = targetTotalHours ? targetTotalHours - currentTotalHours : null;
    
    // Build list of unfulfilled subject requirements for this class
    const classSubjectDeficits: Array<{
      subjectId: string;
      subjectName: string;
      currentHours: number;
      requiredHours: number;
      deficit: number;
      priority: number;
    }> = [];
    
    subjects.forEach(subject => {
      const requiredHours = curriculumHours[subject.name] || 0;
      if (requiredHours === 0) return;
      
      const currentAssignment = currentAssignments.find(
        a => a.classId === classData.id && a.subjectId === subject.id
      );
      const currentHours = currentAssignment?.hoursPerWeek || 0;
      
      if (currentHours < requiredHours) {
        const deficit = requiredHours - currentHours;
        classSubjectDeficits.push({
          subjectId: subject.id,
          subjectName: subject.name,
          currentHours,
          requiredHours,
          deficit,
          priority: calculatePriority(subject.name, deficit),
        });
      }
    });
    
    // If we have total hours constraint, implement proper allocation planning
    if (targetTotalHours !== null && totalRemainingHours !== null && classSubjectDeficits.length > 0) {
      // Sort deficits by priority (highest first) for allocation
      classSubjectDeficits.sort((a, b) => b.priority - a.priority);
      
      let availableHours = totalRemainingHours;
      
      // Allocate hours to subjects based on priority and available budget
      classSubjectDeficits.forEach(subjectDeficit => {
        if (availableHours <= 0) return;
        
        // Allocate hours up to the deficit, but not more than available
        const hoursToAllocate = Math.min(subjectDeficit.deficit, availableHours);
        
        if (hoursToAllocate > 0) {
          const adjustedRequiredHours = subjectDeficit.currentHours + hoursToAllocate;
          
          requirements.push({
            classId: classData.id,
            subjectId: subjectDeficit.subjectId,
            requiredHours: adjustedRequiredHours,
            currentHours: subjectDeficit.currentHours,
            priority: subjectDeficit.priority,
          });
          
          // Deduct allocated hours from available budget
          availableHours -= hoursToAllocate;
        }
      });
    } else {
      // No total hours constraint - add all unfulfilled requirements
      classSubjectDeficits.forEach(subjectDeficit => {
        requirements.push({
          classId: classData.id,
          subjectId: subjectDeficit.subjectId,
          requiredHours: subjectDeficit.requiredHours,
          currentHours: subjectDeficit.currentHours,
          priority: subjectDeficit.priority,
        });
      });
    }
  });
  
  return requirements.sort((a, b) => b.priority - a.priority);
}

function calculateClassTotalHoursConstraints(
  classes: Class[],
  currentAssignments: Assignment[]
): ClassTotalHoursConstraint[] {
  const constraints: ClassTotalHoursConstraint[] = [];
  
  classes.forEach(classData => {
    const targetTotalHours = classData.targetHoursTotal ? parseFloat(classData.targetHoursTotal) : null;
    
    if (targetTotalHours !== null) {
      const classAssignments = currentAssignments.filter(a => a.classId === classData.id);
      const currentTotalHours = classAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
      
      constraints.push({
        classId: classData.id,
        targetTotalHours,
        currentTotalHours,
        isHardConstraint: true,
        remainingHours: targetTotalHours - currentTotalHours,
      });
    }
  });
  
  return constraints;
}

function calculatePriority(subjectName: string, hoursDifference: number): number {
  // Core subjects get higher priority
  const coreSubjects = ["Deutsch", "Mathematik", "Englisch"];
  const subjectPriority = coreSubjects.includes(subjectName) ? 100 : 50;
  
  // Larger hour differences get higher priority
  const hoursPriority = hoursDifference * 10;
  
  return subjectPriority + hoursPriority;
}

function analyzeConflicts(
  teachers: Teacher[],
  classes: Class[],
  subjects: Subject[],
  currentAssignments: Assignment[]
): ConflictMatrix {
  const conflicts: ConflictMatrix = {};
  
  currentAssignments.forEach(assignment => {
    const teacher = teachers.find(t => t.id === assignment.teacherId);
    const subject = subjects.find(s => s.id === assignment.subjectId);
    
    if (!teacher || !subject) return;
    
    // Check qualification conflicts
    if (!teacher.subjects.includes(subject.name)) {
      conflicts[`${assignment.id}-qualification`] = {
        type: "qualification",
        severity: "critical",
        description: `${teacher.firstName} ${teacher.lastName} hat keine Qualifikation für ${subject.name}`,
      };
    }
    
    // Check workload conflicts
    const teacherAssignments = currentAssignments.filter(a => a.teacherId === teacher.id);
    const totalHours = teacherAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    const maxHours = parseFloat(teacher.maxHours);
    
    if (totalHours > maxHours) {
      conflicts[`${assignment.teacherId}-overload`] = {
        type: "workload",
        severity: "high",
        description: `${teacher.firstName} ${teacher.lastName} ist mit ${totalHours}h überbelastet (Max: ${maxHours}h)`,
      };
    } else if (totalHours > maxHours * 0.95) {
      conflicts[`${assignment.teacherId}-nearoverload`] = {
        type: "workload",
        severity: "medium",
        description: `${teacher.firstName} ${teacher.lastName} ist fast vollständig ausgelastet`,
      };
    }
  });
  
  // ENHANCED: Check class total hours conflicts with detailed analysis
  classes.forEach(classData => {
    const targetTotalHours = classData.targetHoursTotal ? parseFloat(classData.targetHoursTotal) : null;
    if (targetTotalHours === null) return;
    
    const classAssignments = currentAssignments.filter(a => a.classId === classData.id);
    const currentTotalHours = classAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    const remainingHours = targetTotalHours - currentTotalHours;
    
    // CRITICAL: Hard constraint violation detection
    if (currentTotalHours > targetTotalHours) {
      conflicts[`${classData.id}-total-hours-exceeded`] = {
        type: "total_hours",
        severity: "critical",
        description: `HARTE CONSTRAINT VERLETZT: Klasse ${classData.name} überschreitet Gesamtstunden-Limit: ${currentTotalHours}h > ${targetTotalHours}h (Überschreitung: ${currentTotalHours - targetTotalHours}h)`,
      };
    }
    
    // ENHANCED: Detect potential assignment attempt conflicts
    if (remainingHours > 0 && remainingHours < 2) {
      conflicts[`${classData.id}-total-hours-almost-full`] = {
        type: "total_hours",
        severity: "high",
        description: `Klasse ${classData.name} hat nur noch ${remainingHours}h Spielraum (${currentTotalHours}h/${targetTotalHours}h) - Weitere Zuweisungen stark eingeschränkt`,
      };
    }
    
    // Check for underutilization (but only warn, not critical)
    if (currentTotalHours < targetTotalHours * 0.8) {
      conflicts[`${classData.id}-total-hours-underutilized`] = {
        type: "total_hours",
        severity: "medium",
        description: `Klasse ${classData.name} hat deutlich zu wenige Stunden: ${currentTotalHours}h < ${targetTotalHours}h (Bedarf: ${targetTotalHours - currentTotalHours}h)`,
      };
    }
    
    // CRITICAL: Detect impossible curriculum requirements vs total hours constraint
    const curriculumHours = NRW_CURRICULUM_HOURS[classData.grade] || {};
    const totalCurriculumRequired = Object.values(curriculumHours).reduce((sum: number, hours: number) => sum + hours, 0);
    
    if (totalCurriculumRequired > targetTotalHours) {
      conflicts[`${classData.id}-impossible-curriculum`] = {
        type: "total_hours",
        severity: "critical",
        description: `UNMÖGLICHE KONFIGURATION: Klasse ${classData.name} (Stufe ${classData.grade}): Curriculum benötigt ${totalCurriculumRequired}h, aber Limit ist ${targetTotalHours}h (Defizit: ${totalCurriculumRequired - targetTotalHours}h)`,
      };
    }
  });
  
  // ENHANCED: Check for assignment attempt conflicts that would violate constraints
  teachers.forEach(teacher => {
    const teacherAssignments = currentAssignments.filter(a => a.teacherId === teacher.id);
    const teacherCurrentHours = teacherAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    const maxHours = parseFloat(teacher.maxHours);
    const teacherRemainingHours = maxHours - teacherCurrentHours;
    
    // Detect teachers who cannot take any more assignments
    if (teacherRemainingHours <= 0) {
      conflicts[`${teacher.id}-no-capacity`] = {
        type: "workload",
        severity: "high",
        description: `Lehrkraft ${teacher.firstName} ${teacher.lastName} hat keine Kapazität für weitere Zuweisungen (${teacherCurrentHours}h/${maxHours}h)`,
      };
    } else if (teacherRemainingHours < 2) {
      conflicts[`${teacher.id}-minimal-capacity`] = {
        type: "workload",
        severity: "medium",
        description: `Lehrkraft ${teacher.firstName} ${teacher.lastName} hat nur noch minimale Kapazität: ${teacherRemainingHours}h verfügbar`,
      };
    }
  });
  
  return conflicts;
}

// NEW: Function to detect conflicts for potential assignments before they are made
export function detectAssignmentConflicts(
  potentialAssignment: RecommendedAssignment,
  teachers: Teacher[],
  classes: Class[],
  subjects: Subject[],
  currentAssignments: Assignment[]
): { hasConflicts: boolean; conflicts: string[]; warnings: string[] } {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  
  const teacher = teachers.find(t => t.id === potentialAssignment.teacherId);
  const classData = classes.find(c => c.id === potentialAssignment.classId);
  const subject = subjects.find(s => s.id === potentialAssignment.subjectId);
  
  if (!teacher || !classData || !subject) {
    conflicts.push("Ungültige Entitäts-IDs in Zuweisung");
    return { hasConflicts: true, conflicts, warnings };
  }
  
  // Check teacher workload conflicts
  const teacherAssignments = currentAssignments.filter(a => a.teacherId === teacher.id);
  const teacherCurrentHours = teacherAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
  const projectedTeacherHours = teacherCurrentHours + potentialAssignment.hoursPerWeek;
  const maxHours = parseFloat(teacher.maxHours);
  
  if (projectedTeacherHours > maxHours) {
    conflicts.push(`Lehrkraft Überbelastung: ${teacher.firstName} ${teacher.lastName} würde ${projectedTeacherHours}h haben (Max: ${maxHours}h)`);
  }
  
  // Check teacher qualification conflicts
  if (!teacher.subjects.includes(subject.name)) {
    warnings.push(`Qualifikationskonflikt: ${teacher.firstName} ${teacher.lastName} hat keine Qualifikation für ${subject.name}`);
  }
  
  // CRITICAL: Check total hours constraint conflicts
  if (classData.targetHoursTotal) {
    const targetTotalHours = parseFloat(classData.targetHoursTotal);
    const classAssignments = currentAssignments.filter(a => a.classId === classData.id);
    const currentClassHours = classAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
    const projectedClassHours = currentClassHours + potentialAssignment.hoursPerWeek;
    
    if (projectedClassHours > targetTotalHours) {
      conflicts.push(`HARTE CONSTRAINT: Klasse ${classData.name} würde Gesamtstunden-Limit überschreiten: ${projectedClassHours}h > ${targetTotalHours}h`);
    }
    
    const remainingAfterAssignment = targetTotalHours - projectedClassHours;
    if (remainingAfterAssignment < 1 && projectedClassHours < targetTotalHours) {
      warnings.push(`Wenig Spielraum: Nach Zuweisung nur noch ${remainingAfterAssignment}h verfügbar für Klasse ${classData.name}`);
    }
  }
  
  // Check for duplicate assignments
  const duplicateAssignment = currentAssignments.find(
    a => a.teacherId === potentialAssignment.teacherId && 
         a.classId === potentialAssignment.classId && 
         a.subjectId === potentialAssignment.subjectId
  );
  
  if (duplicateAssignment) {
    conflicts.push(`Duplikat-Zuweisung: ${teacher.firstName} ${teacher.lastName} unterrichtet bereits ${subject.name} in ${classData.name}`);
  }
  
  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    warnings,
  };
}

function generateRecommendations(
  teacherWorkloads: TeacherWorkload[],
  classRequirements: ClassRequirement[],
  classTotalHoursConstraints: ClassTotalHoursConstraint[],
  conflictMatrix: ConflictMatrix,
  settings: OptimizationSettings
): RecommendedAssignment[] {
  const recommendations: RecommendedAssignment[] = [];
  
  // Create a working copy of class hours tracking for HARD constraint enforcement
  const classRemainingHours = new Map<string, number>();
  classTotalHoursConstraints.forEach(constraint => {
    classRemainingHours.set(constraint.classId, constraint.remainingHours);
  });
  
  // Use constraint satisfaction algorithm with HARD enforcement
  for (const requirement of classRequirements) {
    // HARD CONSTRAINT CHECK: Skip if no hours remaining for this class
    const constraint = classTotalHoursConstraints.find(c => c.classId === requirement.classId);
    if (constraint && constraint.isHardConstraint) {
      const remainingHours = classRemainingHours.get(requirement.classId) || 0;
      
      // HARD BLOCK: Absolutely no assignments if no hours remaining
      if (remainingHours <= 0) {
        continue; // Skip this requirement completely - HARD constraint enforcement
      }
    }
    
    const candidates = findSuitableTeachers(requirement, teacherWorkloads, settings);
    
    if (candidates.length === 0) {
      continue; // No suitable teacher found
    }
    
    // Select best candidate using scoring algorithm
    const bestCandidate = selectBestCandidate(candidates, requirement, settings);
    
    if (bestCandidate) {
      // Calculate maximum assignable hours considering all constraints
      let hoursToAssign = Math.min(
        requirement.requiredHours - requirement.currentHours,
        bestCandidate.availableHours
      );
      
      // HARD CONSTRAINT: Apply total hours constraint for this class
      if (constraint && constraint.isHardConstraint) {
        const remainingClassHours = classRemainingHours.get(requirement.classId) || 0;
        
        // NEVER exceed the total hours limit - this is a HARD constraint
        hoursToAssign = Math.min(hoursToAssign, remainingClassHours);
      }
      
      // Only proceed if we can assign at least 1 hour and have budget remaining
      if (hoursToAssign > 0) {
        // Create the assignment
        const assignment: RecommendedAssignment = {
          teacherId: bestCandidate.teacherId,
          classId: requirement.classId,
          subjectId: requirement.subjectId,
          hoursPerWeek: hoursToAssign,
          confidence: bestCandidate.score,
          reasoning: [
            ...bestCandidate.reasoning,
            constraint ? `Harte Constraint: ${hoursToAssign}h von ${classRemainingHours.get(requirement.classId)}h verfügbar` : ""
          ].filter(Boolean),
        };
        
        recommendations.push(assignment);
        
        // Update teacher workload for next iteration
        const workload = teacherWorkloads.find(w => w.teacherId === bestCandidate.teacherId);
        if (workload) {
          workload.currentHours += hoursToAssign;
          workload.utilization = (workload.currentHours / workload.maxHours) * 100;
        }
        
        // CRITICAL: Update class remaining hours tracking for HARD constraint enforcement
        if (constraint) {
          const currentRemaining = classRemainingHours.get(requirement.classId) || 0;
          const newRemaining = currentRemaining - hoursToAssign;
          classRemainingHours.set(requirement.classId, Math.max(0, newRemaining));
          
          // SAFETY CHECK: Ensure we never go negative (this should never happen with proper logic)
          if (newRemaining < 0) {
            console.error(`CRITICAL ERROR: Class ${requirement.classId} remaining hours went negative: ${newRemaining}`);
          }
        }
      }
    }
  }
  
  return recommendations;
}

interface TeacherCandidate {
  teacherId: string;
  score: number;
  availableHours: number;
  reasoning: string[];
}

function findSuitableTeachers(
  requirement: ClassRequirement,
  teacherWorkloads: TeacherWorkload[],
  settings: OptimizationSettings
): TeacherCandidate[] {
  const candidates: TeacherCandidate[] = [];
  
  teacherWorkloads.forEach(workload => {
    const reasoning: string[] = [];
    let score = 0;
    
    // Get subject name for this requirement
    // Note: In a real implementation, we'd need access to the subjects array
    // For now, we'll work with what we have in the workload
    
    const availableHours = workload.maxHours - workload.currentHours;
    
    // Skip if no available hours
    if (availableHours <= 0 && settings.respectMaxHours) {
      return;
    }
    
    // Check qualifications (assuming subject name is in workload.subjects)
    const hasQualification = workload.subjects.length > 0; // Simplified check
    
    if (hasQualification || !settings.prioritizeQualifications) {
      score += hasQualification ? 100 : 20;
      reasoning.push(hasQualification ? "Hat Qualifikation für das Fach" : "Keine direkte Qualifikation");
    } else {
      return; // Skip if qualification required but not present
    }
    
    // Workload balancing score
    if (settings.balanceWorkload) {
      const idealUtilization = 85; // 85% utilization is considered ideal
      const utilizationScore = 100 - Math.abs(workload.utilization - idealUtilization);
      score += utilizationScore * 0.5;
      reasoning.push(`Aktuelle Auslastung: ${workload.utilization.toFixed(1)}%`);
    }
    
    // Available hours bonus
    const hoursScore = Math.min(availableHours * 10, 50);
    score += hoursScore;
    reasoning.push(`Verfügbare Stunden: ${availableHours}`);
    
    candidates.push({
      teacherId: workload.teacherId,
      score,
      availableHours,
      reasoning,
    });
  });
  
  return candidates.sort((a, b) => b.score - a.score);
}

function selectBestCandidate(
  candidates: TeacherCandidate[],
  requirement: ClassRequirement,
  settings: OptimizationSettings
): TeacherCandidate | null {
  if (candidates.length === 0) return null;
  
  // Apply additional scoring based on specific requirements
  const scoredCandidates = candidates.map(candidate => {
    let adjustedScore = candidate.score;
    
    // Prefer candidates with more available hours for larger requirements
    const hoursNeeded = requirement.requiredHours - requirement.currentHours;
    if (candidate.availableHours >= hoursNeeded) {
      adjustedScore += 20;
      candidate.reasoning.push("Kann alle benötigten Stunden übernehmen");
    }
    
    return { ...candidate, score: adjustedScore };
  });
  
  return scoredCandidates.sort((a, b) => b.score - a.score)[0];
}

function calculateOptimizationMetrics(
  teacherWorkloads: TeacherWorkload[],
  classRequirements: ClassRequirement[],
  classTotalHoursConstraints: ClassTotalHoursConstraint[],
  recommendations: RecommendedAssignment[],
  settings: OptimizationSettings
): OptimizationMetric[] {
  const metrics: OptimizationMetric[] = [];
  
  // Qualification matching score
  const qualificationScore = calculateQualificationScore(recommendations, teacherWorkloads);
  metrics.push({
    name: "Qualifikationsabgleich",
    score: qualificationScore,
    description: "Prozentsatz der Zuweisungen mit passender Lehrerqualifikation",
  });
  
  // Workload balance score
  const workloadScore = calculateWorkloadBalanceScore(teacherWorkloads);
  metrics.push({
    name: "Arbeitsbelastungsverteilung",
    score: workloadScore,
    description: "Gleichmäßigkeit der Arbeitsbelastung zwischen Lehrkräften",
  });
  
  // Coverage score
  const coverageScore = calculateCoverageScore(classRequirements, recommendations);
  metrics.push({
    name: "Stundenabdeckung",
    score: coverageScore,
    description: "Prozentsatz der erforderlichen Stunden, die zugewiesen wurden",
  });
  
  // Efficiency score
  const efficiencyScore = calculateEfficiencyScore(teacherWorkloads, recommendations);
  metrics.push({
    name: "Ressourceneffizienz",
    score: efficiencyScore,
    description: "Optimale Nutzung der verfügbaren Lehrerstunden",
  });
  
  // Total hours constraint compliance score
  const totalHoursComplianceScore = calculateTotalHoursComplianceScore(classTotalHoursConstraints, recommendations);
  metrics.push({
    name: "Gesamtstunden-Einhaltung",
    score: totalHoursComplianceScore,
    description: "Einhaltung der Gesamtstunden-Limits pro Klasse",
  });
  
  return metrics;
}

function calculateQualificationScore(
  recommendations: RecommendedAssignment[],
  teacherWorkloads: TeacherWorkload[]
): number {
  if (recommendations.length === 0) return 100;
  
  const qualifiedAssignments = recommendations.filter(rec => {
    const teacher = teacherWorkloads.find(w => w.teacherId === rec.teacherId);
    return teacher && teacher.subjects.length > 0; // Simplified qualification check
  });
  
  return (qualifiedAssignments.length / recommendations.length) * 100;
}

function calculateWorkloadBalanceScore(teacherWorkloads: TeacherWorkload[]): number {
  if (teacherWorkloads.length === 0) return 100;
  
  const utilizations = teacherWorkloads.map(w => w.utilization);
  const avgUtilization = utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length;
  
  // Calculate standard deviation
  const variance = utilizations.reduce((sum, u) => sum + Math.pow(u - avgUtilization, 2), 0) / utilizations.length;
  const stdDev = Math.sqrt(variance);
  
  // Lower standard deviation = better balance
  // Score decreases as standard deviation increases
  const maxStdDev = 30; // Assume 30% is maximum acceptable deviation
  const balanceScore = Math.max(0, 100 - (stdDev / maxStdDev) * 100);
  
  return balanceScore;
}

function calculateCoverageScore(
  requirements: ClassRequirement[],
  recommendations: RecommendedAssignment[]
): number {
  if (requirements.length === 0) return 100;
  
  let totalRequired = 0;
  let totalAssigned = 0;
  
  requirements.forEach(req => {
    const deficit = req.requiredHours - req.currentHours;
    totalRequired += deficit;
    
    const assignment = recommendations.find(
      rec => rec.classId === req.classId && rec.subjectId === req.subjectId
    );
    totalAssigned += assignment?.hoursPerWeek || 0;
  });
  
  return totalRequired > 0 ? (totalAssigned / totalRequired) * 100 : 100;
}

function calculateEfficiencyScore(
  teacherWorkloads: TeacherWorkload[],
  recommendations: RecommendedAssignment[]
): number {
  const totalAvailableHours = teacherWorkloads.reduce(
    (sum, w) => sum + (w.maxHours - w.currentHours), 0
  );
  const totalRecommendedHours = recommendations.reduce(
    (sum, r) => sum + r.hoursPerWeek, 0
  );
  
  if (totalAvailableHours === 0) return 100;
  
  return Math.min(100, (totalRecommendedHours / totalAvailableHours) * 100);
}

function evaluateOptimizationResult(
  metrics: OptimizationMetric[],
  recommendations: RecommendedAssignment[]
): { overallScore: "optimal" | "good" | "warning" | "poor"; warnings: string[] } {
  const warnings: string[] = [];
  
  // Calculate average metric score
  const avgScore = metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length;
  
  // Check for specific warnings
  const qualificationMetric = metrics.find(m => m.name === "Qualifikationsabgleich");
  if (qualificationMetric && qualificationMetric.score < 80) {
    warnings.push("Einige Zuweisungen erfolgen an Lehrkräfte ohne passende Qualifikation");
  }
  
  const workloadMetric = metrics.find(m => m.name === "Arbeitsbelastungsverteilung");
  if (workloadMetric && workloadMetric.score < 70) {
    warnings.push("Ungleichmäßige Verteilung der Arbeitsbelastung erkannt");
  }
  
  const coverageMetric = metrics.find(m => m.name === "Stundenabdeckung");
  if (coverageMetric && coverageMetric.score < 90) {
    warnings.push("Nicht alle erforderlichen Stunden konnten zugewiesen werden");
  }
  
  const totalHoursMetric = metrics.find(m => m.name === "Gesamtstunden-Einhaltung");
  if (totalHoursMetric && totalHoursMetric.score < 100) {
    warnings.push("Gesamtstunden-Limits wurden verletzt oder nicht vollständig ausgeschöpft");
  }
  
  if (recommendations.length === 0) {
    warnings.push("Keine neuen Zuweisungen möglich mit den aktuellen Einstellungen");
  }
  
  // Determine overall score
  let overallScore: "optimal" | "good" | "warning" | "poor";
  if (avgScore >= 95) {
    overallScore = "optimal";
  } else if (avgScore >= 85) {
    overallScore = "good";
  } else if (avgScore >= 70) {
    overallScore = "warning";
  } else {
    overallScore = "poor";
  }
  
  return { overallScore, warnings };
}

function calculateEfficiencyGain(
  currentAssignments: Assignment[],
  recommendations: RecommendedAssignment[]
): number {
  // Calculate efficiency improvement based on various factors
  const newHours = recommendations.reduce((sum, r) => sum + r.hoursPerWeek, 0);
  const currentHours = currentAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
  
  if (currentHours === 0) return newHours > 0 ? 100 : 0;
  
  // Simple efficiency gain calculation
  const gain = (newHours / (currentHours + newHours)) * 100;
  return Math.min(gain, 100);
}

function countRemainingConflicts(
  recommendations: RecommendedAssignment[],
  conflictMatrix: ConflictMatrix
): number {
  // This would need more sophisticated logic to determine which conflicts
  // are resolved by the recommendations
  // For now, return a simplified count
  return Math.max(0, Object.keys(conflictMatrix).length - recommendations.length);
}

function calculateTotalHoursComplianceScore(
  classTotalHoursConstraints: ClassTotalHoursConstraint[],
  recommendations: RecommendedAssignment[]
): number {
  if (classTotalHoursConstraints.length === 0) return 100;
  
  let compliantClasses = 0;
  
  classTotalHoursConstraints.forEach(constraint => {
    const classRecommendations = recommendations.filter(r => r.classId === constraint.classId);
    const recommendedHours = classRecommendations.reduce((sum, r) => sum + r.hoursPerWeek, 0);
    const projectedTotal = constraint.currentTotalHours + recommendedHours;
    
    // Allow for a small tolerance (0.5 hours) for practical scheduling
    const tolerance = 0.5;
    if (Math.abs(projectedTotal - constraint.targetTotalHours) <= tolerance) {
      compliantClasses++;
    }
  });
  
  return (compliantClasses / classTotalHoursConstraints.length) * 100;
}

// Utility functions for constraint satisfaction
export function validateAssignment(
  assignment: RecommendedAssignment,
  teacher: Teacher,
  subject: Subject,
  classData?: Class,
  currentClassTotalHours?: number,
  teacherCurrentHours?: number
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check teacher qualification
  if (!teacher.subjects.includes(subject.name)) {
    violations.push(`Lehrkraft hat keine Qualifikation für ${subject.name}`);
  }
  
  // Check working hours - use provided teacherCurrentHours or calculate from maxHours
  const currentHours = teacherCurrentHours ?? 0;
  const maxHours = parseFloat(teacher.maxHours);
  
  if (currentHours + assignment.hoursPerWeek > maxHours) {
    violations.push(`Zuweisung würde Maximale Arbeitszeit überschreiten: ${currentHours + assignment.hoursPerWeek}h > ${maxHours}h`);
  }
  
  // Check minimum hours per assignment
  if (assignment.hoursPerWeek < 1) {
    violations.push("Mindestens 1 Stunde pro Zuweisung erforderlich");
  }
  
  // CRITICAL: Enhanced total hours constraint validation for class
  if (classData?.targetHoursTotal && currentClassTotalHours !== undefined) {
    const targetTotal = parseFloat(classData.targetHoursTotal);
    const projectedTotal = currentClassTotalHours + assignment.hoursPerWeek;
    
    // HARD CONSTRAINT: Never allow exceeding target total hours
    if (projectedTotal > targetTotal) {
      violations.push(`HARTE CONSTRAINT VERLETZT: Zuweisung würde Gesamtstunden-Limit der Klasse überschreiten: ${projectedTotal}h > ${targetTotal}h`);
    }
    
    // Also check if assignment leaves no room for other required subjects
    const remainingAfterAssignment = targetTotal - projectedTotal;
    if (remainingAfterAssignment < 0) {
      violations.push(`KRITISCHER FEHLER: Negative verbleibende Stunden nach Zuweisung: ${remainingAfterAssignment}h`);
    }
  }
  
  // Check for zero or negative hour assignments
  if (assignment.hoursPerWeek <= 0) {
    violations.push("Zuweisungen müssen mindestens 1 Stunde haben");
  }
  
  // Validate assignment IDs are not empty
  if (!assignment.teacherId || !assignment.classId || !assignment.subjectId) {
    violations.push("Alle Zuweisungs-IDs müssen gültig sein (teacherId, classId, subjectId)");
  }
  
  return {
    isValid: violations.length === 0,
    violations,
  };
}

// Enhanced validation function that checks assignment against complete constraint context
export function validateAssignmentWithContext(
  assignment: RecommendedAssignment,
  teachers: Teacher[],
  subjects: Subject[],
  classes: Class[],
  currentAssignments: Assignment[],
  classTotalHoursConstraints: ClassTotalHoursConstraint[]
): { isValid: boolean; violations: string[]; warnings: string[] } {
  const violations: string[] = [];
  const warnings: string[] = [];
  
  // Find relevant entities
  const teacher = teachers.find(t => t.id === assignment.teacherId);
  const subject = subjects.find(s => s.id === assignment.subjectId);
  const classData = classes.find(c => c.id === assignment.classId);
  const constraint = classTotalHoursConstraints.find(c => c.classId === assignment.classId);
  
  if (!teacher) {
    violations.push(`Lehrkraft mit ID ${assignment.teacherId} nicht gefunden`);
    return { isValid: false, violations, warnings };
  }
  
  if (!subject) {
    violations.push(`Fach mit ID ${assignment.subjectId} nicht gefunden`);
    return { isValid: false, violations, warnings };
  }
  
  if (!classData) {
    violations.push(`Klasse mit ID ${assignment.classId} nicht gefunden`);
    return { isValid: false, violations, warnings };
  }
  
  // Calculate current teacher hours
  const teacherAssignments = currentAssignments.filter(a => a.teacherId === teacher.id);
  const teacherCurrentHours = teacherAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
  
  // Calculate current class hours
  const classAssignments = currentAssignments.filter(a => a.classId === assignment.classId);
  const currentClassTotalHours = classAssignments.reduce((sum, a) => sum + a.hoursPerWeek, 0);
  
  // Use basic validation first
  const basicValidation = validateAssignment(
    assignment,
    teacher,
    subject,
    classData,
    currentClassTotalHours,
    teacherCurrentHours
  );
  
  violations.push(...basicValidation.violations);
  
  // Enhanced constraint-specific validations
  if (constraint) {
    const projectedClassTotal = currentClassTotalHours + assignment.hoursPerWeek;
    const remainingHours = constraint.targetTotalHours - projectedClassTotal;
    
    // Hard constraint: never exceed target total hours
    if (projectedClassTotal > constraint.targetTotalHours) {
      violations.push(`HARTE CONSTRAINT: Klasse ${classData.name} würde Limit überschreiten: ${projectedClassTotal}h > ${constraint.targetTotalHours}h`);
    }
    
    // Warning: if this assignment uses significant portion of remaining hours
    if (remainingHours >= 0 && remainingHours < 2 && assignment.hoursPerWeek > 2) {
      warnings.push(`Warnung: Zuweisung verbraucht fast alle verbleibenden Stunden (${remainingHours}h übrig)`);
    }
  }
  
  // Check for duplicate assignment (same teacher, class, subject)
  const duplicateAssignment = currentAssignments.find(
    a => a.teacherId === assignment.teacherId && 
         a.classId === assignment.classId && 
         a.subjectId === assignment.subjectId
  );
  
  if (duplicateAssignment) {
    violations.push(`Duplikat-Zuweisung: ${teacher.firstName} ${teacher.lastName} unterrichtet bereits ${subject.name} in ${classData.name}`);
  }
  
  return {
    isValid: violations.length === 0,
    violations,
    warnings,
  };
}

export function generateOptimizationReport(result: OptimizationResult): string {
  const lines: string[] = [];
  
  lines.push("=== OPTIMIERUNGSBERICHT ===");
  lines.push(`Datum: ${new Date().toLocaleDateString("de-DE")}`);
  lines.push("");
  
  lines.push("ZUSAMMENFASSUNG:");
  lines.push(`- Neue Zuweisungen: ${result.newAssignments}`);
  lines.push(`- Gelöste Konflikte: ${result.resolvedConflicts}`);
  lines.push(`- Effizienzsteigerung: ${result.efficiencyGain}%`);
  lines.push(`- Gesamtbewertung: ${result.overallScore}`);
  lines.push("");
  
  lines.push("METRIKEN:");
  result.metrics.forEach(metric => {
    lines.push(`- ${metric.name}: ${metric.score.toFixed(1)}%`);
    lines.push(`  ${metric.description}`);
  });
  lines.push("");
  
  if (result.warnings.length > 0) {
    lines.push("WARNUNGEN:");
    result.warnings.forEach(warning => {
      lines.push(`- ${warning}`);
    });
    lines.push("");
  }
  
  lines.push("EMPFOHLENE ZUWEISUNGEN:");
  result.recommendedAssignments.forEach((assignment, index) => {
    lines.push(`${index + 1}. Lehrer: ${assignment.teacherId}`);
    lines.push(`   Klasse: ${assignment.classId}`);
    lines.push(`   Fach: ${assignment.subjectId}`);
    lines.push(`   Stunden: ${assignment.hoursPerWeek}`);
    lines.push(`   Vertrauen: ${assignment.confidence.toFixed(1)}%`);
    lines.push(`   Begründung: ${assignment.reasoning.join(", ")}`);
    lines.push("");
  });
  
  return lines.join("\n");
}
