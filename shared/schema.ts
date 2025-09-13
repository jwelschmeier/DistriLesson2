import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, json, date, unique, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// School Years table for versioning and school year transitions
export const schoolYears = pgTable("school_years", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "2024/25", "2025/26", etc.
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teachers = pgTable("teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  shortName: varchar("short_name", { length: 20 }).notNull().unique(),
  personnelNumber: varchar("personnel_number", { length: 20 }),
  email: text("email"),
  dateOfBirth: date("date_of_birth"),
  subjects: json("subjects").$type<string[]>().notNull().default([]),
  maxHours: decimal("max_hours", { precision: 4, scale: 1 }).notNull().default('25.0'),
  currentHours: decimal("current_hours", { precision: 4, scale: 1 }).notNull().default('0.0'),
  qualifications: json("qualifications").$type<string[]>().notNull().default([]),
  reductionHours: json("reduction_hours").$type<{
    AE?: number; // Altersermäßigung
    BA?: number; // Besondere Aufgaben  
    SL?: number; // Schulleitung
    SO?: number; // Sonstiges
    LK?: number; // Lehrertopf
    SB?: number; // Schwerbehinderung
    VG?: number; // Vorgriffsstunden
  }>().notNull().default({}),
  notes: text("notes").default(''),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  classId: varchar("class_id").references(() => classes.id, { onDelete: "set null" }),
  grade: integer("grade").notNull(),
  schoolYearId: varchar("school_year_id").references(() => schoolYears.id, { onDelete: "restrict" }), // nullable for backward compatibility
  createdAt: timestamp("created_at").defaultNow(),
});

export const classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull(),
  grade: integer("grade").notNull(),
  studentCount: integer("student_count").notNull().default(0),
  subjectHours: json("subject_hours").$type<Record<string, number>>().notNull().default({}),
  targetHoursTotal: decimal("target_hours_total", { precision: 4, scale: 1 }),
  targetHoursSemester1: decimal("target_hours_semester1", { precision: 4, scale: 1 }),
  targetHoursSemester2: decimal("target_hours_semester2", { precision: 4, scale: 1 }),
  classTeacher1Id: varchar("class_teacher_1_id").references(() => teachers.id, { onDelete: "set null" }),
  classTeacher2Id: varchar("class_teacher_2_id").references(() => teachers.id, { onDelete: "set null" }),
  schoolYearId: varchar("school_year_id").references(() => schoolYears.id, { onDelete: "restrict" }), // nullable for backward compatibility
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueClassPerYear: unique("unique_class_per_year").on(table.name, table.schoolYearId),
}));

export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  shortName: varchar("short_name", { length: 50 }).notNull().unique(),
  category: text("category").notNull(),
  hoursPerWeek: json("hours_per_week").$type<Record<string, number>>().notNull().default({}),
  parallelGroup: varchar("parallel_group", { length: 50 }), // Parallele Fächergruppe (optional)
  createdAt: timestamp("created_at").defaultNow(),
});

export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").references(() => teachers.id, { onDelete: "cascade" }).notNull(),
  classId: varchar("class_id").references(() => classes.id, { onDelete: "cascade" }).notNull(),
  subjectId: varchar("subject_id").references(() => subjects.id, { onDelete: "cascade" }).notNull(),
  hoursPerWeek: decimal("hours_per_week", { precision: 3, scale: 1 }).notNull(),
  semester: varchar("semester", { length: 2 }).notNull().default("1"), // "1" for 1st semester, "2" for 2nd semester
  isOptimized: boolean("is_optimized").notNull().default(false),
  teamTeachingId: varchar("team_teaching_id"), // Groups assignments that are team-taught together
  schoolYearId: varchar("school_year_id").references(() => schoolYears.id, { onDelete: "restrict" }), // nullable for backward compatibility
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  teamTeachingIndex: index("team_teaching_idx").on(table.teamTeachingId),
}));

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

// PDF Import Subject Mappings table
export const subjectMappings = pgTable("subject_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pdfSubjectName: text("pdf_subject_name").notNull(), // Original name from PDF (e.g., "Deutsch Förder 1. Hj.")
  normalizedName: text("normalized_name").notNull(), // Normalized version for matching (e.g., "deutsch förder")
  systemSubjectId: varchar("system_subject_id").references(() => subjects.id, { onDelete: "cascade" }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull().default('1.0'), // 0.0 to 1.0 confidence score
  usedCount: integer("used_count").notNull().default(0), // How often this mapping was applied
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
}, (table) => ({
  // Index for fast lookups during import
  normalizedNameIdx: index("idx_subject_mappings_normalized").on(table.normalizedName),
}));

// PDF Imports and Tables
export const pdfImports = pgTable("pdf_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileHash: varchar("file_hash").unique(),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  pageCount: integer("page_count").notNull().default(0),
  metadata: json("metadata").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pdfTables = pgTable("pdf_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importId: varchar("import_id").references(() => pdfImports.id, { onDelete: "cascade" }).notNull(),
  page: integer("page").notNull(),
  tableIndex: integer("table_index").notNull(),
  headers: json("headers").$type<string[]>().notNull().default([]),
  rows: json("rows").$type<string[][]>().notNull().default([]),
  rawText: text("raw_text"),
  extractedAt: timestamp("extracted_at").defaultNow(),
}, (table) => ({
  importPageIdx: index("idx_pdf_tables_import_page").on(table.importId, table.page),
}));

// Authentication tables

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // user, admin
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invitations table for invitation-based access control
export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  token: varchar("token").notNull().unique(), // for invitation link
  role: varchar("role").notNull().default("user"), // user, admin
  createdBy: varchar("created_by").references(() => users.id),
  used: boolean("used").default(false),
  usedBy: varchar("used_by").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  usedAt: timestamp("used_at"),
});

// Relations
export const schoolYearsRelations = relations(schoolYears, ({ many }) => ({
  students: many(students),
  classes: many(classes),
  assignments: many(assignments),
}));

export const teachersRelations = relations(teachers, ({ many }) => ({
  assignments: many(assignments),
  classesAsTeacher1: many(classes, { relationName: "classTeacher1" }),
  classesAsTeacher2: many(classes, { relationName: "classTeacher2" }),
}));

export const studentsRelations = relations(students, ({ one }) => ({
  class: one(classes, {
    fields: [students.classId],
    references: [classes.id],
  }),
  schoolYear: one(schoolYears, {
    fields: [students.schoolYearId],
    references: [schoolYears.id],
  }),
}));

export const classesRelations = relations(classes, ({ many, one }) => ({
  students: many(students),
  assignments: many(assignments),
  classTeacher1: one(teachers, {
    fields: [classes.classTeacher1Id],
    references: [teachers.id],
    relationName: "classTeacher1",
  }),
  classTeacher2: one(teachers, {
    fields: [classes.classTeacher2Id],
    references: [teachers.id],
    relationName: "classTeacher2",
  }),
  schoolYear: one(schoolYears, {
    fields: [classes.schoolYearId],
    references: [schoolYears.id],
  }),
}));

export const planstellenScenariosRelations = relations(planstellenScenarios, ({ many }) => ({
  planstellen: many(planstellen),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  assignments: many(assignments),
  planstellen: many(planstellen),
  subjectMappings: many(subjectMappings),
}));

export const subjectMappingsRelations = relations(subjectMappings, ({ one }) => ({
  systemSubject: one(subjects, {
    fields: [subjectMappings.systemSubjectId],
    references: [subjects.id],
  }),
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
  schoolYear: one(schoolYears, {
    fields: [assignments.schoolYearId],
    references: [schoolYears.id],
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

// Authentication relations
export const usersRelations = relations(users, ({ many }) => ({
  invitationsCreated: many(invitations, { relationName: "createdBy" }),
  invitationsUsed: many(invitations, { relationName: "usedBy" }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  createdBy: one(users, {
    fields: [invitations.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  usedBy: one(users, {
    fields: [invitations.usedBy],
    references: [users.id],
    relationName: "usedBy",
  }),
}));

// Insert schemas
export const insertSchoolYearSchema = createInsertSchema(schoolYears).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Schuljahr-Name ist erforderlich").max(20, "Name zu lang"),
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, { message: "Gültiges Startdatum erforderlich" }),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, { message: "Gültiges Enddatum erforderlich" }),
  isCurrent: z.boolean().optional(),
});

export const insertTeacherSchema = createInsertSchema(teachers).omit({
  id: true,
  createdAt: true,
});

export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
}).extend({
  schoolYearId: z.string().uuid().nullable().optional(),
});

export const insertClassSchema = createInsertSchema(classes).omit({
  id: true,
  createdAt: true,
}).extend({
  classTeacher1Id: z.string().uuid().nullable().optional(),
  classTeacher2Id: z.string().uuid().nullable().optional(),
  schoolYearId: z.string().uuid().nullable().optional(),
  targetHoursSemester1: z.string()
    .nullable()
    .optional()
    .refine((val) => {
      if (val === null || val === undefined || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 50;
    }, { message: "Soll-Stunden 1.HJ müssen zwischen 0 und 50 liegen" }),
  targetHoursSemester2: z.string()
    .nullable()
    .optional()
    .refine((val) => {
      if (val === null || val === undefined || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 50;
    }, { message: "Soll-Stunden 2.HJ müssen zwischen 0 und 50 liegen" }),
  targetHoursTotal: z.string()
    .nullable()
    .optional()
    .refine((val) => {
      if (val === null || val === undefined || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, { message: "Gesamtstunden müssen zwischen 0 und 100 liegen" }),
  grade: z.number().int().min(5).max(10),
  studentCount: z.number().int().min(0).max(35),
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true,
});

export const insertAssignmentSchema = createInsertSchema(assignments).omit({
  id: true,
  createdAt: true,
}).extend({
  semester: z.enum(["1", "2"], { invalid_type_error: "Semester muss '1' oder '2' sein" }),
  hoursPerWeek: z.number().min(0.5, "Mindestens 0,5 Stunden pro Woche").max(10, "Maximal 10 Stunden pro Woche")
    .transform(num => num.toString()),
  schoolYearId: z.string().uuid().nullable().optional(),
  teamTeachingId: z.string().uuid().nullable().optional(),
});

export const insertPlanstellenScenarioSchema = createInsertSchema(planstellenScenarios).omit({
  id: true,
  createdAt: true,
});

export const insertPlanstelleSchema = createInsertSchema(planstellen).omit({
  id: true,
  calculatedAt: true,
});

// Authentication insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  email: z.string().email("Gültige E-Mail-Adresse erforderlich").optional(),
  role: z.enum(["user", "admin"], { invalid_type_error: "Rolle muss 'user' oder 'admin' sein" }).optional(),
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  token: true,
  used: true,
  usedBy: true,
  usedAt: true,
  createdAt: true,
}).extend({
  email: z.string().email("Gültige E-Mail-Adresse erforderlich"),
  role: z.enum(["user", "admin"], { invalid_type_error: "Rolle muss 'user' oder 'admin' sein" }),
  createdBy: z.string().refine((val) => {
    // Accept both UUID format and Replit User ID format (numeric string)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) || /^[0-9]+$/.test(val);
  }, { message: "Ungültige Benutzer-ID (muss UUID oder numerische ID sein)" }),
  expiresAt: z.date().refine((date) => date > new Date(), { 
    message: "Ablaufdatum muss in der Zukunft liegen" 
  }),
});

// Subject Mapping insert schema
export const insertSubjectMappingSchema = createInsertSchema(subjectMappings).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
}).extend({
  pdfSubjectName: z.string().min(1, "PDF-Fachname ist erforderlich"),
  normalizedName: z.string().min(1, "Normalisierter Name ist erforderlich"),
  systemSubjectId: z.string().uuid("Gültige System-Fach-ID erforderlich"),
  confidence: z.number().min(0).max(1).optional()
    .transform(num => num !== undefined ? num.toString() : undefined),
  usedCount: z.number().int().min(0).optional(),
});

export const insertPdfImportSchema = createInsertSchema(pdfImports).omit({
  id: true,
  createdAt: true,
});

export const insertPdfTableSchema = createInsertSchema(pdfTables).omit({
  id: true,
  extractedAt: true,
}).extend({
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
});

// Types
export type SchoolYear = typeof schoolYears.$inferSelect;
export type InsertSchoolYear = z.infer<typeof insertSchoolYearSchema>;
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

// Subject Mapping types
export type SubjectMapping = typeof subjectMappings.$inferSelect;
export type InsertSubjectMapping = z.infer<typeof insertSubjectMappingSchema>;

// Authentication types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type PdfImport = typeof pdfImports.$inferSelect;
export type InsertPdfImport = z.infer<typeof insertPdfImportSchema>;
export type PdfTable = typeof pdfTables.$inferSelect;
export type InsertPdfTable = z.infer<typeof insertPdfTableSchema>;

// Schema für Planstellen-Eingabe - NUR GRUNDBEDARF Excel F3-F10
export const planstellenInputSchema = z.object({
  // Grunddaten
  schulname: z.string().min(1, "Schulname ist erforderlich").default("Realschule Musterstadt"),
  schuljahr: z.string().min(1, "Schuljahr ist erforderlich").default("2024/25"),
  
  // === GRUNDBEDARF - Exakte Excel-Struktur F3-F10 ===
  // F3: "Schülerzahl Stand 31.08.24" (EINGABEFELD)
  schuelerzahlStand: z.number().min(0).default(710),
  
  // F4: "Schüler/Lehrerrelation an der Realschule: (ab 06/18)" (EINGABEFELD)
  schuelerLehrerrelation: z.number().min(0.1).default(20.19),
  
  // F5: "Quotient der zwei Größen:" = F3/F4 = 35.16592372 (BERECHNET)
  // F6: "Quotient der zwei Größen nach der 2. Dezimale abgeschnitten" = TRUNC(F5,2) = 35.16 (BERECHNET)
  // F7: "abgerundet auf halbe bzw. ganze Dezimale:" = IF(F5-INT(F5)<0.5,INT(F5),INT(F5)+0.5) = 35 (BERECHNET)
  
  // F8: "bedarfsdeckender Unterricht - Abzug Lehramtsanwärter" (EINGABEFELD)
  abzugLehramtsanwaerter: z.number().default(-0.5),
  
  // F9: "Rundung" (EINGABEFELD) 
  rundung: z.number().default(-0.21),
  
  // F10: "Summe Grundbedarf" = SUM(F6,F8:F9) = 34.45 (BERECHNET)
});

export type PlanstellenInput = z.infer<typeof planstellenInputSchema>;
