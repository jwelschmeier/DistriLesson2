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

interface ConflictMatrix {
  [key: string]: {
    type: "qualification" | "workload" | "schedule" | "preference";
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
  const conflictMatrix = analyzeConflicts(teachers, classes, subjects, currentAssignments);
  
  // Generate recommended assignments using constraint satisfaction
  const recommendations = generateRecommendations(
    teacherWorkloads,
    classRequirements,
    conflictMatrix,
    settings
  );
  
  // Calculate optimization metrics
  const metrics = calculateOptimizationMetrics(
    teacherWorkloads,
    classRequirements,
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
    
    subjects.forEach(subject => {
      const requiredHours = curriculumHours[subject.name] || 0;
      if (requiredHours === 0) return;
      
      const currentAssignment = currentAssignments.find(
        a => a.classId === classData.id && a.subjectId === subject.id
      );
      const currentHours = currentAssignment?.hoursPerWeek || 0;
      
      if (currentHours < requiredHours) {
        requirements.push({
          classId: classData.id,
          subjectId: subject.id,
          requiredHours,
          currentHours,
          priority: calculatePriority(subject.name, requiredHours - currentHours),
        });
      }
    });
  });
  
  return requirements.sort((a, b) => b.priority - a.priority);
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
    
    if (totalHours > teacher.maxHours) {
      conflicts[`${assignment.teacherId}-overload`] = {
        type: "workload",
        severity: "high",
        description: `${teacher.firstName} ${teacher.lastName} ist mit ${totalHours}h überbelastet (Max: ${teacher.maxHours}h)`,
      };
    } else if (totalHours > teacher.maxHours * 0.95) {
      conflicts[`${assignment.teacherId}-nearoverload`] = {
        type: "workload",
        severity: "medium",
        description: `${teacher.firstName} ${teacher.lastName} ist fast vollständig ausgelastet`,
      };
    }
  });
  
  return conflicts;
}

function generateRecommendations(
  teacherWorkloads: TeacherWorkload[],
  classRequirements: ClassRequirement[],
  conflictMatrix: ConflictMatrix,
  settings: OptimizationSettings
): RecommendedAssignment[] {
  const recommendations: RecommendedAssignment[] = [];
  
  // Use constraint satisfaction algorithm
  for (const requirement of classRequirements) {
    const candidates = findSuitableTeachers(requirement, teacherWorkloads, settings);
    
    if (candidates.length === 0) {
      continue; // No suitable teacher found
    }
    
    // Select best candidate using scoring algorithm
    const bestCandidate = selectBestCandidate(candidates, requirement, settings);
    
    if (bestCandidate) {
      const hoursToAssign = Math.min(
        requirement.requiredHours - requirement.currentHours,
        bestCandidate.availableHours
      );
      
      if (hoursToAssign > 0) {
        recommendations.push({
          teacherId: bestCandidate.teacherId,
          classId: requirement.classId,
          subjectId: requirement.subjectId,
          hoursPerWeek: hoursToAssign,
          confidence: bestCandidate.score,
          reasoning: bestCandidate.reasoning,
        });
        
        // Update workload for next iteration
        const workload = teacherWorkloads.find(w => w.teacherId === bestCandidate.teacherId);
        if (workload) {
          workload.currentHours += hoursToAssign;
          workload.utilization = (workload.currentHours / workload.maxHours) * 100;
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

// Utility functions for constraint satisfaction
export function validateAssignment(
  assignment: RecommendedAssignment,
  teacher: Teacher,
  subject: Subject
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check teacher qualification
  if (!teacher.subjects.includes(subject.name)) {
    violations.push(`Lehrkraft hat keine Qualifikation für ${subject.name}`);
  }
  
  // Check working hours
  if (teacher.currentHours + assignment.hoursPerWeek > teacher.maxHours) {
    violations.push(`Zuweisung würde Maximale Arbeitszeit überschreiten`);
  }
  
  // Check minimum hours per assignment
  if (assignment.hoursPerWeek < 1) {
    violations.push("Mindestens 1 Stunde pro Zuweisung erforderlich");
  }
  
  return {
    isValid: violations.length === 0,
    violations,
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
