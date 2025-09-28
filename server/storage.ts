import { 
  teachers, 
  students, 
  classes, 
  subjects, 
  assignments, 
  planstellen,
  planstellenScenarios,
  schoolYears,
  users,
  invitations,
  subjectMappings,
  pdfImports,
  pdfTables,
  type Teacher, 
  type InsertTeacher,
  type Student,
  type InsertStudent,
  type Class,
  type InsertClass,
  type Subject,
  type InsertSubject,
  type Assignment,
  type InsertAssignment,
  type Planstelle,
  type InsertPlanstelle,
  type PlanstellenScenario,
  type InsertPlanstellenScenario,
  type SchoolYear,
  type InsertSchoolYear,
  type User,
  type UpsertUser,
  type InsertUser,
  type Invitation,
  type InsertInvitation,
  type SubjectMapping,
  type InsertSubjectMapping,
  type PdfImport,
  type InsertPdfImport,
  type PdfTable,
  type InsertPdfTable,
  type PlanstellenInput
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

// School Year Transition Types
export interface ClassTransition {
  from: Class;
  to: Class | null; // null = graduated class (10th grade)
  action: "migrate" | "graduate" | "create_new";
  studentCount: number;
  newGrade?: number;
  newName?: string;
}

export interface AssignmentMigration {
  assignment: Assignment;
  status: "auto_migrate" | "manual_check" | "not_migratable";
  reason?: string;
  targetGrade?: number;
  targetHours?: number;
  newAssignment?: Partial<InsertAssignment>;
}

export interface SchoolYearTransitionPreview {
  classTransitions: ClassTransition[];
  assignmentMigrations: AssignmentMigration[];
  newClasses: {
    name: string;
    grade: number;
    expectedStudentCount: number;
  }[];
  statistics: {
    totalAssignments: number;
    autoMigrations: number;
    manualChecks: number;
    nonMigratable: number;
    graduatedClasses: number;
    continuingClasses: number;
  };
}

export interface SchoolYearTransitionParams {
  newClasses: {
    name: string;
    grade: number;
    expectedStudentCount: number;
  }[];
  migrationRules: {
    autoMigrateContinuousSubjects: boolean;
    handleDifferenzierung: boolean;
    archiveGraduatedClasses: boolean;
  };
}

export interface SchoolYearTransitionResult {
  success: boolean;
  newSchoolYear: SchoolYear;
  migratedClasses: number;
  migratedAssignments: number;
  migratedStudents: number;
  createdNewClasses: number;
  graduatedClasses: number;
  errors: string[];
}

export interface SchoolYearTransitionValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  statistics: {
    totalTeachers: number;
    totalClasses: number;
    totalAssignments: number;
    incompleteClasses: number;
  };
}

export interface IStorage {
  // School Years
  getSchoolYears(): Promise<SchoolYear[]>;
  getSchoolYear(id: string): Promise<SchoolYear | undefined>;
  getCurrentSchoolYear(): Promise<SchoolYear | undefined>;
  createSchoolYear(schoolYear: InsertSchoolYear): Promise<SchoolYear>;
  updateSchoolYear(id: string, schoolYear: Partial<InsertSchoolYear>): Promise<SchoolYear>;
  deleteSchoolYear(id: string): Promise<void>;
  setCurrentSchoolYear(id: string): Promise<SchoolYear>;

  // Teachers
  getTeachers(): Promise<Teacher[]>;
  getTeacher(id: string): Promise<Teacher | undefined>;
  createTeacher(teacher: InsertTeacher): Promise<Teacher>;
  updateTeacher(id: string, teacher: Partial<InsertTeacher>): Promise<Teacher>;
  deleteTeacher(id: string): Promise<void>;

  // Students
  getStudents(): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student>;
  deleteStudent(id: string): Promise<void>;
  getStudentsByClass(classId: string): Promise<Student[]>;
  getStudentsBySchoolYear(schoolYearId: string): Promise<Student[]>;

  // Classes
  getClasses(): Promise<Class[]>;
  getClass(id: string): Promise<Class | undefined>;
  getClassByName(name: string): Promise<Class | undefined>;
  createClass(classData: InsertClass): Promise<Class>;
  updateClass(id: string, classData: Partial<InsertClass>): Promise<Class>;
  deleteClass(id: string): Promise<void>;
  getClassesBySchoolYear(schoolYearId: string): Promise<Class[]>;

  // Subjects
  getSubjects(): Promise<Subject[]>;
  getSubject(id: string): Promise<Subject | undefined>;
  createSubject(subject: InsertSubject): Promise<Subject>;
  updateSubject(id: string, subject: Partial<InsertSubject>): Promise<Subject>;
  deleteSubject(id: string): Promise<void>;
  cleanupOrphanedSubjectReferences(): Promise<void>;

  // Assignments
  getAssignments(): Promise<Assignment[]>;
  getAssignmentsMinimal(semester?: string): Promise<Assignment[]>;
  getAssignmentsWithRelations(semester?: string): Promise<(Assignment & {
    _teacher?: { shortName: string; firstName: string; lastName: string } | null;
    _class?: { name: string; grade: number } | null;
    _subject?: { name: string; shortName: string; category: string } | null;
  })[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  updateAssignment(id: string, assignment: Partial<InsertAssignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
  getAssignmentsByTeacher(teacherId: string): Promise<Assignment[]>;
  getAssignmentsByClass(classId: string): Promise<Assignment[]>;
  getAssignmentsBySchoolYear(schoolYearId: string): Promise<Assignment[]>;

  // Team Teaching Operations
  createTeamTeaching(baseAssignmentId: string, teacherIds: string[]): Promise<Assignment[]>;
  getTeamTeachingGroup(teamTeachingId: string): Promise<Assignment[]>;
  removeFromTeamTeaching(assignmentId: string): Promise<Assignment>;
  validateTeamTeachingGroup(teamTeachingId: string): Promise<{ isValid: boolean; errors: string[] }>;

  // Planstellen
  getPlanstellen(): Promise<Planstelle[]>;
  getPlanstelle(id: string): Promise<Planstelle | undefined>;
  createPlanstelle(planstelle: InsertPlanstelle): Promise<Planstelle>;
  updatePlanstelle(id: string, planstelle: Partial<InsertPlanstelle>): Promise<Planstelle>;
  deletePlanstelle(id: string): Promise<void>;
  calculatePlanstellenFromInput(input: PlanstellenInput): Promise<Planstelle[]>;

  // Analytics
  getTeacherStats(): Promise<{
    totalTeachers: number;
    totalStudents: number;
    totalHours: number;
    averageWorkload: number;
  }>;
  
  // Bulk operations for CSV import
  bulkCreateTeachers(teachers: InsertTeacher[]): Promise<Teacher[]>;
  bulkCreateStudents(students: InsertStudent[]): Promise<Student[]>;
  bulkCreateClasses(classes: InsertClass[]): Promise<Class[]>;
  bulkCreateSubjects(subjects: InsertSubject[]): Promise<Subject[]>;

  // Authentication operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Invitation operations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitations(): Promise<Invitation[]>;

  // School Year Transition operations
  previewSchoolYearTransition(fromSchoolYearId: string, toSchoolYearName: string): Promise<SchoolYearTransitionPreview>;
  executeSchoolYearTransition(fromSchoolYearId: string, toSchoolYearName: string, params: SchoolYearTransitionParams): Promise<SchoolYearTransitionResult>;
  validateSchoolYearTransition(fromSchoolYearId: string): Promise<SchoolYearTransitionValidation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationByEmail(email: string): Promise<Invitation | undefined>;
  markInvitationUsed(id: string, usedBy: string): Promise<void>;
  deleteInvitation(id: string): Promise<void>;

  // Subject Mappings for PDF Import Intelligence
  getSubjectMappings(): Promise<SubjectMapping[]>;
  getSubjectMapping(id: string): Promise<SubjectMapping | undefined>;
  findSubjectMappingByName(normalizedName: string): Promise<SubjectMapping | undefined>;
  createSubjectMapping(mapping: InsertSubjectMapping): Promise<SubjectMapping>;
  updateSubjectMapping(id: string, mapping: Partial<InsertSubjectMapping>): Promise<SubjectMapping>;
  deleteSubjectMapping(id: string): Promise<void>;
  incrementMappingUsage(id: string): Promise<void>;

  // PDF Imports and Tables
  getPdfImports(): Promise<PdfImport[]>;
  getPdfImport(id: string): Promise<PdfImport | undefined>;
  createPdfImport(pdfImport: InsertPdfImport): Promise<PdfImport>;
  deletePdfImport(id: string): Promise<void>;
  
  getPdfTables(): Promise<PdfTable[]>;
  getPdfTable(id: string): Promise<PdfTable | undefined>;
  getPdfTablesByImport(importId: string): Promise<PdfTable[]>;
  createPdfTable(pdfTable: InsertPdfTable): Promise<PdfTable>;
  updatePdfTable(id: string, pdfTable: Partial<InsertPdfTable>): Promise<PdfTable>;
  deletePdfTable(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // School Years
  async getSchoolYears(): Promise<SchoolYear[]> {
    return await db.select().from(schoolYears).orderBy(desc(schoolYears.startDate));
  }

  async getSchoolYear(id: string): Promise<SchoolYear | undefined> {
    const [schoolYear] = await db.select().from(schoolYears).where(eq(schoolYears.id, id));
    return schoolYear || undefined;
  }

  async getCurrentSchoolYear(): Promise<SchoolYear | undefined> {
    const [currentSchoolYear] = await db
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.isCurrent, true));
    return currentSchoolYear || undefined;
  }

  async createSchoolYear(schoolYear: InsertSchoolYear): Promise<SchoolYear> {
    const [newSchoolYear] = await db.insert(schoolYears).values(schoolYear).returning();
    return newSchoolYear;
  }

  async updateSchoolYear(id: string, schoolYear: Partial<InsertSchoolYear>): Promise<SchoolYear> {
    const [updatedSchoolYear] = await db
      .update(schoolYears)
      .set(schoolYear)
      .where(eq(schoolYears.id, id))
      .returning();
    return updatedSchoolYear;
  }

  async deleteSchoolYear(id: string): Promise<void> {
    try {
      // Check if this school year has any dependent data
      const [studentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.schoolYearId, id));
      
      const [classCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(eq(classes.schoolYearId, id));
      
      const [assignmentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assignments)
        .where(eq(assignments.schoolYearId, id));

      // Provide specific error messages if data would be lost
      if (studentCount.count > 0 || classCount.count > 0 || assignmentCount.count > 0) {
        const dependencies = [];
        if (studentCount.count > 0) dependencies.push(`${studentCount.count} Schüler`);
        if (classCount.count > 0) dependencies.push(`${classCount.count} Klassen`);
        if (assignmentCount.count > 0) dependencies.push(`${assignmentCount.count} Zuweisungen`);
        
        throw new Error(
          `Das Schuljahr kann nicht gelöscht werden, da es noch folgende Daten enthält: ${dependencies.join(', ')}. ` +
          `Bitte löschen Sie zuerst alle abhängigen Daten oder verwenden Sie den Schuljahreswechsel.`
        );
      }

      // Safe to delete if no dependencies
      await db.delete(schoolYears).where(eq(schoolYears.id, id));
    } catch (error: any) {
      // Handle database-level foreign key constraint violations
      if (error.code === '23503') {
        throw new Error(
          `Das Schuljahr kann nicht gelöscht werden, da es noch von anderen Daten referenziert wird. ` +
          `Bitte löschen Sie zuerst alle abhängigen Daten.`
        );
      }
      
      // Re-throw our custom errors or unknown errors
      throw error;
    }
  }

  async setCurrentSchoolYear(id: string): Promise<SchoolYear> {
    // Use a transaction to ensure atomicity and handle potential unique constraint violations
    const result = await db.transaction(async (tx) => {
      // First, set all school years to not current
      await tx.update(schoolYears).set({ isCurrent: false });
      
      // Then set the specified school year as current
      const [updatedSchoolYear] = await tx
        .update(schoolYears)
        .set({ isCurrent: true })
        .where(eq(schoolYears.id, id))
        .returning();
      
      if (!updatedSchoolYear) {
        throw new Error(`Schuljahr mit ID ${id} nicht gefunden`);
      }
      
      return updatedSchoolYear;
    });
    
    return result;
  }

  // Teachers
  async getTeachers(): Promise<Teacher[]> {
    return await db.select().from(teachers).orderBy(teachers.lastName);
  }

  async getTeacher(id: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher || undefined;
  }

  async createTeacher(teacher: InsertTeacher): Promise<Teacher> {
    const [newTeacher] = await db.insert(teachers).values({
      ...teacher,
      subjects: teacher.subjects as string[],
      qualifications: teacher.qualifications as string[],
      reductionHours: teacher.reductionHours as any || {}
    }).returning();
    return newTeacher;
  }

  async updateTeacher(id: string, teacher: Partial<InsertTeacher>): Promise<Teacher> {
    const updateData: any = { ...teacher };
    if (teacher.subjects) {
      updateData.subjects = teacher.subjects as string[];
    }
    if (teacher.qualifications) {
      updateData.qualifications = teacher.qualifications as string[];
    }
    if (teacher.reductionHours) {
      updateData.reductionHours = teacher.reductionHours as any;
    }
    
    const [updatedTeacher] = await db
      .update(teachers)
      .set(updateData)
      .where(eq(teachers.id, id))
      .returning();
    return updatedTeacher;
  }

  async deleteTeacher(id: string): Promise<void> {
    try {
      console.log("Storage: Starting teacher deletion for ID:", id);
      
      // First delete all assignments for this teacher
      console.log("Storage: Deleting assignments...");
      const deleteAssignmentsResult = await db.delete(assignments).where(eq(assignments.teacherId, id));
      console.log("Storage: Deleted assignments:", deleteAssignmentsResult);
      
      // Also remove teacher as class teacher from classes
      console.log("Storage: Updating classes (removing as class teacher)...");
      const updateClasses1 = await db.update(classes)
        .set({ classTeacher1Id: null })
        .where(eq(classes.classTeacher1Id, id));
      console.log("Storage: Updated classes (teacher1):", updateClasses1);
      
      const updateClasses2 = await db.update(classes)
        .set({ classTeacher2Id: null })
        .where(eq(classes.classTeacher2Id, id));
      console.log("Storage: Updated classes (teacher2):", updateClasses2);
      
      // Then delete the teacher
      console.log("Storage: Deleting teacher...");
      const deleteTeacherResult = await db.delete(teachers).where(eq(teachers.id, id));
      console.log("Storage: Deleted teacher:", deleteTeacherResult);
      
      console.log("Storage: Teacher deletion completed successfully");
    } catch (error) {
      console.error("Storage: Error during teacher deletion:", error);
      throw error;
    }
  }

  // Students
  async getStudents(): Promise<Student[]> {
    return await db.select().from(students).orderBy(students.lastName);
  }

  async getStudent(id: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student || undefined;
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    // Ensure schoolYearId is set by auto-assigning current school year if missing
    let finalStudentData = { ...student };
    
    if (!finalStudentData.schoolYearId) {
      const currentSchoolYear = await this.getCurrentSchoolYear();
      if (!currentSchoolYear) {
        throw new Error(
          "Keine aktuelle Schuljahr gefunden. Bitte setzen Sie zuerst ein aktuelles Schuljahr."
        );
      }
      finalStudentData.schoolYearId = currentSchoolYear.id;
    }
    
    const [newStudent] = await db.insert(students).values(finalStudentData).returning();
    return newStudent;
  }

  async updateStudent(id: string, student: Partial<InsertStudent>): Promise<Student> {
    const [updatedStudent] = await db
      .update(students)
      .set(student)
      .where(eq(students.id, id))
      .returning();
    return updatedStudent;
  }

  async deleteStudent(id: string): Promise<void> {
    await db.delete(students).where(eq(students.id, id));
  }

  async getStudentsByClass(classId: string): Promise<Student[]> {
    return await db.select().from(students).where(eq(students.classId, classId));
  }

  async getStudentsBySchoolYear(schoolYearId: string): Promise<Student[]> {
    return await db.select().from(students).where(eq(students.schoolYearId, schoolYearId));
  }

  // Classes
  async getClasses(): Promise<Class[]> {
    return await db.select().from(classes).orderBy(classes.name);
  }

  async getClass(id: string): Promise<Class | undefined> {
    const [classData] = await db.select().from(classes).where(eq(classes.id, id));
    return classData || undefined;
  }

  async createClass(classData: InsertClass): Promise<Class> {
    // Ensure schoolYearId is set by auto-assigning current school year if missing
    let finalClassData = { ...classData };
    
    if (!finalClassData.schoolYearId) {
      const currentSchoolYear = await this.getCurrentSchoolYear();
      if (!currentSchoolYear) {
        throw new Error(
          "Keine aktuelle Schuljahr gefunden. Bitte setzen Sie zuerst ein aktuelles Schuljahr."
        );
      }
      finalClassData.schoolYearId = currentSchoolYear.id;
    }
    
    const [newClass] = await db.insert(classes).values(finalClassData).returning();
    return newClass;
  }

  async updateClass(id: string, classData: Partial<InsertClass>): Promise<Class> {
    const [updatedClass] = await db
      .update(classes)
      .set(classData)
      .where(eq(classes.id, id))
      .returning();
    return updatedClass;
  }

  async deleteClass(id: string): Promise<void> {
    await db.delete(classes).where(eq(classes.id, id));
  }

  async getClassByName(name: string): Promise<Class | undefined> {
    const [classRecord] = await db.select().from(classes).where(eq(classes.name, name));
    return classRecord || undefined;
  }

  async getClassesBySchoolYear(schoolYearId: string): Promise<Class[]> {
    return await db.select().from(classes).where(eq(classes.schoolYearId, schoolYearId));
  }

  // Subjects
  async getSubjects(): Promise<Subject[]> {
    return await db.select().from(subjects).orderBy(subjects.name);
  }

  async getSubject(id: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, id));
    return subject || undefined;
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const [newSubject] = await db.insert(subjects).values(subject).returning();
    return newSubject;
  }

  async updateSubject(id: string, subject: Partial<InsertSubject>): Promise<Subject> {
    const [updatedSubject] = await db
      .update(subjects)
      .set(subject)
      .where(eq(subjects.id, id))
      .returning();
    return updatedSubject;
  }

  async deleteSubject(id: string): Promise<void> {
    // First, get the subject details to know which identifier to remove from teachers/classes
    const subjectToDelete = await this.getSubject(id);
    if (!subjectToDelete) {
      throw new Error("Subject not found");
    }

    // Clean up teachers: remove this subject from their subjects arrays
    const allTeachers = await db.select().from(teachers);
    for (const teacher of allTeachers) {
      const updatedSubjects = teacher.subjects.filter(
        (subjectRef: string) => 
          subjectRef !== id && 
          subjectRef !== subjectToDelete.shortName && 
          subjectRef !== subjectToDelete.name
      );
      
      // Only update if the subjects array changed
      if (updatedSubjects.length !== teacher.subjects.length) {
        await db
          .update(teachers)
          .set({ subjects: updatedSubjects })
          .where(eq(teachers.id, teacher.id));
      }
    }

    // Clean up classes: remove this subject from their subjectHours objects
    const allClasses = await db.select().from(classes);
    for (const classRecord of allClasses) {
      const subjectHours = { ...classRecord.subjectHours };
      let hasChanges = false;

      // Remove subject by various possible identifiers
      if (subjectHours[id]) {
        delete subjectHours[id];
        hasChanges = true;
      }
      if (subjectHours[subjectToDelete.shortName]) {
        delete subjectHours[subjectToDelete.shortName];
        hasChanges = true;
      }
      if (subjectHours[subjectToDelete.name]) {
        delete subjectHours[subjectToDelete.name];
        hasChanges = true;
      }

      // Only update if the subjectHours object changed
      if (hasChanges) {
        await db
          .update(classes)
          .set({ subjectHours })
          .where(eq(classes.id, classRecord.id));
      }
    }

    // Finally, delete the subject itself (assignments will be cascade deleted automatically)
    await db.delete(subjects).where(eq(subjects.id, id));
  }

  async cleanupOrphanedSubjectReferences(): Promise<void> {
    // Get all existing subject short names and names
    const allSubjects = await this.getSubjects();
    const validSubjectRefs = new Set([
      ...allSubjects.map(s => s.id),
      ...allSubjects.map(s => s.shortName),
      ...allSubjects.map(s => s.name)
    ]);

    // Clean up teachers
    const allTeachers = await db.select().from(teachers);
    for (const teacher of allTeachers) {
      const cleanedSubjects = teacher.subjects.filter(
        (subjectRef: string) => validSubjectRefs.has(subjectRef)
      );
      
      if (cleanedSubjects.length !== teacher.subjects.length) {
        await db
          .update(teachers)
          .set({ subjects: cleanedSubjects })
          .where(eq(teachers.id, teacher.id));
      }
    }

    // Clean up classes
    const allClasses = await db.select().from(classes);
    for (const classRecord of allClasses) {
      const subjectHours = { ...classRecord.subjectHours };
      let hasChanges = false;

      // Remove any keys that don't match valid subject references
      for (const key in subjectHours) {
        if (!validSubjectRefs.has(key)) {
          delete subjectHours[key];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await db
          .update(classes)
          .set({ subjectHours })
          .where(eq(classes.id, classRecord.id));
      }
    }
  }

  // Assignments - Optimized with JOIN to avoid N+1 problem
  async getAssignments(): Promise<Assignment[]> {
    return await db
      .select()
      .from(assignments)
      .orderBy(desc(assignments.createdAt));
  }

  // Minimal assignment data for performance-critical operations (e.g., assignment matrix)
  async getAssignmentsMinimal(semester?: string): Promise<Assignment[]> {
    let query = db.select().from(assignments);

    if (semester) {
      query = query.where(eq(assignments.semester, semester));
    }

    return await query.orderBy(desc(assignments.createdAt));
  }

  // Optimized method with pre-loaded related data for frontend performance
  async getAssignmentsWithRelations(semester?: string): Promise<(Assignment & {
    _teacher?: { shortName: string; firstName: string; lastName: string } | null;
    _class?: { name: string; grade: number | null } | null;
    _subject?: { name: string; shortName: string; category: string } | null;
  })[]> {
    // Build base query with joins
    const baseQuery = db
      .select({
        // Assignment fields
        id: assignments.id,
        teacherId: assignments.teacherId,
        classId: assignments.classId,
        subjectId: assignments.subjectId,
        hoursPerWeek: assignments.hoursPerWeek,
        semester: assignments.semester,
        isOptimized: assignments.isOptimized,
        teamTeachingId: assignments.teamTeachingId,
        schoolYearId: assignments.schoolYearId,
        createdAt: assignments.createdAt,
        // Related data to avoid N+1 queries
        teacherShortName: teachers.shortName,
        teacherFirstName: teachers.firstName,
        teacherLastName: teachers.lastName,
        className: classes.name,
        classGrade: classes.grade,
        subjectName: subjects.name,
        subjectShortName: subjects.shortName,
        subjectCategory: subjects.category,
      })
      .from(assignments)
      .leftJoin(teachers, eq(assignments.teacherId, teachers.id))
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .leftJoin(subjects, eq(assignments.subjectId, subjects.id));

    // Apply semester filter and execute query
    const result = semester 
      ? await baseQuery.where(eq(assignments.semester, semester)).orderBy(desc(assignments.createdAt))
      : await baseQuery.orderBy(desc(assignments.createdAt));

    // Transform result to match expected interface
    return result.map(row => ({
      id: row.id,
      teacherId: row.teacherId,
      classId: row.classId,
      subjectId: row.subjectId,
      hoursPerWeek: row.hoursPerWeek,
      semester: row.semester,
      isOptimized: row.isOptimized,
      teamTeachingId: row.teamTeachingId,
      schoolYearId: row.schoolYearId,
      createdAt: row.createdAt,
      _teacher: row.teacherShortName ? {
        shortName: row.teacherShortName,
        firstName: row.teacherFirstName || '',
        lastName: row.teacherLastName || '',
      } : null,
      _class: row.className ? {
        name: row.className,
        grade: row.classGrade,
      } : null,
      _subject: row.subjectName ? {
        name: row.subjectName,
        shortName: row.subjectShortName || '',
        category: row.subjectCategory || '',
      } : null,
    }));
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id));
    return assignment || undefined;
  }

  async createAssignment(assignment: InsertAssignment): Promise<Assignment> {
    // Ensure schoolYearId is set by auto-assigning current school year if missing
    let finalAssignmentData = { ...assignment };
    
    if (!finalAssignmentData.schoolYearId) {
      const currentSchoolYear = await this.getCurrentSchoolYear();
      if (!currentSchoolYear) {
        throw new Error(
          "Keine aktuelle Schuljahr gefunden. Bitte setzen Sie zuerst ein aktuelles Schuljahr."
        );
      }
      finalAssignmentData.schoolYearId = currentSchoolYear.id;
    }
    
    const [newAssignment] = await db.insert(assignments).values(finalAssignmentData).returning();
    return newAssignment;
  }

  async updateAssignment(id: string, assignment: Partial<InsertAssignment>): Promise<Assignment> {
    const [updatedAssignment] = await db
      .update(assignments)
      .set(assignment)
      .where(eq(assignments.id, id))
      .returning();
    return updatedAssignment;
  }

  async deleteAssignment(id: string): Promise<void> {
    await db.delete(assignments).where(eq(assignments.id, id));
  }

  async getAssignmentsByTeacher(teacherId: string): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.teacherId, teacherId));
  }

  async getAssignmentsByClass(classId: string): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.classId, classId));
  }

  async getAssignmentsBySchoolYear(schoolYearId: string): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.schoolYearId, schoolYearId));
  }

  // Team Teaching Operations - Optimized with bulk operations
  async createTeamTeaching(baseAssignmentId: string, teacherIds: string[]): Promise<Assignment[]> {
    // Single transaction for all operations
    return await db.transaction(async (tx) => {
      // Get the base assignment
      const [baseAssignment] = await tx.select().from(assignments).where(eq(assignments.id, baseAssignmentId));
      if (!baseAssignment) {
        throw new Error("Base assignment not found");
      }

      // Generate a new team teaching ID if none exists
      const teamTeachingId = baseAssignment.teamTeachingId || randomUUID();
      
      // Update the base assignment with team teaching ID if it doesn't have one
      if (!baseAssignment.teamTeachingId) {
        await tx.update(assignments)
          .set({ teamTeachingId })
          .where(eq(assignments.id, baseAssignmentId));
      }

      // Get all existing assignments for this team in one query
      const existingAssignments = await tx.select()
        .from(assignments)
        .where(eq(assignments.teamTeachingId, teamTeachingId));
      
      const existingTeacherIds = new Set(existingAssignments.map(a => a.teacherId));
      
      // Filter out teachers already in the team
      const newTeacherIds = teacherIds.filter(teacherId => !existingTeacherIds.has(teacherId));
      
      if (newTeacherIds.length > 0) {
        // Bulk insert all new assignments in one query
        const newAssignments: InsertAssignment[] = newTeacherIds.map(teacherId => ({
          teacherId,
          classId: baseAssignment.classId,
          subjectId: baseAssignment.subjectId,
          hoursPerWeek: baseAssignment.hoursPerWeek,
          semester: baseAssignment.semester as "1" | "2",
          isOptimized: false,
          teamTeachingId,
          schoolYearId: baseAssignment.schoolYearId
        }));

        await tx.insert(assignments).values(newAssignments);
      }

      // Return all assignments in the team teaching group
      return await tx.select()
        .from(assignments)
        .where(eq(assignments.teamTeachingId, teamTeachingId))
        .orderBy(assignments.createdAt);
    });
  }

  async getTeamTeachingGroup(teamTeachingId: string): Promise<Assignment[]> {
    return await db.select().from(assignments)
      .where(eq(assignments.teamTeachingId, teamTeachingId))
      .orderBy(assignments.createdAt);
  }

  async removeFromTeamTeaching(assignmentId: string): Promise<Assignment> {
    const assignment = await this.getAssignment(assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    if (!assignment.teamTeachingId) {
      throw new Error("Assignment is not part of a team teaching group");
    }

    // Get all assignments in the team
    const teamAssignments = await this.getTeamTeachingGroup(assignment.teamTeachingId);
    
    if (teamAssignments.length <= 2) {
      // If only 2 assignments left, remove team teaching from both
      for (const teamAssignment of teamAssignments) {
        await this.updateAssignment(teamAssignment.id, { teamTeachingId: null });
      }
    } else {
      // Just remove this assignment from the team
      await this.updateAssignment(assignmentId, { teamTeachingId: null });
    }

    return await this.getAssignment(assignmentId) as Assignment;
  }

  async validateTeamTeachingGroup(teamTeachingId: string): Promise<{ isValid: boolean; errors: string[] }> {
    const assignments = await this.getTeamTeachingGroup(teamTeachingId);
    const errors: string[] = [];

    if (assignments.length < 2) {
      errors.push("Team teaching group must have at least 2 teachers");
    }

    if (assignments.length > 0) {
      const firstAssignment = assignments[0];
      
      // Check that all assignments have the same class, subject, semester, and hours
      for (const assignment of assignments.slice(1)) {
        if (assignment.classId !== firstAssignment.classId) {
          errors.push("All assignments in team teaching group must be for the same class");
        }
        if (assignment.subjectId !== firstAssignment.subjectId) {
          errors.push("All assignments in team teaching group must be for the same subject");
        }
        if (assignment.semester !== firstAssignment.semester) {
          errors.push("All assignments in team teaching group must be for the same semester");
        }
        if (assignment.hoursPerWeek !== firstAssignment.hoursPerWeek) {
          errors.push("All assignments in team teaching group must have the same hours per week");
        }
      }

      // Check for duplicate teachers
      const teacherIds = assignments.map(a => a.teacherId);
      const uniqueTeacherIds = new Set(teacherIds);
      if (teacherIds.length !== uniqueTeacherIds.size) {
        errors.push("Team teaching group cannot have duplicate teachers");
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Planstellen
  async getPlanstellen(): Promise<Planstelle[]> {
    return await db.select().from(planstellen).orderBy(desc(planstellen.calculatedAt));
  }

  async getPlanstelle(id: string): Promise<Planstelle | undefined> {
    const [planstelle] = await db.select().from(planstellen).where(eq(planstellen.id, id));
    return planstelle || undefined;
  }

  async createPlanstelle(planstelle: typeof planstellen.$inferInsert): Promise<Planstelle> {
    const [newPlanstelle] = await db.insert(planstellen).values(planstelle).returning();
    return newPlanstelle;
  }

  async updatePlanstelle(id: string, planstelle: Partial<typeof planstellen.$inferInsert>): Promise<Planstelle> {
    const [updatedPlanstelle] = await db
      .update(planstellen)
      .set(planstelle)
      .where(eq(planstellen.id, id))
      .returning();
    return updatedPlanstelle;
  }

  async deletePlanstelle(id: string): Promise<void> {
    await db.delete(planstellen).where(eq(planstellen.id, id));
  }

  async calculatePlanstellenFromInput(input: PlanstellenInput): Promise<Planstelle[]> {
    const results: Planstelle[] = [];
    
    // Berechnete Felder basierend auf echten Excel-Formeln
    const berechneteWerte = {
      // F5: =F3/F4 - Quotient (35.16592372)
      quotient: input.schuelerzahlStand / input.schuelerLehrerrelation,
      
      // F6: =TRUNC(F5,2) - Quotient abgeschnitten (35.16)
      quotientAbgeschnitten: Math.trunc((input.schuelerzahlStand / input.schuelerLehrerrelation) * 100) / 100,
      
      // F7: =IF(F5-INT(F5)<0.5,INT(F5),INT(F5)+0.5) - Abgerundet (35)
      abgerundet: (() => {
        const quotient = input.schuelerzahlStand / input.schuelerLehrerrelation;
        const intPart = Math.floor(quotient);
        return (quotient - intPart < 0.5) ? intPart : intPart + 0.5;
      })(),
      
      // F10: =SUM(F6,F8:F9) - Summe Grundbedarf
      summeGrundbedarf: (() => {
        const quotientAbgeschnitten = Math.trunc((input.schuelerzahlStand / input.schuelerLehrerrelation) * 100) / 100;
        return quotientAbgeschnitten + input.abzugLehramtsanwaerter + input.rundung;
      })(),
      
      // F27: =SUM(F12:F25) - Summe Ausgleichsbedarf
      summeAusgleichsbedarf: input.fachleiter + 
                            input.personalrat + 
                            input.schulleitungsentlastungFortbildung + 
                            input.ausbauLeitungszeit + 
                            input.rueckgabeVorgriffstunde + 
                            input.digitalisierungsbeauftragter + 
                            input.fortbildungQualifMedienDS + 
                            input.fachberaterSchulaufsicht + 
                            input.wechselndeAusgleichsbedarfe + 
                            input.praxissemesterInSchule + 
                            input.zusaetzlicheAusfallvertretung + 
                            input.entlastungLehrertaetigkeit + 
                            input.entlastungLVOCO + 
                            input.ermaessigungenweitere,
                         
      // =SUMME weitere Bereiche - Weitere Planstellen
      weitereBereiche: input.bestellungsverfahren + 
                      input.praktischePaedagogikLehrkraefte + 
                      input.praxissemesterdurchfuehrung + 
                      input.entlassungenGradVerkuerzung + 
                      input.stellenreserveLehrerinnen,
                      
      // Gesamtsumme aller Planstellen
      gesamtPlanstellen: 0 // wird unten berechnet
    };

    // Erstelle Planstellen für alle Eingabefelder - 1:1 Excel-Struktur
    const eingabeFelder = [
      // 1. GRUNDSTELLEN (F3-F10, echte Excel-Bezeichnungen)
      { name: 'Schülerzahl Stand 31.08.24', value: input.schuelerzahlStand, category: 'grundstellen' },
      { name: 'Schüler/Lehrerrelation an der Realschule: (ab 06/18)', value: input.schuelerLehrerrelation, category: 'grundstellen' },
      { name: 'bedarfsdeckender Unterricht - Abzug Lehramtsanwärter', value: input.abzugLehramtsanwaerter, category: 'grundstellen' },
      { name: 'Rundung', value: input.rundung, category: 'grundstellen' },
      
      // AUSGLEICHSBEDARF (F12-F26, echte Excel-Bezeichnungen)
      { name: 'Fachleiter', value: input.fachleiter, category: 'ausgleichsbedarf' },
      { name: 'Personalrat', value: input.personalrat, category: 'ausgleichsbedarf' },
      { name: 'Schulleitungsentlastung - Fortbildung', value: input.schulleitungsentlastungFortbildung, category: 'ausgleichsbedarf' },
      { name: 'Ausbau Leitungszeit', value: input.ausbauLeitungszeit, category: 'ausgleichsbedarf' },
      { name: 'Rückgabe Vorgriffstunde', value: input.rueckgabeVorgriffstunde, category: 'ausgleichsbedarf' },
      { name: 'Digitalisierungsbeauftragter', value: input.digitalisierungsbeauftragter, category: 'ausgleichsbedarf' },
      { name: 'Fortb. und Qualif. / Medien und DS', value: input.fortbildungQualifMedienDS, category: 'ausgleichsbedarf' },
      { name: 'Fachberater Schulaufsicht', value: input.fachberaterSchulaufsicht, category: 'ausgleichsbedarf' },
      { name: 'Wechs. Merh - und Ausgleichsbedarfe', value: input.wechselndeAusgleichsbedarfe, category: 'ausgleichsbedarf' },
      { name: 'Praxissemester in Schule', value: input.praxissemesterInSchule, category: 'ausgleichsbedarf' },
      { name: 'Zusätzliche Ausfallvertretung', value: input.zusaetzlicheAusfallvertretung, category: 'ausgleichsbedarf' },
      { name: 'Entlastung Lehrertätigkeit', value: input.entlastungLehrertaetigkeit, category: 'ausgleichsbedarf' },
      { name: 'Entlastung LVO&CO', value: input.entlastungLVOCO, category: 'ausgleichsbedarf' },
      { name: 'Ermäßigungen weitere', value: input.ermaessigungenweitere, category: 'ausgleichsbedarf' },
      { name: '0', value: input.nullWert, category: 'ausgleichsbedarf' },
      
      // WEITERE BEREICHE (F30-F32, aus Excel-Struktur)
      { name: 'Bestellungsverfahren', value: input.bestellungsverfahren, category: 'weitere_bereiche' },
      { name: 'Praktische Pädagogik Lehrkräfte', value: input.praktischePaedagogikLehrkraefte, category: 'weitere_bereiche' },
      { name: 'Praxissemesterdurchführung', value: input.praxissemesterdurchfuehrung, category: 'weitere_bereiche' },
      
      // WEITERE ABSCHNITTE (F36, F38, etc.)
      { name: 'Entlassungen/Grad. (Verkürzung)', value: input.entlassungenGradVerkuerzung, category: 'weitere_abschnitte' },
      { name: 'Stellenreserve LehrerInnen', value: input.stellenreserveLehrerinnen, category: 'weitere_abschnitte' },
      
      // SONSTIGE FELDER
      { name: 'Ausfeld Lehrkräfte', value: input.ausfeldLehrkraefte, category: 'sonstige' },
      { name: 'Inner-(d. Sonderreg/austech)', value: input.innerSonderregAustech, category: 'sonstige' },
      { name: 'Ergänzend über Aufbaumöglichkeit', value: input.ergaenzendUeberAufbaumoeglichkeit, category: 'sonstige' },
      { name: 'Stellenreserve LehrerInnen(HS)', value: input.stellenreserveLehrerinnenHS, category: 'sonstige' },
      { name: 'Fertigkeitsfeld', value: input.fertigkeitsfeld, category: 'sonstige' },
      { name: 'Stundenreserve', value: input.stundenreserve, category: 'sonstige' }
    ];

    // Erstelle Planstelle für jedes Eingabefeld (nur wenn Wert > 0)
    for (const feld of eingabeFelder) {
      if (feld.value > 0) {
        const planstelle: Planstelle = {
          id: randomUUID(),
          scenarioId: null,
          subjectId: null,
          grade: null,
          category: feld.category,
          component: feld.name,
          lineType: 'requirement',
          formula: {
            op: 'direct',
            terms: [feld.value],
            description: `${feld.name}: Direkteingabe`
          },
          color: feld.category === 'grundschuldaten' ? 'yellow' : 
                feld.category === 'abzugsarten' ? 'yellow' :
                feld.category === 'lehramt' ? 'purple' : 'gray',
          requiredHours: feld.value.toString(),
          availableHours: '0',
          deficit: feld.value.toString(),
          calculatedAt: new Date()
        };
        results.push(planstelle);
      }
    }

    // Berechne Gesamtsumme 
    berechneteWerte.gesamtPlanstellen = berechneteWerte.summeGrundbedarf + 
                                       berechneteWerte.summeAusgleichsbedarf + 
                                       berechneteWerte.weitereBereiche;

    // Erstelle berechnete Planstellen (blaue/türkise Felder)
    const berechneteFelder = [
      {
        name: 'Summe Grundbedarf',
        value: berechneteWerte.summeGrundbedarf,
        formula: '=SUM(F6,F8:F9)',
        color: 'cyan'
      },
      {
        name: 'Summe Ausgleichsbedarf',
        value: berechneteWerte.summeAusgleichsbedarf,
        formula: '=SUM(F12:F25)',
        color: 'cyan'
      },
      {
        name: 'Weitere Bereiche',
        value: berechneteWerte.weitereBereiche,
        formula: '=SUM(F30:F38)',
        color: 'cyan'
      },
      {
        name: 'Gesamtsumme Planstellen',
        value: berechneteWerte.gesamtPlanstellen,
        formula: '=SUM(F10,F27,weitere)',
        color: 'green'
      }
    ];

    for (const feld of berechneteFelder) {
      const planstelle: Planstelle = {
        id: randomUUID(),
        scenarioId: null,
        subjectId: null,
        grade: null,
        category: 'berechnet',
        component: feld.name,
        lineType: 'calculated',
        formula: {
          op: 'sum',
          terms: [],
          description: feld.formula
        },
        color: feld.color,
        requiredHours: feld.value.toString(),
        availableHours: '0',
        deficit: feld.value.toString(),
        calculatedAt: new Date()
      };
      results.push(planstelle);
    }

    // Gesamtberechnung hinzufügen (Excel-basiert)
    const gesamtStunden = berechneteWerte.gesamtPlanstellen;
    const benoetigtePlanstellen = input.deputat > 0 ? gesamtStunden / input.deputat : 0;
    
    const gesamtPlanstelle: Planstelle = {
      id: randomUUID(),
      scenarioId: null,
      subjectId: null,
      grade: null,
      category: 'summe',
      component: 'Gesamtbedarf Planstellen',
      lineType: 'summary',
      formula: {
        op: 'divide',
        terms: [gesamtStunden, input.deputat],
        description: `Gesamtstunden (${gesamtStunden}) ÷ Deputat (${input.deputat})`
      },
      color: 'blue',
      requiredHours: gesamtStunden.toString(),
      availableHours: benoetigtePlanstellen.toFixed(2),
      deficit: '0',
      calculatedAt: new Date()
    };
    
    results.push(gesamtPlanstelle);
    
    return results;
  }

  // Analytics
  async getTeacherStats(): Promise<{
    totalTeachers: number;
    totalStudents: number;
    totalHours: number;
    averageWorkload: number;
  }> {
    const [teacherCount] = await db.select({ count: sql<number>`count(*)` }).from(teachers);
    const [studentCount] = await db.select({ count: sql<number>`count(*)` }).from(students);
    const [hourStats] = await db.select({ 
      totalHours: sql<number>`sum(${teachers.currentHours})`,
      avgWorkload: sql<number>`avg(${teachers.currentHours}::float / ${teachers.maxHours}::float * 100)`
    }).from(teachers);

    return {
      totalTeachers: teacherCount.count,
      totalStudents: studentCount.count,
      totalHours: hourStats.totalHours || 0,
      averageWorkload: hourStats.avgWorkload || 0,
    };
  }

  // Bulk operations for CSV import
  async bulkCreateTeachers(teacherList: InsertTeacher[]): Promise<Teacher[]> {
    const teacherData = teacherList.map(teacher => ({
      ...teacher,
      subjects: teacher.subjects as string[],
      qualifications: teacher.qualifications as string[],
      reductionHours: teacher.reductionHours as any || {}
    }));
    return await db.insert(teachers).values(teacherData).returning();
  }

  async bulkCreateStudents(studentList: InsertStudent[]): Promise<Student[]> {
    return await db.insert(students).values(studentList).returning();
  }

  async bulkCreateClasses(classList: InsertClass[]): Promise<Class[]> {
    return await db.insert(classes).values(classList).returning();
  }

  async bulkCreateSubjects(subjectList: InsertSubject[]): Promise<Subject[]> {
    return await db.insert(subjects).values(subjectList).returning();
  }

  async bulkCreateSubjectsWithConflictHandling(subjectList: InsertSubject[]): Promise<Subject[]> {
    const results: Subject[] = [];
    
    for (const subjectData of subjectList) {
      try {
        // Try to create the subject
        const [subject] = await db
          .insert(subjects)
          .values(subjectData)
          .returning();
        results.push(subject);
      } catch (error: any) {
        // If it's a duplicate key error, get the existing subject
        if (error.code === '23505') {
          const [existingSubject] = await db
            .select()
            .from(subjects)
            .where(eq(subjects.shortName, subjectData.shortName));
          if (existingSubject) {
            results.push(existingSubject);
          }
        } else {
          throw error;
        }
      }
    }
    
    return results;
  }

  // Authentication operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Invitation operations
  async createInvitation(invitationData: InsertInvitation): Promise<Invitation> {
    // Generate a secure token for the invitation
    const token = randomUUID();
    
    const invitation = {
      ...invitationData,
      token,
    };
    
    const [newInvitation] = await db.insert(invitations).values(invitation).returning();
    return newInvitation;
  }

  async getInvitations(): Promise<Invitation[]> {
    return await db.select().from(invitations).orderBy(desc(invitations.createdAt));
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
    return invitation || undefined;
  }

  async getInvitationByEmail(email: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.email, email));
    return invitation || undefined;
  }

  async markInvitationUsed(id: string, usedBy: string): Promise<void> {
    await db
      .update(invitations)
      .set({
        used: true,
        usedBy,
        usedAt: new Date(),
      })
      .where(eq(invitations.id, id));
  }

  async deleteInvitation(id: string): Promise<void> {
    await db.delete(invitations).where(eq(invitations.id, id));
  }

  // School Year Transition operations
  async validateSchoolYearTransition(fromSchoolYearId: string): Promise<SchoolYearTransitionValidation> {
    try {
      // Get current school year data
      const currentSchoolYear = await this.getSchoolYear(fromSchoolYearId);
      if (!currentSchoolYear) {
        return {
          valid: false,
          errors: ["Aktuelles Schuljahr nicht gefunden"],
          warnings: [],
          statistics: { totalTeachers: 0, totalClasses: 0, totalAssignments: 0, incompleteClasses: 0 }
        };
      }

      // Get all data for current school year
      const [allTeachers, currentClasses, currentAssignments] = await Promise.all([
        this.getTeachers(),
        this.getClassesBySchoolYear(fromSchoolYearId),
        this.getAssignmentsBySchoolYear(fromSchoolYearId)
      ]);

      const warnings: string[] = [];
      const errors: string[] = [];

      // Check for incomplete classes
      const incompleteClasses = currentClasses.filter(c => 
        !c.classTeacher1Id || c.studentCount === 0
      );

      if (incompleteClasses.length > 0) {
        warnings.push(`${incompleteClasses.length} Klassen ohne Klassenlehrer oder ohne Schüler`);
      }

      // Check for missing assignments
      const classesWithoutAssignments = currentClasses.filter(c => 
        !currentAssignments.some(a => a.classId === c.id)
      );

      if (classesWithoutAssignments.length > 0) {
        warnings.push(`${classesWithoutAssignments.length} Klassen ohne Zuweisungen`);
      }

      // Check for teachers with overload
      const overloadedTeachers = allTeachers.filter(t => 
        parseFloat(t.currentHours) > parseFloat(t.maxHours)
      );

      if (overloadedTeachers.length > 0) {
        warnings.push(`${overloadedTeachers.length} Lehrer mit Überbelastung`);
      }

      return {
        valid: errors.length === 0,
        warnings,
        errors,
        statistics: {
          totalTeachers: allTeachers.length,
          totalClasses: currentClasses.length,
          totalAssignments: currentAssignments.length,
          incompleteClasses: incompleteClasses.length,
        }
      };
    } catch (error) {
      console.error("Error validating school year transition:", error);
      return {
        valid: false,
        errors: ["Fehler bei der Validierung aufgetreten"],
        warnings: [],
        statistics: { totalTeachers: 0, totalClasses: 0, totalAssignments: 0, incompleteClasses: 0 }
      };
    }
  }

  async previewSchoolYearTransition(fromSchoolYearId: string, toSchoolYearName: string): Promise<SchoolYearTransitionPreview> {
    try {
      // Get current data
      const [currentClasses, currentAssignments, allSubjects] = await Promise.all([
        this.getClassesBySchoolYear(fromSchoolYearId),
        this.getAssignmentsBySchoolYear(fromSchoolYearId),
        this.getSubjects()
      ]);

      const classTransitions: ClassTransition[] = [];
      const assignmentMigrations: AssignmentMigration[] = [];
      const newClasses = [
        { name: "5a", grade: 5, expectedStudentCount: 28 },
        { name: "5b", grade: 5, expectedStudentCount: 26 }
      ];

      // Process class transitions
      let graduatedClasses = 0;
      let continuingClasses = 0;

      for (const currentClass of currentClasses) {
        if (currentClass.grade === 10) {
          // Graduating class
          classTransitions.push({
            from: currentClass,
            to: null,
            action: "graduate",
            studentCount: currentClass.studentCount
          });
          graduatedClasses++;
        } else {
          // Continuing class - advance grade
          const newGrade = currentClass.grade + 1;
          const newName = currentClass.name.replace(currentClass.grade.toString(), newGrade.toString());
          
          classTransitions.push({
            from: currentClass,
            to: null, // Will be created during transition
            action: "migrate",
            studentCount: currentClass.studentCount,
            newGrade,
            newName
          });
          continuingClasses++;
        }
      }

      // Process assignment migrations based on subject curriculum rules
      const autoMigratableSubjects = ["Deutsch", "Mathematik", "Englisch", "Sport", "KR", "ER", "PP"];
      let autoMigrations = 0;
      let manualChecks = 0;
      let nonMigratable = 0;

      for (const assignment of currentAssignments) {
        const subject = allSubjects.find(s => s.id === assignment.subjectId);
        const currentClass = currentClasses.find(c => c.id === assignment.classId);
        
        if (!subject || !currentClass) continue;

        // Skip assignments for graduating classes
        if (currentClass.grade === 10) {
          assignmentMigrations.push({
            assignment,
            status: "not_migratable",
            reason: "Klasse graduiert"
          });
          nonMigratable++;
          continue;
        }

        const targetGrade = currentClass.grade + 1;
        const targetHours = subject.hoursPerWeek[targetGrade.toString()] || 0;

        if (autoMigratableSubjects.includes(subject.name)) {
          // Auto-migratable subjects
          if (targetHours > 0) {
            assignmentMigrations.push({
              assignment,
              status: "auto_migrate",
              targetGrade,
              targetHours,
              newAssignment: {
                teacherId: assignment.teacherId,
                subjectId: assignment.subjectId,
                hoursPerWeek: targetHours.toString(),
                semester: assignment.semester as "1" | "2"
              }
            });
            autoMigrations++;
          } else {
            assignmentMigrations.push({
              assignment,
              status: "not_migratable",
              reason: `${subject.name} endet nach Klasse ${currentClass.grade}`
            });
            nonMigratable++;
          }
        } else {
          // Subjects requiring manual review (Biologie, Physik, etc.)
          assignmentMigrations.push({
            assignment,
            status: "manual_check",
            reason: `${subject.name} hat komplexe Übergangsregeln`,
            targetGrade,
            targetHours
          });
          manualChecks++;
        }
      }

      return {
        classTransitions,
        assignmentMigrations,
        newClasses,
        statistics: {
          totalAssignments: currentAssignments.length,
          autoMigrations,
          manualChecks,
          nonMigratable,
          graduatedClasses,
          continuingClasses
        }
      };
    } catch (error) {
      console.error("Error creating school year transition preview:", error);
      throw new Error("Fehler bei der Erstellung der Übergangs-Vorschau");
    }
  }

  async executeSchoolYearTransition(fromSchoolYearId: string, toSchoolYearName: string, params: SchoolYearTransitionParams): Promise<SchoolYearTransitionResult> {
    // Use database transaction for atomic execution
    return await db.transaction(async (tx) => {
      try {
        const errors: string[] = [];
        let migratedClasses = 0;
        let migratedAssignments = 0;
        let migratedStudents = 0;
        let createdNewClasses = 0;
        let graduatedClasses = 0;

        // 1. Idempotency check - prevent duplicate transitions
        const existingToSchoolYear = await tx
          .select()
          .from(schoolYears)
          .where(eq(schoolYears.name, toSchoolYearName))
          .limit(1);
        
        if (existingToSchoolYear.length > 0) {
          throw new Error(`Schuljahr "${toSchoolYearName}" existiert bereits. Übergang wurde möglicherweise bereits ausgeführt.`);
        }

        // 2. Verify source school year exists and is valid
        const [fromSchoolYear] = await tx
          .select()
          .from(schoolYears)
          .where(eq(schoolYears.id, fromSchoolYearId));
        
        if (!fromSchoolYear) {
          throw new Error(`Quell-Schuljahr mit ID ${fromSchoolYearId} nicht gefunden`);
        }

        // 3. Create new school year
        const [newSchoolYear] = await tx.insert(schoolYears).values({
          name: toSchoolYearName,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          isCurrent: false
        }).returning();

        // 4. Get current data
        const [currentClasses, currentAssignments, currentStudents, allSubjects] = await Promise.all([
          tx.select().from(classes).where(eq(classes.schoolYearId, fromSchoolYearId)),
          tx.select().from(assignments).where(eq(assignments.schoolYearId, fromSchoolYearId)),
          tx.select().from(students).where(eq(students.schoolYearId, fromSchoolYearId)),
          tx.select().from(subjects)
        ]);

        // 5. Create new classes for continuing students and migrate students
        const newClassMap = new Map<string, string>(); // oldClassId -> newClassId

        for (const currentClass of currentClasses) {
          if (currentClass.grade === 10) {
            // Archive graduating class - migrate students out of the class
            const graduatingStudents = currentStudents.filter(s => s.classId === currentClass.id);
            
            for (const student of graduatingStudents) {
              await tx
                .update(students)
                .set({ 
                  classId: null, // Remove from class (graduated)
                  schoolYearId: newSchoolYear.id // But keep in new school year for record keeping
                })
                .where(eq(students.id, student.id));
              migratedStudents++;
            }
            
            graduatedClasses++;
          } else {
            // Create new class for next grade
            const newGrade = currentClass.grade + 1;
            const newName = currentClass.name.replace(currentClass.grade.toString(), newGrade.toString());
            
            const [newClass] = await tx.insert(classes).values({
              name: newName,
              grade: newGrade,
              studentCount: currentClass.studentCount,
              subjectHours: {}, // Will be populated by assignments
              classTeacher1Id: currentClass.classTeacher1Id,
              classTeacher2Id: currentClass.classTeacher2Id,
              schoolYearId: newSchoolYear.id
            }).returning();
            
            newClassMap.set(currentClass.id, newClass.id);
            migratedClasses++;

            // Migrate students to new class
            const classStudents = currentStudents.filter(s => s.classId === currentClass.id);
            for (const student of classStudents) {
              await tx
                .update(students)
                .set({ 
                  classId: newClass.id,
                  grade: newGrade,
                  schoolYearId: newSchoolYear.id
                })
                .where(eq(students.id, student.id));
              migratedStudents++;
            }
          }
        }

        // 6. Create new 5th grade classes
        for (const newClassData of params.newClasses) {
          await tx.insert(classes).values({
            name: newClassData.name,
            grade: newClassData.grade,
            studentCount: newClassData.expectedStudentCount,
            subjectHours: {},
            schoolYearId: newSchoolYear.id
          });
          createdNewClasses++;
        }

        // 7. Migrate assignments using NRW curriculum rules
        if (params.migrationRules.autoMigrateContinuousSubjects) {
          const subjectMigrationRules = this.getNRWSubjectMigrationRules();
          
          for (const assignment of currentAssignments) {
            const subject = allSubjects.find(s => s.id === assignment.subjectId);
            const currentClass = currentClasses.find(c => c.id === assignment.classId);
            
            if (!subject || !currentClass || currentClass.grade === 10) continue;
            
            const newClassId = newClassMap.get(assignment.classId);
            if (!newClassId) continue;

            const targetGrade = currentClass.grade + 1;
            const migrationRule = subjectMigrationRules[subject.shortName];
            
            if (migrationRule && migrationRule.canMigrateTo.includes(targetGrade)) {
              const targetHours = subject.hoursPerWeek[targetGrade.toString()] || migrationRule.defaultHours[targetGrade] || 0;

              if (targetHours > 0) {
                await tx.insert(assignments).values({
                  teacherId: assignment.teacherId,
                  classId: newClassId,
                  subjectId: assignment.subjectId,
                  hoursPerWeek: targetHours.toString(),
                  semester: assignment.semester as "1" | "2",
                  schoolYearId: newSchoolYear.id
                });
                migratedAssignments++;
              }
            }
          }
        }

        // 8. Set new school year as current
        await tx.update(schoolYears).set({ isCurrent: false });
        await tx
          .update(schoolYears)
          .set({ isCurrent: true })
          .where(eq(schoolYears.id, newSchoolYear.id));

        return {
          success: true,
          newSchoolYear,
          migratedClasses,
          migratedAssignments,
          migratedStudents,
          createdNewClasses,
          graduatedClasses,
          errors
        };
      } catch (error: any) {
        console.error("Error executing school year transition:", error);
        // Transaction will automatically rollback
        throw error;
      }
    });
  }

  // NRW Realschule Subject Migration Rules
  private getNRWSubjectMigrationRules(): Record<string, {
    canMigrateTo: number[];
    defaultHours: Record<number, number>;
    category: string;
    notes?: string;
  }> {
    return {
      // Continuous subjects (5-10)
      "DE": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 5, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 },
        category: "continuous"
      },
      "M": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4 },
        category: "continuous"
      },
      "E": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 4, 6: 4, 7: 4, 8: 3, 9: 3, 10: 4 },
        category: "continuous"
      },
      "SP": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3 },
        category: "continuous"
      },
      
      // Religion/Philosophy parallel group (continuous)
      "KR": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2 },
        category: "continuous_parallel"
      },
      "ER": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2 },
        category: "continuous_parallel"
      },
      "PP": {
        canMigrateTo: [6, 7, 8, 9, 10],
        defaultHours: { 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2 },
        category: "continuous_parallel"
      },

      // Subjects starting in grade 6
      "PH": {
        canMigrateTo: [7, 8], // Pause in 9, resumes in 10
        defaultHours: { 6: 2, 7: 2, 8: 2, 10: 2 },
        category: "interrupted",
        notes: "Pause in grade 9"
      },
      "GE": {
        canMigrateTo: [7, 8, 9, 10],
        defaultHours: { 6: 2, 7: 2, 8: 2, 9: 2, 10: 2 },
        category: "continuous_from_6"
      },
      "PK": {
        canMigrateTo: [7, 8, 9, 10],
        defaultHours: { 6: 1, 7: 2, 8: 2, 9: 2, 10: 2 },
        category: "continuous_from_6"
      },

      // Subjects starting in grade 7
      "CH": {
        canMigrateTo: [8, 9, 10],
        defaultHours: { 7: 2, 8: 2, 9: 2, 10: 2 },
        category: "continuous_from_7"
      },

      // Interrupted subjects
      "BI": {
        canMigrateTo: [6], // 5→6 OK, then pause in 7, resumes in 8
        defaultHours: { 5: 2, 6: 2, 8: 1, 9: 2, 10: 2 },
        category: "interrupted",
        notes: "Pause in grade 7, reduced hours in grade 8"
      },
      "EK": {
        canMigrateTo: [], // 5→6 NOT possible (pause), resumes in 7
        defaultHours: { 5: 2, 7: 1, 8: 2, 9: 1, 10: 2 },
        category: "interrupted",
        notes: "Pause in grade 6, variable hours"
      },
      "KU": {
        canMigrateTo: [6, 7], // 5→6→7 OK, pause in 8, brief in 9, ends
        defaultHours: { 5: 2, 6: 2, 7: 1, 9: 1 },
        category: "interrupted",
        notes: "Pause in grade 8, ends after grade 9"
      },
      "MU": {
        canMigrateTo: [6], // Ends after grade 6 (except as differentiation)
        defaultHours: { 5: 2, 6: 1 },
        category: "ending",
        notes: "Ends after grade 6, available as differentiation 7-10"
      },

      // Differentiation subjects (7-10 only)
      "FS": {
        canMigrateTo: [8, 9, 10],
        defaultHours: { 7: 3, 8: 4, 9: 3, 10: 4 },
        category: "differentiation"
      },
      "SW": {
        canMigrateTo: [8, 9, 10],
        defaultHours: { 7: 3, 8: 4, 9: 3, 10: 4 },
        category: "differentiation"
      },
      "NW": {
        canMigrateTo: [8, 9, 10],
        defaultHours: { 7: 3, 8: 4, 9: 3, 10: 4 },
        category: "differentiation"
      },
      "IF": {
        canMigrateTo: [8, 9, 10],
        defaultHours: { 7: 3, 8: 4, 9: 3, 10: 4 },
        category: "differentiation"
      },
      "TC": {
        canMigrateTo: [8, 9, 10],
        defaultHours: { 7: 3, 8: 4, 9: 3, 10: 4 },
        category: "differentiation"
      }
    };
  }

  // Subject Mappings for PDF Import Intelligence
  async getSubjectMappings(): Promise<SubjectMapping[]> {
    return await db.select().from(subjectMappings).orderBy(desc(subjectMappings.usedCount));
  }

  async getSubjectMapping(id: string): Promise<SubjectMapping | undefined> {
    const [mapping] = await db.select().from(subjectMappings).where(eq(subjectMappings.id, id));
    return mapping || undefined;
  }

  async findSubjectMappingByName(normalizedName: string): Promise<SubjectMapping | undefined> {
    const [mapping] = await db
      .select()
      .from(subjectMappings)
      .where(eq(subjectMappings.normalizedName, normalizedName.toLowerCase()));
    return mapping || undefined;
  }

  async createSubjectMapping(mapping: InsertSubjectMapping): Promise<SubjectMapping> {
    const [newMapping] = await db
      .insert(subjectMappings)
      .values({
        ...mapping,
        normalizedName: mapping.normalizedName.toLowerCase()
      })
      .returning();
    return newMapping;
  }

  async updateSubjectMapping(id: string, mapping: Partial<InsertSubjectMapping>): Promise<SubjectMapping> {
    const updateData = { ...mapping };
    if (updateData.normalizedName) {
      updateData.normalizedName = updateData.normalizedName.toLowerCase();
    }
    
    const [updatedMapping] = await db
      .update(subjectMappings)
      .set(updateData)
      .where(eq(subjectMappings.id, id))
      .returning();
    return updatedMapping;
  }

  async deleteSubjectMapping(id: string): Promise<void> {
    await db.delete(subjectMappings).where(eq(subjectMappings.id, id));
  }

  async incrementMappingUsage(id: string): Promise<void> {
    await db
      .update(subjectMappings)
      .set({
        usedCount: sql`${subjectMappings.usedCount} + 1`,
        lastUsedAt: new Date()
      })
      .where(eq(subjectMappings.id, id));
  }

  // PDF Imports and Tables
  async getPdfImports(): Promise<PdfImport[]> {
    return await db.select().from(pdfImports).orderBy(desc(pdfImports.createdAt));
  }

  async getPdfImport(id: string): Promise<PdfImport | undefined> {
    const [pdfImport] = await db.select().from(pdfImports).where(eq(pdfImports.id, id));
    return pdfImport || undefined;
  }

  async createPdfImport(pdfImport: InsertPdfImport): Promise<PdfImport> {
    const [created] = await db.insert(pdfImports).values(pdfImport).returning();
    return created;
  }

  async deletePdfImport(id: string): Promise<void> {
    await db.delete(pdfImports).where(eq(pdfImports.id, id));
  }

  async getPdfTables(): Promise<PdfTable[]> {
    return await db.select().from(pdfTables).orderBy(desc(pdfTables.extractedAt));
  }

  async getPdfTable(id: string): Promise<PdfTable | undefined> {
    const [pdfTable] = await db.select().from(pdfTables).where(eq(pdfTables.id, id));
    return pdfTable || undefined;
  }

  async getPdfTablesByImport(importId: string): Promise<PdfTable[]> {
    return await db.select().from(pdfTables).where(eq(pdfTables.importId, importId));
  }

  async createPdfTable(pdfTable: InsertPdfTable): Promise<PdfTable> {
    const [created] = await db.insert(pdfTables).values(pdfTable).returning();
    return created;
  }

  async updatePdfTable(id: string, pdfTable: Partial<InsertPdfTable>): Promise<PdfTable> {
    const [updated] = await db
      .update(pdfTables)
      .set(pdfTable)
      .where(eq(pdfTables.id, id))
      .returning();
    return updated;
  }

  async deletePdfTable(id: string): Promise<void> {
    await db.delete(pdfTables).where(eq(pdfTables.id, id));
  }
}

export const storage = new DatabaseStorage();
