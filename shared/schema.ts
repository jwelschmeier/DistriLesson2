import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, json, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const teachers = pgTable("teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  shortName: varchar("short_name", { length: 20 }).notNull().unique(),
  email: text("email"),
  dateOfBirth: date("date_of_birth"),
  subjects: json("subjects").$type<string[]>().notNull().default([]),
  maxHours: decimal("max_hours", { precision: 4, scale: 1 }).notNull().default('25.0'),
  currentHours: decimal("current_hours", { precision: 4, scale: 1 }).notNull().default('0.0'),
  qualifications: json("qualifications").$type<string[]>().notNull().default([]),
  reductionHours: json("reduction_hours").$type<{
    sV?: number; // Schülervertretung
    sL?: number; // Schulleitung
    SB?: number; // Schwerbehinderung
    LK?: number; // Lehrerkonferenz
    VG?: number; // weitere Kategorie
    FB?: number; // Fachberater
    aE?: number; // Altersermäßigung (automatisch berechnet)
    BA?: number; // Besondere Aufgaben
    SO?: number; // Sonstiges
  }>().notNull().default({}),
  notes: text("notes").default(''),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  classId: varchar("class_id").references(() => classes.id),
  grade: integer("grade").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull().unique(),
  grade: integer("grade").notNull(),
  studentCount: integer("student_count").notNull().default(0),
  subjectHours: json("subject_hours").$type<Record<string, number>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  shortName: varchar("short_name", { length: 50 }).notNull().unique(),
  category: text("category").notNull(),
  hoursPerWeek: json("hours_per_week").$type<Record<string, number>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").references(() => teachers.id).notNull(),
  classId: varchar("class_id").references(() => classes.id).notNull(),
  subjectId: varchar("subject_id").references(() => subjects.id).notNull(),
  hoursPerWeek: integer("hours_per_week").notNull(),
  isOptimized: boolean("is_optimized").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planstellenScenarios = pgTable("planstellen_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  schoolYear: text("school_year").notNull(),
  parameters: json("parameters").$type<{
    classesByGrade?: Record<string, number>;
    subjectHourOverrides?: Record<string, Record<string, number>>;
    categoryFactors?: Record<string, number>;
    includeFlags?: Record<string, boolean>;
  }>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planstellen = pgTable("planstellen", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenarioId: varchar("scenario_id").references(() => planstellenScenarios.id),
  subjectId: varchar("subject_id").references(() => subjects.id), // nullable for totals
  grade: integer("grade"), // nullable for summaries
  category: text("category").notNull(), // grundbedarf, foerder, ergaenzung, ag, summe, etc.
  component: text("component").notNull(), // descriptive label
  lineType: text("line_type").notNull(), // requirement, capacity, summary
  formula: json("formula").$type<{
    op?: string;
    terms?: any[];
    description?: string;
  }>().notNull().default({}),
  color: text("color"), // for UI color coding
  requiredHours: decimal("required_hours", { precision: 4, scale: 1 }).notNull(),
  availableHours: decimal("available_hours", { precision: 4, scale: 1 }).notNull(),
  deficit: decimal("deficit", { precision: 4, scale: 1 }).notNull().default('0'),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

// Relations
export const teachersRelations = relations(teachers, ({ many }) => ({
  assignments: many(assignments),
}));

export const studentsRelations = relations(students, ({ one }) => ({
  class: one(classes, {
    fields: [students.classId],
    references: [classes.id],
  }),
}));

export const classesRelations = relations(classes, ({ many, one }) => ({
  students: many(students),
  assignments: many(assignments),
}));

export const planstellenScenariosRelations = relations(planstellenScenarios, ({ many }) => ({
  planstellen: many(planstellen),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  assignments: many(assignments),
  planstellen: many(planstellen),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  teacher: one(teachers, {
    fields: [assignments.teacherId],
    references: [teachers.id],
  }),
  class: one(classes, {
    fields: [assignments.classId],
    references: [classes.id],
  }),
  subject: one(subjects, {
    fields: [assignments.subjectId],
    references: [subjects.id],
  }),
}));

export const planstellenRelations = relations(planstellen, ({ one }) => ({
  scenario: one(planstellenScenarios, {
    fields: [planstellen.scenarioId],
    references: [planstellenScenarios.id],
  }),
  subject: one(subjects, {
    fields: [planstellen.subjectId],
    references: [subjects.id],
  }),
}));

// Insert schemas
export const insertTeacherSchema = createInsertSchema(teachers).omit({
  id: true,
  createdAt: true,
});

export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
});

export const insertClassSchema = createInsertSchema(classes).omit({
  id: true,
  createdAt: true,
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true,
});

export const insertAssignmentSchema = createInsertSchema(assignments).omit({
  id: true,
  createdAt: true,
});

export const insertPlanstellenScenarioSchema = createInsertSchema(planstellenScenarios).omit({
  id: true,
  createdAt: true,
});

export const insertPlanstelleSchema = createInsertSchema(planstellen).omit({
  id: true,
  calculatedAt: true,
});

// Types
export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Class = typeof classes.$inferSelect;
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type PlanstellenScenario = typeof planstellenScenarios.$inferSelect;
export type InsertPlanstellenScenario = z.infer<typeof insertPlanstellenScenarioSchema>;
export type Planstelle = typeof planstellen.$inferSelect;
export type InsertPlanstelle = z.infer<typeof insertPlanstelleSchema>;
