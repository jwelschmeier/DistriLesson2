import { 
  teachers, 
  students, 
  classes, 
  subjects, 
  assignments, 
  planstellen,
  planstellenScenarios,
  schoolYears,
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
  type InsertSchoolYear
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc } from "drizzle-orm";

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

  // Assignments
  getAssignments(): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  updateAssignment(id: string, assignment: Partial<InsertAssignment>): Promise<Assignment>;
  deleteAssignment(id: string): Promise<void>;
  getAssignmentsByTeacher(teacherId: string): Promise<Assignment[]>;
  getAssignmentsByClass(classId: string): Promise<Assignment[]>;
  getAssignmentsBySchoolYear(schoolYearId: string): Promise<Assignment[]>;

  // Planstellen
  getPlanstellen(): Promise<Planstelle[]>;
  getPlanstelle(id: string): Promise<Planstelle | undefined>;
  createPlanstelle(planstelle: InsertPlanstelle): Promise<Planstelle>;
  updatePlanstelle(id: string, planstelle: Partial<InsertPlanstelle>): Promise<Planstelle>;
  deletePlanstelle(id: string): Promise<void>;

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
    await db.delete(subjects).where(eq(subjects.id, id));
  }

  // Assignments
  async getAssignments(): Promise<Assignment[]> {
    return await db.select().from(assignments).orderBy(desc(assignments.createdAt));
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
}

export const storage = new DatabaseStorage();
