import { 
  teachers, 
  students, 
  classes, 
  subjects, 
  assignments, 
  planstellen,
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
  type InsertPlanstelle
} from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc } from "drizzle-orm";

export interface IStorage {
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

  // Classes
  getClasses(): Promise<Class[]>;
  getClass(id: string): Promise<Class | undefined>;
  createClass(classData: InsertClass): Promise<Class>;
  updateClass(id: string, classData: Partial<InsertClass>): Promise<Class>;
  deleteClass(id: string): Promise<void>;

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
      qualifications: teacher.qualifications as string[]
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
    
    const [updatedTeacher] = await db
      .update(teachers)
      .set(updateData)
      .where(eq(teachers.id, id))
      .returning();
    return updatedTeacher;
  }

  async deleteTeacher(id: string): Promise<void> {
    await db.delete(teachers).where(eq(teachers.id, id));
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
    const [newStudent] = await db.insert(students).values(student).returning();
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

  // Classes
  async getClasses(): Promise<Class[]> {
    return await db.select().from(classes).orderBy(classes.name);
  }

  async getClass(id: string): Promise<Class | undefined> {
    const [classData] = await db.select().from(classes).where(eq(classes.id, id));
    return classData || undefined;
  }

  async createClass(classData: InsertClass): Promise<Class> {
    const [newClass] = await db.insert(classes).values(classData).returning();
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
    const [newAssignment] = await db.insert(assignments).values(assignment).returning();
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

  // Planstellen
  async getPlanstellen(): Promise<Planstelle[]> {
    return await db.select().from(planstellen).orderBy(desc(planstellen.calculatedAt));
  }

  async getPlanstelle(id: string): Promise<Planstelle | undefined> {
    const [planstelle] = await db.select().from(planstellen).where(eq(planstellen.id, id));
    return planstelle || undefined;
  }

  async createPlanstelle(planstelle: InsertPlanstelle): Promise<Planstelle> {
    const [newPlanstelle] = await db.insert(planstellen).values(planstelle).returning();
    return newPlanstelle;
  }

  async updatePlanstelle(id: string, planstelle: Partial<InsertPlanstelle>): Promise<Planstelle> {
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
      qualifications: teacher.qualifications as string[]
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
}

export const storage = new DatabaseStorage();
