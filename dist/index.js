var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/lesson-distribution-importer.ts
var lesson_distribution_importer_exports = {};
__export(lesson_distribution_importer_exports, {
  LessonDistributionImporter: () => LessonDistributionImporter
});
import XLSX from "xlsx";
var LessonDistributionImporter;
var init_lesson_distribution_importer = __esm({
  "server/lesson-distribution-importer.ts"() {
    "use strict";
    LessonDistributionImporter = class {
      constructor(storage2) {
        this.storage = storage2;
      }
      async importFromExcel(filePath, schoolYearId) {
        const result = {
          success: false,
          imported: { teachers: 0, subjects: 0, classes: 0, assignments: 0 },
          errors: [],
          warnings: []
        };
        try {
          const workbook = XLSX.readFile(filePath);
          const sheetName = "Detail je Fach";
          if (!workbook.SheetNames.includes(sheetName)) {
            result.errors.push(`Arbeitsblatt "${sheetName}" nicht gefunden`);
            return result;
          }
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const records = [];
          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 4) continue;
            const className = row[0]?.toString().trim();
            const subjectShort = row[1]?.toString().trim();
            const hoursPerWeek = parseFloat(row[2]);
            const teacherShort = row[3]?.toString().trim();
            const studentCount = parseInt(row[7]) || 30;
            if (!className || !subjectShort || isNaN(hoursPerWeek) || !teacherShort) {
              result.warnings.push(`Zeile ${i + 1}: Unvollst\xE4ndige Daten \xFCbersprungen`);
              continue;
            }
            records.push({
              className,
              subjectShort,
              hoursPerWeek,
              teacherShort,
              studentCount
            });
          }
          console.log(`Gefundene Datens\xE4tze: ${records.length}`);
          const uniqueTeachers = new Set(records.map((r) => r.teacherShort));
          const uniqueSubjects = new Set(records.map((r) => r.subjectShort));
          const uniqueClasses = /* @__PURE__ */ new Map();
          records.forEach((r) => {
            const grade = parseInt(r.className.match(/(\d+)/)?.[1] || "5");
            if (!uniqueClasses.has(r.className)) {
              uniqueClasses.set(r.className, { grade, studentCount: r.studentCount });
            }
          });
          const [existingTeachers, existingSubjects, existingClasses] = await Promise.all([
            this.storage.getTeachers(),
            this.storage.getSubjects(),
            this.storage.getClassesBySchoolYear(schoolYearId)
          ]);
          const existingTeacherShorts = new Set(existingTeachers.map((t) => t.shortName));
          const existingSubjectShorts = new Set(existingSubjects.map((s) => s.shortName));
          const existingClassNames = new Set(existingClasses.map((c) => c.name));
          for (const teacherShort of Array.from(uniqueTeachers)) {
            if (!existingTeacherShorts.has(teacherShort)) {
              const teacher = {
                firstName: teacherShort,
                lastName: "(Importiert)",
                shortName: teacherShort,
                email: `${teacherShort.toLowerCase()}@schule.de`,
                subjects: [],
                maxHours: "25",
                currentHours: "0",
                qualifications: [],
                isActive: true
              };
              await this.storage.createTeacher(teacher);
              result.imported.teachers++;
            }
          }
          const nrwSubjectMapping = {
            "D": "Deutsch",
            "E": "Englisch",
            "M": "Mathematik",
            "GE": "Geschichte",
            "EK": "Erdkunde",
            "PK": "Politik",
            "BI": "Biologie",
            "CH": "Chemie",
            "PH": "Physik",
            "SP": "Sport",
            "KU": "Kunst",
            "MU": "Musik",
            "IF": "Informatik",
            "TC": "Technik",
            "HW": "Hauswirtschaft",
            "Fs": "Franz\xF6sisch",
            "SW": "Sozialwissenschaften",
            "KR": "Katholische Religionslehre",
            "ER": "Evangelische Religionslehre",
            "PP": "Praktische Philosophie",
            "IKG": "Islamkunde",
            "WP": "Wahlpflichtbereich"
          };
          for (const subjectShort of Array.from(uniqueSubjects)) {
            if (!existingSubjectShorts.has(subjectShort)) {
              const subject = {
                name: nrwSubjectMapping[subjectShort] || subjectShort,
                shortName: subjectShort,
                category: this.getSubjectCategory(subjectShort),
                hoursPerWeek: {},
                parallelGroup: this.getParallelGroup(subjectShort)
              };
              await this.storage.createSubject(subject);
              result.imported.subjects++;
            }
          }
          for (const [className, classInfo] of Array.from(uniqueClasses.entries())) {
            if (!existingClassNames.has(className)) {
              const classData = {
                name: className,
                grade: classInfo.grade,
                studentCount: classInfo.studentCount,
                schoolYearId,
                subjectHours: {},
                targetHoursSemester1: null,
                targetHoursSemester2: null
              };
              await this.storage.createClass(classData);
              result.imported.classes++;
            }
          }
          const [updatedTeachers, updatedSubjects, updatedClasses] = await Promise.all([
            this.storage.getTeachers(),
            this.storage.getSubjects(),
            this.storage.getClassesBySchoolYear(schoolYearId)
          ]);
          for (const record of records) {
            const teacher = updatedTeachers.find((t) => t.shortName === record.teacherShort);
            const subject = updatedSubjects.find((s) => s.shortName === record.subjectShort);
            const classObj = updatedClasses.find((c) => c.name === record.className);
            if (!teacher || !subject || !classObj) {
              result.warnings.push(`Zuordnung \xFCbersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className} (fehlende Entit\xE4t)`);
              continue;
            }
            const existingAssignments = await this.storage.getAssignmentsBySchoolYear(schoolYearId);
            const assignmentExists = existingAssignments.some(
              (a) => a.teacherId === teacher.id && a.subjectId === subject.id && a.classId === classObj.id
            );
            if (!assignmentExists) {
              const assignment = {
                teacherId: teacher.id,
                subjectId: subject.id,
                classId: classObj.id,
                schoolYearId,
                hoursPerWeek: record.hoursPerWeek,
                semester: "1"
                // Default to first semester
              };
              await this.storage.createAssignment(assignment);
              result.imported.assignments++;
            }
          }
          result.success = true;
          console.log("Import erfolgreich abgeschlossen:", result.imported);
        } catch (error) {
          result.errors.push(`Import-Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
          console.error("Import error:", error);
        }
        return result;
      }
      getSubjectCategory(shortName) {
        const categories = {
          "D": "Hauptfach",
          "E": "Hauptfach",
          "M": "Hauptfach",
          "GE": "Nebenfach",
          "EK": "Nebenfach",
          "PK": "Nebenfach",
          "BI": "Naturwissenschaft",
          "CH": "Naturwissenschaft",
          "PH": "Naturwissenschaft",
          "SP": "Sport",
          "KU": "Kunst/Musik",
          "MU": "Kunst/Musik",
          "IF": "Wahlpflicht",
          "TC": "Wahlpflicht",
          "HW": "Wahlpflicht",
          "Fs": "Wahlpflicht",
          "SW": "Wahlpflicht",
          "KR": "Religion",
          "ER": "Religion",
          "PP": "Religion",
          "IKG": "Religion"
        };
        return categories[shortName] || "Sonstiges";
      }
      getParallelGroup(shortName) {
        if (["KR", "ER", "PP", "IKG"].includes(shortName)) {
          return "Religion";
        }
        if (["Fs", "SW", "IF", "TC", "HW"].includes(shortName)) {
          return "Differenzierung";
        }
        return null;
      }
      // NEW: Validated import method that only allows assignments matching teacher subjects
      async importFromExcelValidated(filePath, schoolYearId) {
        const result = {
          success: false,
          imported: { teachers: 0, subjects: 0, classes: 0, assignments: 0 },
          errors: [],
          warnings: []
        };
        try {
          console.log("=== VALIDIERTER EXCEL-IMPORT GESTARTET ===");
          const existingTeachers = await this.storage.getTeachers();
          const teacherSubjectsMap = {};
          existingTeachers.forEach((teacher) => {
            if (teacher.subjects && Array.isArray(teacher.subjects)) {
              teacherSubjectsMap[teacher.shortName] = teacher.subjects;
            } else {
              teacherSubjectsMap[teacher.shortName] = [];
            }
          });
          console.log("Geladene Lehrerdaten:", Object.keys(teacherSubjectsMap).length);
          const workbook = XLSX.readFile(filePath);
          let foundSheet = null;
          const possibleSheetNames = [
            "Detail je Fach",
            "Unterrichtsverteilung",
            "Sheet1",
            "Tabelle1",
            workbook.SheetNames[0]
            // Fallback to first sheet
          ];
          for (const sheetName of possibleSheetNames) {
            if (workbook.SheetNames.includes(sheetName)) {
              foundSheet = sheetName;
              break;
            }
          }
          if (!foundSheet) {
            result.errors.push(`Kein passendes Arbeitsblatt gefunden. Verf\xFCgbare Bl\xE4tter: ${workbook.SheetNames.join(", ")}`);
            return result;
          }
          console.log(`Verwende Arbeitsblatt: ${foundSheet}`);
          const worksheet = workbook.Sheets[foundSheet];
          const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          console.log(`Gesamte Zeilen in Excel: ${data.length}`);
          const records = [];
          const validationErrors = [];
          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 4) continue;
            const className = row[0]?.toString().trim();
            const subjectShort = row[1]?.toString().trim();
            const hoursPerWeek = parseFloat(row[2]);
            const teacherShort = row[3]?.toString().trim();
            const studentCount = parseInt(row[7]) || 30;
            if (!className || !subjectShort || isNaN(hoursPerWeek) || !teacherShort) {
              result.warnings.push(`Zeile ${i + 1}: Unvollst\xE4ndige Daten \xFCbersprungen (${className}, ${subjectShort}, ${teacherShort})`);
              continue;
            }
            const teacherSubjects = teacherSubjectsMap[teacherShort];
            if (!teacherSubjects) {
              validationErrors.push(`Zeile ${i + 1}: Lehrer ${teacherShort} nicht in Lehrerdaten gefunden`);
              continue;
            }
            const subjectMatches = teacherSubjects.some((ts) => {
              if (ts === subjectShort) return true;
              if (ts.toLowerCase() === subjectShort.toLowerCase()) return true;
              const strictMappings = {
                // If Excel asks for 'D', teacher can have 'D' or 'Deutsch' 
                "D": ["D", "Deutsch"],
                "E": ["E", "Englisch", "English"],
                "M": ["M", "Mathe", "Mathematik"],
                // If Excel asks for 'Fs', teacher must have 'Fs', 'F' or 'Französisch' 
                "Fs": ["Fs", "F", "Franz\xF6sisch"],
                "GE": ["GE", "Ge", "Geschichte"],
                "EK": ["EK", "Ek", "Erdkunde"],
                // These subjects need exact matches to prevent confusion
                "PK": ["PK", "Pk", "Politik"],
                "SW": ["SW", "Sozialwissenschaften"],
                "SP": ["SP", "Sp", "Sport"],
                "BI": ["BI", "Bi", "Biologie"],
                "CH": ["CH", "Ch", "Chemie"],
                "PH": ["PH", "Ph", "Physik"],
                "KU": ["KU", "Ku", "Kunst"],
                "MU": ["MU", "Mu", "Musik"],
                "IF": ["IF", "If", "Informatik", "IKG", "Ikg"],
                // IKG in Excel should map to Informatik qualifications
                "IKG": ["IKG", "Ikg", "IF", "If", "Informatik"],
                "TC": ["TC", "Tc", "Technik"],
                "HW": ["HW", "Hauswirtschaft"],
                "KR": ["KR", "Kr", "katholische Religion"],
                "ER": ["ER", "Er", "evangelische Religion"],
                "PP": ["PP", "Pp", "Praktische Philosophie"]
              };
              const allowedTeacherSubjects = strictMappings[subjectShort];
              if (allowedTeacherSubjects) {
                return allowedTeacherSubjects.includes(ts);
              }
              return false;
            });
            if (!subjectMatches) {
              validationErrors.push(`Zeile ${i + 1}: ${teacherShort} ist nicht qualifiziert f\xFCr ${subjectShort}. Qualifikationen: [${teacherSubjects.join(", ")}]`);
              continue;
            }
            records.push({
              className,
              subjectShort,
              hoursPerWeek,
              teacherShort,
              studentCount
            });
          }
          console.log(`G\xFCltige Datens\xE4tze nach Validierung: ${records.length}`);
          console.log(`Validierungsfehler: ${validationErrors.length}`);
          result.warnings.push(...validationErrors);
          if (records.length === 0) {
            result.errors.push("Keine g\xFCltigen Datens\xE4tze gefunden, die mit den Lehrerdaten \xFCbereinstimmen");
            return result;
          }
          const uniqueTeachers = new Set(records.map((r) => r.teacherShort));
          const uniqueSubjects = new Set(records.map((r) => r.subjectShort));
          const uniqueClasses = /* @__PURE__ */ new Map();
          records.forEach((r) => {
            const grade = parseInt(r.className.match(/(\d+)/)?.[1] || "5");
            if (!uniqueClasses.has(r.className)) {
              uniqueClasses.set(r.className, { grade, studentCount: r.studentCount });
            }
          });
          const [existingSubjects, existingClasses] = await Promise.all([
            this.storage.getSubjects(),
            this.storage.getClassesBySchoolYear(schoolYearId)
          ]);
          const existingSubjectShorts = new Set(existingSubjects.map((s) => s.shortName));
          const existingClassNames = new Set(existingClasses.map((c) => c.name));
          const nrwSubjectMapping = {
            "D": "Deutsch",
            "E": "Englisch",
            "M": "Mathematik",
            "GE": "Geschichte",
            "EK": "Erdkunde",
            "PK": "Politik",
            "BI": "Biologie",
            "CH": "Chemie",
            "PH": "Physik",
            "SP": "Sport",
            "KU": "Kunst",
            "MU": "Musik",
            "IF": "Informatik",
            "TC": "Technik",
            "HW": "Hauswirtschaft",
            "Fs": "Franz\xF6sisch",
            "SW": "Sozialwissenschaften",
            "KR": "Katholische Religionslehre",
            "ER": "Evangelische Religionslehre",
            "PP": "Praktische Philosophie",
            "IKG": "Islamkunde",
            "WP": "Wahlpflichtbereich"
          };
          for (const subjectShort of Array.from(uniqueSubjects)) {
            if (!existingSubjectShorts.has(subjectShort)) {
              const subject = {
                name: nrwSubjectMapping[subjectShort] || subjectShort,
                shortName: subjectShort,
                category: this.getSubjectCategory(subjectShort),
                hoursPerWeek: {},
                parallelGroup: this.getParallelGroup(subjectShort)
              };
              await this.storage.createSubject(subject);
              result.imported.subjects++;
            }
          }
          for (const [className, classInfo] of Array.from(uniqueClasses.entries())) {
            if (!existingClassNames.has(className)) {
              const classData = {
                name: className,
                grade: classInfo.grade,
                studentCount: classInfo.studentCount,
                schoolYearId,
                subjectHours: {},
                targetHoursSemester1: null,
                targetHoursSemester2: null
              };
              await this.storage.createClass(classData);
              result.imported.classes++;
            }
          }
          const existingAssignments = await this.storage.getAssignmentsBySchoolYear(schoolYearId);
          for (const assignment of existingAssignments) {
            await this.storage.deleteAssignment(assignment.id);
          }
          const [updatedTeachers, updatedSubjects, updatedClasses] = await Promise.all([
            this.storage.getTeachers(),
            this.storage.getSubjects(),
            this.storage.getClassesBySchoolYear(schoolYearId)
          ]);
          for (const record of records) {
            const teacher = updatedTeachers.find((t) => t.shortName === record.teacherShort);
            const subject = updatedSubjects.find((s) => s.shortName === record.subjectShort);
            const classObj = updatedClasses.find((c) => c.name === record.className);
            if (!teacher || !subject || !classObj) {
              result.warnings.push(`Zuordnung \xFCbersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className} (fehlende Entit\xE4t)`);
              continue;
            }
            const assignment = {
              teacherId: teacher.id,
              subjectId: subject.id,
              classId: classObj.id,
              schoolYearId,
              hoursPerWeek: record.hoursPerWeek,
              semester: "1"
              // Default to first semester
            };
            await this.storage.createAssignment(assignment);
            result.imported.assignments++;
          }
          result.success = true;
          console.log("=== VALIDIERTER IMPORT ERFOLGREICH ABGESCHLOSSEN ===");
          console.log("Import-Ergebnis:", result.imported);
          console.log(`Validierungsfehler: ${validationErrors.length}`);
        } catch (error) {
          result.errors.push(`Import-Fehler: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
          console.error("Validierter Import-Fehler:", error);
        }
        return result;
      }
    };
  }
});

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";
import { createHash } from "crypto";
import multer from "multer";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  assignments: () => assignments,
  assignmentsRelations: () => assignmentsRelations,
  classes: () => classes,
  classesRelations: () => classesRelations,
  insertAssignmentSchema: () => insertAssignmentSchema,
  insertClassSchema: () => insertClassSchema,
  insertInvitationSchema: () => insertInvitationSchema,
  insertPdfImportSchema: () => insertPdfImportSchema,
  insertPdfTableSchema: () => insertPdfTableSchema,
  insertPlanstelleSchema: () => insertPlanstelleSchema,
  insertPlanstellenScenarioSchema: () => insertPlanstellenScenarioSchema,
  insertSchoolYearSchema: () => insertSchoolYearSchema,
  insertStudentSchema: () => insertStudentSchema,
  insertSubjectMappingSchema: () => insertSubjectMappingSchema,
  insertSubjectSchema: () => insertSubjectSchema,
  insertTeacherSchema: () => insertTeacherSchema,
  insertUserSchema: () => insertUserSchema,
  invitations: () => invitations,
  invitationsRelations: () => invitationsRelations,
  pdfImports: () => pdfImports,
  pdfTables: () => pdfTables,
  planstellen: () => planstellen,
  planstellenInputSchema: () => planstellenInputSchema,
  planstellenRelations: () => planstellenRelations,
  planstellenScenarios: () => planstellenScenarios,
  planstellenScenariosRelations: () => planstellenScenariosRelations,
  schoolYears: () => schoolYears,
  schoolYearsRelations: () => schoolYearsRelations,
  sessions: () => sessions,
  students: () => students,
  studentsRelations: () => studentsRelations,
  subjectMappings: () => subjectMappings,
  subjectMappingsRelations: () => subjectMappingsRelations,
  subjects: () => subjects,
  subjectsRelations: () => subjectsRelations,
  teachers: () => teachers,
  teachersRelations: () => teachersRelations,
  users: () => users,
  usersRelations: () => usersRelations
});
import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, json, date, unique, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var schoolYears = pgTable("school_years", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  // "2024/25", "2025/26", etc.
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow()
});
var teachers = pgTable("teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  shortName: varchar("short_name", { length: 20 }).notNull().unique(),
  personnelNumber: varchar("personnel_number", { length: 20 }),
  email: text("email"),
  dateOfBirth: date("date_of_birth"),
  subjects: json("subjects").$type().notNull().default([]),
  maxHours: decimal("max_hours", { precision: 4, scale: 1 }).notNull().default("25.0"),
  currentHours: decimal("current_hours", { precision: 4, scale: 1 }).notNull().default("0.0"),
  qualifications: json("qualifications").$type().notNull().default([]),
  reductionHours: json("reduction_hours").$type().notNull().default({}),
  notes: text("notes").default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow()
});
var students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  classId: varchar("class_id").references(() => classes.id, { onDelete: "set null" }),
  grade: integer("grade").notNull(),
  schoolYearId: varchar("school_year_id").references(() => schoolYears.id, { onDelete: "restrict" }),
  // nullable for backward compatibility
  createdAt: timestamp("created_at").defaultNow()
});
var classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull(),
  grade: integer("grade").notNull(),
  studentCount: integer("student_count").notNull().default(0),
  subjectHours: json("subject_hours").$type().notNull().default({}),
  targetHoursTotal: decimal("target_hours_total", { precision: 4, scale: 1 }),
  targetHoursSemester1: decimal("target_hours_semester1", { precision: 4, scale: 1 }),
  targetHoursSemester2: decimal("target_hours_semester2", { precision: 4, scale: 1 }),
  classTeacher1Id: varchar("class_teacher_1_id").references(() => teachers.id, { onDelete: "set null" }),
  classTeacher2Id: varchar("class_teacher_2_id").references(() => teachers.id, { onDelete: "set null" }),
  schoolYearId: varchar("school_year_id").references(() => schoolYears.id, { onDelete: "restrict" }),
  // nullable for backward compatibility
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  uniqueClassPerYear: unique("unique_class_per_year").on(table.name, table.schoolYearId)
}));
var subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  shortName: varchar("short_name", { length: 50 }).notNull().unique(),
  category: text("category").notNull(),
  hoursPerWeek: json("hours_per_week").$type().notNull().default({}),
  parallelGroup: varchar("parallel_group", { length: 50 }),
  // Parallele Fächergruppe (optional)
  createdAt: timestamp("created_at").defaultNow()
});
var assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").references(() => teachers.id, { onDelete: "cascade" }).notNull(),
  classId: varchar("class_id").references(() => classes.id, { onDelete: "cascade" }).notNull(),
  subjectId: varchar("subject_id").references(() => subjects.id, { onDelete: "cascade" }).notNull(),
  hoursPerWeek: decimal("hours_per_week", { precision: 3, scale: 1 }).notNull(),
  semester: varchar("semester", { length: 2 }).notNull().default("1"),
  // "1" for 1st semester, "2" for 2nd semester
  isOptimized: boolean("is_optimized").notNull().default(false),
  teamTeachingId: varchar("team_teaching_id"),
  // Groups assignments that are team-taught together
  schoolYearId: varchar("school_year_id").references(() => schoolYears.id, { onDelete: "restrict" }),
  // nullable for backward compatibility
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  teamTeachingIndex: index("team_teaching_idx").on(table.teamTeachingId),
  teacherYearIndex: index("idx_assignments_teacher_year").on(table.teacherId, table.schoolYearId),
  classYearIndex: index("idx_assignments_class_year").on(table.classId, table.schoolYearId),
  schoolYearIndex: index("idx_assignments_year").on(table.schoolYearId)
}));
var planstellenScenarios = pgTable("planstellen_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  schoolYear: text("school_year").notNull(),
  parameters: json("parameters").$type().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow()
});
var planstellen = pgTable("planstellen", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenarioId: varchar("scenario_id").references(() => planstellenScenarios.id),
  subjectId: varchar("subject_id").references(() => subjects.id),
  // nullable for totals
  grade: integer("grade"),
  // nullable for summaries
  category: text("category").notNull(),
  // grundbedarf, foerder, ergaenzung, ag, summe, etc.
  component: text("component").notNull(),
  // descriptive label
  lineType: text("line_type").notNull(),
  // requirement, capacity, summary
  formula: json("formula").$type().notNull().default({}),
  color: text("color"),
  // for UI color coding
  requiredHours: decimal("required_hours", { precision: 4, scale: 1 }).notNull(),
  availableHours: decimal("available_hours", { precision: 4, scale: 1 }).notNull(),
  deficit: decimal("deficit", { precision: 4, scale: 1 }).notNull().default("0"),
  calculatedAt: timestamp("calculated_at").defaultNow()
});
var subjectMappings = pgTable("subject_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pdfSubjectName: text("pdf_subject_name").notNull(),
  // Original name from PDF (e.g., "Deutsch Förder 1. Hj.")
  normalizedName: text("normalized_name").notNull(),
  // Normalized version for matching (e.g., "deutsch förder")
  systemSubjectId: varchar("system_subject_id").references(() => subjects.id, { onDelete: "cascade" }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull().default("1.0"),
  // 0.0 to 1.0 confidence score
  usedCount: integer("used_count").notNull().default(0),
  // How often this mapping was applied
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at")
}, (table) => ({
  // Index for fast lookups during import
  normalizedNameIdx: index("idx_subject_mappings_normalized").on(table.normalizedName)
}));
var pdfImports = pgTable("pdf_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileHash: varchar("file_hash").unique(),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  pageCount: integer("page_count").notNull().default(0),
  metadata: json("metadata").$type().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow()
});
var pdfTables = pgTable("pdf_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importId: varchar("import_id").references(() => pdfImports.id, { onDelete: "cascade" }).notNull(),
  page: integer("page").notNull(),
  tableIndex: integer("table_index").notNull(),
  headers: json("headers").$type().notNull().default([]),
  rows: json("rows").$type().notNull().default([]),
  rawText: text("raw_text"),
  extractedAt: timestamp("extracted_at").defaultNow()
}, (table) => ({
  importPageIdx: index("idx_pdf_tables_import_page").on(table.importId, table.page)
}));
var sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull()
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"),
  // user, admin
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  token: varchar("token").notNull().unique(),
  // for invitation link
  role: varchar("role").notNull().default("user"),
  // user, admin
  createdBy: varchar("created_by").references(() => users.id),
  used: boolean("used").default(false),
  usedBy: varchar("used_by").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  usedAt: timestamp("used_at")
});
var schoolYearsRelations = relations(schoolYears, ({ many }) => ({
  students: many(students),
  classes: many(classes),
  assignments: many(assignments)
}));
var teachersRelations = relations(teachers, ({ many }) => ({
  assignments: many(assignments),
  classesAsTeacher1: many(classes, { relationName: "classTeacher1" }),
  classesAsTeacher2: many(classes, { relationName: "classTeacher2" })
}));
var studentsRelations = relations(students, ({ one }) => ({
  class: one(classes, {
    fields: [students.classId],
    references: [classes.id]
  }),
  schoolYear: one(schoolYears, {
    fields: [students.schoolYearId],
    references: [schoolYears.id]
  })
}));
var classesRelations = relations(classes, ({ many, one }) => ({
  students: many(students),
  assignments: many(assignments),
  classTeacher1: one(teachers, {
    fields: [classes.classTeacher1Id],
    references: [teachers.id],
    relationName: "classTeacher1"
  }),
  classTeacher2: one(teachers, {
    fields: [classes.classTeacher2Id],
    references: [teachers.id],
    relationName: "classTeacher2"
  }),
  schoolYear: one(schoolYears, {
    fields: [classes.schoolYearId],
    references: [schoolYears.id]
  })
}));
var planstellenScenariosRelations = relations(planstellenScenarios, ({ many }) => ({
  planstellen: many(planstellen)
}));
var subjectsRelations = relations(subjects, ({ many }) => ({
  assignments: many(assignments),
  planstellen: many(planstellen),
  subjectMappings: many(subjectMappings)
}));
var subjectMappingsRelations = relations(subjectMappings, ({ one }) => ({
  systemSubject: one(subjects, {
    fields: [subjectMappings.systemSubjectId],
    references: [subjects.id]
  })
}));
var assignmentsRelations = relations(assignments, ({ one }) => ({
  teacher: one(teachers, {
    fields: [assignments.teacherId],
    references: [teachers.id]
  }),
  class: one(classes, {
    fields: [assignments.classId],
    references: [classes.id]
  }),
  subject: one(subjects, {
    fields: [assignments.subjectId],
    references: [subjects.id]
  }),
  schoolYear: one(schoolYears, {
    fields: [assignments.schoolYearId],
    references: [schoolYears.id]
  })
}));
var planstellenRelations = relations(planstellen, ({ one }) => ({
  scenario: one(planstellenScenarios, {
    fields: [planstellen.scenarioId],
    references: [planstellenScenarios.id]
  }),
  subject: one(subjects, {
    fields: [planstellen.subjectId],
    references: [subjects.id]
  })
}));
var usersRelations = relations(users, ({ many }) => ({
  invitationsCreated: many(invitations, { relationName: "createdBy" }),
  invitationsUsed: many(invitations, { relationName: "usedBy" })
}));
var invitationsRelations = relations(invitations, ({ one }) => ({
  createdBy: one(users, {
    fields: [invitations.createdBy],
    references: [users.id],
    relationName: "createdBy"
  }),
  usedBy: one(users, {
    fields: [invitations.usedBy],
    references: [users.id],
    relationName: "usedBy"
  })
}));
var insertSchoolYearSchema = createInsertSchema(schoolYears).omit({
  id: true,
  createdAt: true
}).extend({
  name: z.string().min(1, "Schuljahr-Name ist erforderlich").max(20, "Name zu lang"),
  startDate: z.string().refine((val) => {
    const date2 = new Date(val);
    return !isNaN(date2.getTime());
  }, { message: "G\xFCltiges Startdatum erforderlich" }),
  endDate: z.string().refine((val) => {
    const date2 = new Date(val);
    return !isNaN(date2.getTime());
  }, { message: "G\xFCltiges Enddatum erforderlich" }),
  isCurrent: z.boolean().optional()
});
var insertTeacherSchema = createInsertSchema(teachers).omit({
  id: true,
  createdAt: true
});
var insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true
}).extend({
  schoolYearId: z.string().uuid().nullable().optional()
});
var insertClassSchema = createInsertSchema(classes).omit({
  id: true,
  createdAt: true
}).extend({
  classTeacher1Id: z.string().uuid().nullable().optional(),
  classTeacher2Id: z.string().uuid().nullable().optional(),
  schoolYearId: z.string().uuid().nullable().optional(),
  targetHoursSemester1: z.string().nullable().optional().refine((val) => {
    if (val === null || val === void 0 || val === "") return true;
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 50;
  }, { message: "Soll-Stunden 1.HJ m\xFCssen zwischen 0 und 50 liegen" }),
  targetHoursSemester2: z.string().nullable().optional().refine((val) => {
    if (val === null || val === void 0 || val === "") return true;
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 50;
  }, { message: "Soll-Stunden 2.HJ m\xFCssen zwischen 0 und 50 liegen" }),
  targetHoursTotal: z.string().nullable().optional().refine((val) => {
    if (val === null || val === void 0 || val === "") return true;
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 100;
  }, { message: "Gesamtstunden m\xFCssen zwischen 0 und 100 liegen" }),
  grade: z.number().int().min(5).max(10),
  studentCount: z.number().int().min(0).max(35)
});
var insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true,
  createdAt: true
});
var insertAssignmentSchema = createInsertSchema(assignments).omit({
  id: true,
  createdAt: true
}).extend({
  semester: z.enum(["1", "2"], { invalid_type_error: "Semester muss '1' oder '2' sein" }),
  hoursPerWeek: z.number().min(0.5, "Mindestens 0,5 Stunden pro Woche").max(10, "Maximal 10 Stunden pro Woche").transform((num) => num.toString()),
  schoolYearId: z.string().uuid().nullable().optional(),
  teamTeachingId: z.string().uuid().nullable().optional()
});
var insertPlanstellenScenarioSchema = createInsertSchema(planstellenScenarios).omit({
  id: true,
  createdAt: true
});
var insertPlanstelleSchema = createInsertSchema(planstellen).omit({
  id: true,
  calculatedAt: true
});
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  email: z.string().email("G\xFCltige E-Mail-Adresse erforderlich").optional(),
  role: z.enum(["user", "admin"], { invalid_type_error: "Rolle muss 'user' oder 'admin' sein" }).optional()
});
var insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  token: true,
  used: true,
  usedBy: true,
  usedAt: true,
  createdAt: true
}).extend({
  email: z.string().email("G\xFCltige E-Mail-Adresse erforderlich"),
  role: z.enum(["user", "admin"], { invalid_type_error: "Rolle muss 'user' oder 'admin' sein" }),
  createdBy: z.string().refine((val) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) || /^[0-9]+$/.test(val);
  }, { message: "Ung\xFCltige Benutzer-ID (muss UUID oder numerische ID sein)" }),
  expiresAt: z.date().refine((date2) => date2 > /* @__PURE__ */ new Date(), {
    message: "Ablaufdatum muss in der Zukunft liegen"
  })
});
var insertSubjectMappingSchema = createInsertSchema(subjectMappings).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true
}).extend({
  pdfSubjectName: z.string().min(1, "PDF-Fachname ist erforderlich"),
  normalizedName: z.string().min(1, "Normalisierter Name ist erforderlich"),
  systemSubjectId: z.string().uuid("G\xFCltige System-Fach-ID erforderlich"),
  confidence: z.number().min(0).max(1).optional().transform((num) => num !== void 0 ? num.toString() : void 0),
  usedCount: z.number().int().min(0).optional()
});
var insertPdfImportSchema = createInsertSchema(pdfImports).omit({
  id: true,
  createdAt: true
});
var insertPdfTableSchema = createInsertSchema(pdfTables).omit({
  id: true,
  extractedAt: true
}).extend({
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional()
});
var planstellenInputSchema = z.object({
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
  // === AUSGLEICHSBEDARF - Aus Excel-Struktur F12-F26 ===
  // F12-F26: Ausgleichsbedarf (alle Eingabefelder)
  fachleiter: z.number().optional().default(0.21),
  personalrat: z.number().optional().default(1.64),
  schulleitungsentlastungFortbildung: z.number().optional().default(0.04),
  ausbauLeitungszeit: z.number().optional().default(0.15),
  rueckgabeVorgriffstunde: z.number().optional().default(0.04),
  digitalisierungsbeauftragter: z.number().optional().default(0.04),
  fortbildungQualifMedienDS: z.number().optional().default(0.07),
  fachberaterSchulaufsicht: z.number().optional().default(0.07),
  wechselndeAusgleichsbedarfe: z.number().optional().default(0.5),
  praxissemesterInSchule: z.number().optional().default(0.29),
  zusaetzlicheAusfallvertretung: z.number().optional().default(0.25),
  entlastungLehrertaetigkeit: z.number().optional().default(0.04),
  entlastungLVOCO: z.number().optional().default(0.04),
  ermaessigungenweitere: z.number().optional().default(0.3),
  nullWert: z.number().optional().default(0),
  // === WEITERE BEREICHE AUS EXCEL-STRUKTUR ===
  // F30-F32: Weitere Bereiche
  praktischePhilosophieIslamkunde: z.number().optional().default(0),
  paedagogischeUebermittagsbetreuung: z.number().optional().default(0),
  integrationDurchBildung: z.number().optional().default(0),
  // === FREIE EINGABEZEILEN (vom User angefordert) ===
  freieZeile1Label: z.string().optional().default(""),
  freieZeile1Wert: z.number().optional().default(0),
  freieZeile2Label: z.string().optional().default(""),
  freieZeile2Wert: z.number().optional().default(0),
  // === ZUSÄTZLICHE STELLEN (F35-F36) ===
  gegenUAusfallIndFoerderung: z.number().optional().default(0.77),
  // === STELLENBESETZUNG (F38-F41) ===  
  teilzeitBlockmodellAnsparphase: z.number().optional().default(0.36),
  kapitalisierungPaedUebermittag: z.number().optional().default(0.56),
  abzugKapitalisierungUebermittag: z.number().optional().default(-0.56),
  // === PERSONALAUSSTATTUNG (F44-F46) ===
  beurlaubungElternzeit: z.number().optional().default(0),
  ersatzeinstellungElternzeit: z.number().optional().default(0),
  aborungZugangAnderes: z.number().optional().default(0),
  // === BERECHNUNG ERMÄSSIGUNGSSTUNDEN (F53-F54) ===
  grundstellenbedarfFaktor: z.number().optional().default(0.5),
  // für F53: F10*0.5
  // === VORHANDENE PLANSTELLEN (ISTBESTAND) ===
  // F50: Vorhandene Planstellen (Istbestand) = Lehrerplanstellen!F57
  vorhandenePlanstellen: z.number().optional().default(0),
  // === BERECHNUNG SCHULLEITERPAUSCHAL ===
  // F56: Grundpauschal
  grundpauschal: z.number().optional().default(9),
  // F57: Schulleiterentlastung Fortbildung  
  schulleiterentlastungFortbildung: z.number().optional().default(0.04),
  // F58: Ausbau Leitungszeit
  ausbauLeitungszeitSchulleiter: z.number().optional().default(0.12),
  // F61: Schulleiter 3/5 (aufgerundet)
  schulleiterDreiViertel: z.number().optional().default(18),
  // F63: Stellvertreter 2/5 (abgerundet) - wird berechnet
  // F64: Ausbau Leitungszeit 
  ausbauLeitungszeitStellvertreter: z.number().optional().default(0.11),
  // F65: minus Entl. (Stundenplanarbeit) aus Schuleitungspauschale
  minusEntlastungStundenplanarbeit: z.number().optional().default(0),
  // === KLASSENBILDUNG ===
  // F70: Istklassenzahl
  istklassenzahl: z.number().optional().default(17),
  // === STATISTIK UNTERRICHTSSTUNDEN ===
  // F73: zur Verfügung stehende Unterrichtsstunden = Lehrerplanstellen!Q57
  verfuegbareUnterrichtsstunden: z.number().optional().default(0),
  // F74: Unterrichtssoll (nach Kürzung) = Lehrerplanstellen!IST_UNTERRSTD  
  unterrichtssollNachKuerzung: z.number().optional().default(0)
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
neonConfig.fetchConnectionCache = true;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, sql as sql2, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
var DatabaseStorage = class {
  // School Years
  async getSchoolYears() {
    return await db.select().from(schoolYears).orderBy(desc(schoolYears.startDate));
  }
  async getSchoolYear(id) {
    const [schoolYear] = await db.select().from(schoolYears).where(eq(schoolYears.id, id));
    return schoolYear || void 0;
  }
  async getCurrentSchoolYear() {
    const [currentSchoolYear] = await db.select().from(schoolYears).where(eq(schoolYears.isCurrent, true));
    return currentSchoolYear || void 0;
  }
  async createSchoolYear(schoolYear) {
    const [newSchoolYear] = await db.insert(schoolYears).values(schoolYear).returning();
    return newSchoolYear;
  }
  async updateSchoolYear(id, schoolYear) {
    const [updatedSchoolYear] = await db.update(schoolYears).set(schoolYear).where(eq(schoolYears.id, id)).returning();
    return updatedSchoolYear;
  }
  async deleteSchoolYear(id) {
    try {
      const [studentCount] = await db.select({ count: sql2`count(*)` }).from(students).where(eq(students.schoolYearId, id));
      const [classCount] = await db.select({ count: sql2`count(*)` }).from(classes).where(eq(classes.schoolYearId, id));
      const [assignmentCount] = await db.select({ count: sql2`count(*)` }).from(assignments).where(eq(assignments.schoolYearId, id));
      if (studentCount.count > 0 || classCount.count > 0 || assignmentCount.count > 0) {
        const dependencies = [];
        if (studentCount.count > 0) dependencies.push(`${studentCount.count} Sch\xFCler`);
        if (classCount.count > 0) dependencies.push(`${classCount.count} Klassen`);
        if (assignmentCount.count > 0) dependencies.push(`${assignmentCount.count} Zuweisungen`);
        throw new Error(
          `Das Schuljahr kann nicht gel\xF6scht werden, da es noch folgende Daten enth\xE4lt: ${dependencies.join(", ")}. Bitte l\xF6schen Sie zuerst alle abh\xE4ngigen Daten oder verwenden Sie den Schuljahreswechsel.`
        );
      }
      await db.delete(schoolYears).where(eq(schoolYears.id, id));
    } catch (error) {
      if (error.code === "23503") {
        throw new Error(
          `Das Schuljahr kann nicht gel\xF6scht werden, da es noch von anderen Daten referenziert wird. Bitte l\xF6schen Sie zuerst alle abh\xE4ngigen Daten.`
        );
      }
      throw error;
    }
  }
  async setCurrentSchoolYear(id) {
    const result = await db.transaction(async (tx) => {
      await tx.update(schoolYears).set({ isCurrent: false });
      const [updatedSchoolYear] = await tx.update(schoolYears).set({ isCurrent: true }).where(eq(schoolYears.id, id)).returning();
      if (!updatedSchoolYear) {
        throw new Error(`Schuljahr mit ID ${id} nicht gefunden`);
      }
      return updatedSchoolYear;
    });
    return result;
  }
  // Teachers
  async getTeachers() {
    return await db.select().from(teachers).orderBy(teachers.lastName);
  }
  async getTeacher(id) {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher || void 0;
  }
  async createTeacher(teacher) {
    const [newTeacher] = await db.insert(teachers).values({
      ...teacher,
      subjects: teacher.subjects,
      qualifications: teacher.qualifications,
      reductionHours: teacher.reductionHours || {}
    }).returning();
    return newTeacher;
  }
  async updateTeacher(id, teacher) {
    const updateData = { ...teacher };
    if (teacher.subjects) {
      updateData.subjects = teacher.subjects;
    }
    if (teacher.qualifications) {
      updateData.qualifications = teacher.qualifications;
    }
    if (teacher.reductionHours) {
      updateData.reductionHours = teacher.reductionHours;
    }
    const [updatedTeacher] = await db.update(teachers).set(updateData).where(eq(teachers.id, id)).returning();
    return updatedTeacher;
  }
  async deleteTeacher(id) {
    try {
      console.log("Storage: Starting teacher deletion for ID:", id);
      console.log("Storage: Deleting assignments...");
      const deleteAssignmentsResult = await db.delete(assignments).where(eq(assignments.teacherId, id));
      console.log("Storage: Deleted assignments:", deleteAssignmentsResult);
      console.log("Storage: Updating classes (removing as class teacher)...");
      const updateClasses1 = await db.update(classes).set({ classTeacher1Id: null }).where(eq(classes.classTeacher1Id, id));
      console.log("Storage: Updated classes (teacher1):", updateClasses1);
      const updateClasses2 = await db.update(classes).set({ classTeacher2Id: null }).where(eq(classes.classTeacher2Id, id));
      console.log("Storage: Updated classes (teacher2):", updateClasses2);
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
  async getStudents() {
    return await db.select().from(students).orderBy(students.lastName);
  }
  async getStudent(id) {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student || void 0;
  }
  async createStudent(student) {
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
  async updateStudent(id, student) {
    const [updatedStudent] = await db.update(students).set(student).where(eq(students.id, id)).returning();
    return updatedStudent;
  }
  async deleteStudent(id) {
    await db.delete(students).where(eq(students.id, id));
  }
  async getStudentsByClass(classId) {
    return await db.select().from(students).where(eq(students.classId, classId));
  }
  async getStudentsBySchoolYear(schoolYearId) {
    return await db.select().from(students).where(eq(students.schoolYearId, schoolYearId));
  }
  // Classes
  async getClasses() {
    return await db.select().from(classes).orderBy(classes.name);
  }
  async getClass(id) {
    const [classData] = await db.select().from(classes).where(eq(classes.id, id));
    return classData || void 0;
  }
  async createClass(classData) {
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
  async updateClass(id, classData) {
    const [updatedClass] = await db.update(classes).set(classData).where(eq(classes.id, id)).returning();
    return updatedClass;
  }
  async deleteClass(id) {
    await db.delete(classes).where(eq(classes.id, id));
  }
  async getClassByName(name) {
    const [classRecord] = await db.select().from(classes).where(eq(classes.name, name));
    return classRecord || void 0;
  }
  async getClassesBySchoolYear(schoolYearId) {
    return await db.select().from(classes).where(eq(classes.schoolYearId, schoolYearId));
  }
  // Subjects
  async getSubjects() {
    return await db.select().from(subjects).orderBy(subjects.name);
  }
  async getSubject(id) {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, id));
    return subject || void 0;
  }
  async createSubject(subject) {
    const [newSubject] = await db.insert(subjects).values(subject).returning();
    return newSubject;
  }
  async updateSubject(id, subject) {
    const [updatedSubject] = await db.update(subjects).set(subject).where(eq(subjects.id, id)).returning();
    return updatedSubject;
  }
  async deleteSubject(id) {
    const subjectToDelete = await this.getSubject(id);
    if (!subjectToDelete) {
      throw new Error("Subject not found");
    }
    const allTeachers = await db.select().from(teachers);
    for (const teacher of allTeachers) {
      const updatedSubjects = teacher.subjects.filter(
        (subjectRef) => subjectRef !== id && subjectRef !== subjectToDelete.shortName && subjectRef !== subjectToDelete.name
      );
      if (updatedSubjects.length !== teacher.subjects.length) {
        await db.update(teachers).set({ subjects: updatedSubjects }).where(eq(teachers.id, teacher.id));
      }
    }
    const allClasses = await db.select().from(classes);
    for (const classRecord of allClasses) {
      const subjectHours = { ...classRecord.subjectHours };
      let hasChanges = false;
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
      if (hasChanges) {
        await db.update(classes).set({ subjectHours }).where(eq(classes.id, classRecord.id));
      }
    }
    await db.delete(subjects).where(eq(subjects.id, id));
  }
  async cleanupOrphanedSubjectReferences() {
    const allSubjects = await this.getSubjects();
    const validSubjectRefs = /* @__PURE__ */ new Set([
      ...allSubjects.map((s) => s.id),
      ...allSubjects.map((s) => s.shortName),
      ...allSubjects.map((s) => s.name)
    ]);
    const allTeachers = await db.select().from(teachers);
    for (const teacher of allTeachers) {
      const cleanedSubjects = teacher.subjects.filter(
        (subjectRef) => validSubjectRefs.has(subjectRef)
      );
      if (cleanedSubjects.length !== teacher.subjects.length) {
        await db.update(teachers).set({ subjects: cleanedSubjects }).where(eq(teachers.id, teacher.id));
      }
    }
    const allClasses = await db.select().from(classes);
    for (const classRecord of allClasses) {
      const subjectHours = { ...classRecord.subjectHours };
      let hasChanges = false;
      for (const key in subjectHours) {
        if (!validSubjectRefs.has(key)) {
          delete subjectHours[key];
          hasChanges = true;
        }
      }
      if (hasChanges) {
        await db.update(classes).set({ subjectHours }).where(eq(classes.id, classRecord.id));
      }
    }
  }
  // Assignments - Optimized with JOIN to avoid N+1 problem
  async getAssignments() {
    return await db.select().from(assignments).orderBy(desc(assignments.createdAt));
  }
  // Optimized method with pre-loaded related data for frontend performance
  async getAssignmentsWithRelations() {
    const result = await db.select({
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
      subjectCategory: subjects.category
    }).from(assignments).leftJoin(teachers, eq(assignments.teacherId, teachers.id)).leftJoin(classes, eq(assignments.classId, classes.id)).leftJoin(subjects, eq(assignments.subjectId, subjects.id)).orderBy(desc(assignments.createdAt));
    return result.map((row) => ({
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
        firstName: row.teacherFirstName,
        lastName: row.teacherLastName
      } : null,
      _class: row.className ? {
        name: row.className,
        grade: row.classGrade
      } : null,
      _subject: row.subjectName ? {
        name: row.subjectName,
        shortName: row.subjectShortName,
        category: row.subjectCategory
      } : null
    }));
  }
  async getAssignment(id) {
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id));
    return assignment || void 0;
  }
  async createAssignment(assignment) {
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
  async updateAssignment(id, assignment) {
    const [updatedAssignment] = await db.update(assignments).set(assignment).where(eq(assignments.id, id)).returning();
    return updatedAssignment;
  }
  async deleteAssignment(id) {
    await db.delete(assignments).where(eq(assignments.id, id));
  }
  async getAssignmentsByTeacher(teacherId) {
    return await db.select().from(assignments).where(eq(assignments.teacherId, teacherId));
  }
  async getAssignmentsByClass(classId) {
    return await db.select().from(assignments).where(eq(assignments.classId, classId));
  }
  async getAssignmentsBySchoolYear(schoolYearId) {
    return await db.select().from(assignments).where(eq(assignments.schoolYearId, schoolYearId));
  }
  // Team Teaching Operations - Optimized with bulk operations
  async createTeamTeaching(baseAssignmentId, teacherIds) {
    return await db.transaction(async (tx) => {
      const [baseAssignment] = await tx.select().from(assignments).where(eq(assignments.id, baseAssignmentId));
      if (!baseAssignment) {
        throw new Error("Base assignment not found");
      }
      const teamTeachingId = baseAssignment.teamTeachingId || randomUUID();
      if (!baseAssignment.teamTeachingId) {
        await tx.update(assignments).set({ teamTeachingId }).where(eq(assignments.id, baseAssignmentId));
      }
      const existingAssignments = await tx.select().from(assignments).where(eq(assignments.teamTeachingId, teamTeachingId));
      const existingTeacherIds = new Set(existingAssignments.map((a) => a.teacherId));
      const newTeacherIds = teacherIds.filter((teacherId) => !existingTeacherIds.has(teacherId));
      if (newTeacherIds.length > 0) {
        const newAssignments = newTeacherIds.map((teacherId) => ({
          teacherId,
          classId: baseAssignment.classId,
          subjectId: baseAssignment.subjectId,
          hoursPerWeek: baseAssignment.hoursPerWeek,
          semester: baseAssignment.semester,
          isOptimized: false,
          teamTeachingId,
          schoolYearId: baseAssignment.schoolYearId
        }));
        await tx.insert(assignments).values(newAssignments);
      }
      return await tx.select().from(assignments).where(eq(assignments.teamTeachingId, teamTeachingId)).orderBy(assignments.createdAt);
    });
  }
  async getTeamTeachingGroup(teamTeachingId) {
    return await db.select().from(assignments).where(eq(assignments.teamTeachingId, teamTeachingId)).orderBy(assignments.createdAt);
  }
  async removeFromTeamTeaching(assignmentId) {
    const assignment = await this.getAssignment(assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    if (!assignment.teamTeachingId) {
      throw new Error("Assignment is not part of a team teaching group");
    }
    const teamAssignments = await this.getTeamTeachingGroup(assignment.teamTeachingId);
    if (teamAssignments.length <= 2) {
      for (const teamAssignment of teamAssignments) {
        await this.updateAssignment(teamAssignment.id, { teamTeachingId: null });
      }
    } else {
      await this.updateAssignment(assignmentId, { teamTeachingId: null });
    }
    return await this.getAssignment(assignmentId);
  }
  async validateTeamTeachingGroup(teamTeachingId) {
    const assignments2 = await this.getTeamTeachingGroup(teamTeachingId);
    const errors = [];
    if (assignments2.length < 2) {
      errors.push("Team teaching group must have at least 2 teachers");
    }
    if (assignments2.length > 0) {
      const firstAssignment = assignments2[0];
      for (const assignment of assignments2.slice(1)) {
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
      const teacherIds = assignments2.map((a) => a.teacherId);
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
  async getPlanstellen() {
    return await db.select().from(planstellen).orderBy(desc(planstellen.calculatedAt));
  }
  async getPlanstelle(id) {
    const [planstelle] = await db.select().from(planstellen).where(eq(planstellen.id, id));
    return planstelle || void 0;
  }
  async createPlanstelle(planstelle) {
    const [newPlanstelle] = await db.insert(planstellen).values(planstelle).returning();
    return newPlanstelle;
  }
  async updatePlanstelle(id, planstelle) {
    const [updatedPlanstelle] = await db.update(planstellen).set(planstelle).where(eq(planstellen.id, id)).returning();
    return updatedPlanstelle;
  }
  async deletePlanstelle(id) {
    await db.delete(planstellen).where(eq(planstellen.id, id));
  }
  async calculatePlanstellenFromInput(input) {
    const results = [];
    const berechneteWerte = {
      // F5: =F3/F4 - Quotient (35.16592372)
      quotient: input.schuelerzahlStand / input.schuelerLehrerrelation,
      // F6: =TRUNC(F5,2) - Quotient abgeschnitten (35.16)
      quotientAbgeschnitten: Math.trunc(input.schuelerzahlStand / input.schuelerLehrerrelation * 100) / 100,
      // F7: =IF(F5-INT(F5)<0.5,INT(F5),INT(F5)+0.5) - Abgerundet (35)
      abgerundet: (() => {
        const quotient = input.schuelerzahlStand / input.schuelerLehrerrelation;
        const intPart = Math.floor(quotient);
        return quotient - intPart < 0.5 ? intPart : intPart + 0.5;
      })(),
      // F10: =SUM(F6,F8:F9) - Summe Grundbedarf
      summeGrundbedarf: (() => {
        const quotientAbgeschnitten = Math.trunc(input.schuelerzahlStand / input.schuelerLehrerrelation * 100) / 100;
        return quotientAbgeschnitten + input.abzugLehramtsanwaerter + input.rundung;
      })(),
      // F27: =SUM(F12:F25) - Summe Ausgleichsbedarf
      summeAusgleichsbedarf: input.fachleiter + input.personalrat + input.schulleitungsentlastungFortbildung + input.ausbauLeitungszeit + input.rueckgabeVorgriffstunde + input.digitalisierungsbeauftragter + input.fortbildungQualifMedienDS + input.fachberaterSchulaufsicht + input.wechselndeAusgleichsbedarfe + input.praxissemesterInSchule + input.zusaetzlicheAusfallvertretung + input.entlastungLehrertaetigkeit + input.entlastungLVOCO + input.ermaessigungenweitere,
      // =SUMME weitere Bereiche - Weitere Planstellen
      weitereBereiche: input.bestellungsverfahren + input.praktischePaedagogikLehrkraefte + input.praxissemesterdurchfuehrung + input.entlassungenGradVerkuerzung + input.stellenreserveLehrerinnen,
      // Gesamtsumme aller Planstellen
      gesamtPlanstellen: 0
      // wird unten berechnet
    };
    const eingabeFelder = [
      // 1. GRUNDSTELLEN (F3-F10, echte Excel-Bezeichnungen)
      { name: "Sch\xFClerzahl Stand 31.08.24", value: input.schuelerzahlStand, category: "grundstellen" },
      { name: "Sch\xFCler/Lehrerrelation an der Realschule: (ab 06/18)", value: input.schuelerLehrerrelation, category: "grundstellen" },
      { name: "bedarfsdeckender Unterricht - Abzug Lehramtsanw\xE4rter", value: input.abzugLehramtsanwaerter, category: "grundstellen" },
      { name: "Rundung", value: input.rundung, category: "grundstellen" },
      // AUSGLEICHSBEDARF (F12-F26, echte Excel-Bezeichnungen)
      { name: "Fachleiter", value: input.fachleiter, category: "ausgleichsbedarf" },
      { name: "Personalrat", value: input.personalrat, category: "ausgleichsbedarf" },
      { name: "Schulleitungsentlastung - Fortbildung", value: input.schulleitungsentlastungFortbildung, category: "ausgleichsbedarf" },
      { name: "Ausbau Leitungszeit", value: input.ausbauLeitungszeit, category: "ausgleichsbedarf" },
      { name: "R\xFCckgabe Vorgriffstunde", value: input.rueckgabeVorgriffstunde, category: "ausgleichsbedarf" },
      { name: "Digitalisierungsbeauftragter", value: input.digitalisierungsbeauftragter, category: "ausgleichsbedarf" },
      { name: "Fortb. und Qualif. / Medien und DS", value: input.fortbildungQualifMedienDS, category: "ausgleichsbedarf" },
      { name: "Fachberater Schulaufsicht", value: input.fachberaterSchulaufsicht, category: "ausgleichsbedarf" },
      { name: "Wechs. Merh - und Ausgleichsbedarfe", value: input.wechselndeAusgleichsbedarfe, category: "ausgleichsbedarf" },
      { name: "Praxissemester in Schule", value: input.praxissemesterInSchule, category: "ausgleichsbedarf" },
      { name: "Zus\xE4tzliche Ausfallvertretung", value: input.zusaetzlicheAusfallvertretung, category: "ausgleichsbedarf" },
      { name: "Entlastung Lehrert\xE4tigkeit", value: input.entlastungLehrertaetigkeit, category: "ausgleichsbedarf" },
      { name: "Entlastung LVO&CO", value: input.entlastungLVOCO, category: "ausgleichsbedarf" },
      { name: "Erm\xE4\xDFigungen weitere", value: input.ermaessigungenweitere, category: "ausgleichsbedarf" },
      { name: "0", value: input.nullWert, category: "ausgleichsbedarf" },
      // WEITERE BEREICHE (F30-F32, aus Excel-Struktur)
      { name: "Bestellungsverfahren", value: input.bestellungsverfahren, category: "weitere_bereiche" },
      { name: "Praktische P\xE4dagogik Lehrkr\xE4fte", value: input.praktischePaedagogikLehrkraefte, category: "weitere_bereiche" },
      { name: "Praxissemesterdurchf\xFChrung", value: input.praxissemesterdurchfuehrung, category: "weitere_bereiche" },
      // WEITERE ABSCHNITTE (F36, F38, etc.)
      { name: "Entlassungen/Grad. (Verk\xFCrzung)", value: input.entlassungenGradVerkuerzung, category: "weitere_abschnitte" },
      { name: "Stellenreserve LehrerInnen", value: input.stellenreserveLehrerinnen, category: "weitere_abschnitte" },
      // SONSTIGE FELDER
      { name: "Ausfeld Lehrkr\xE4fte", value: input.ausfeldLehrkraefte, category: "sonstige" },
      { name: "Inner-(d. Sonderreg/austech)", value: input.innerSonderregAustech, category: "sonstige" },
      { name: "Erg\xE4nzend \xFCber Aufbaum\xF6glichkeit", value: input.ergaenzendUeberAufbaumoeglichkeit, category: "sonstige" },
      { name: "Stellenreserve LehrerInnen(HS)", value: input.stellenreserveLehrerinnenHS, category: "sonstige" },
      { name: "Fertigkeitsfeld", value: input.fertigkeitsfeld, category: "sonstige" },
      { name: "Stundenreserve", value: input.stundenreserve, category: "sonstige" }
    ];
    for (const feld of eingabeFelder) {
      if (feld.value > 0) {
        const planstelle = {
          id: randomUUID(),
          scenarioId: null,
          subjectId: null,
          grade: null,
          category: feld.category,
          component: feld.name,
          lineType: "requirement",
          formula: {
            op: "direct",
            terms: [feld.value],
            description: `${feld.name}: Direkteingabe`
          },
          color: feld.category === "grundschuldaten" ? "yellow" : feld.category === "abzugsarten" ? "yellow" : feld.category === "lehramt" ? "purple" : "gray",
          requiredHours: feld.value.toString(),
          availableHours: "0",
          deficit: feld.value.toString(),
          calculatedAt: /* @__PURE__ */ new Date()
        };
        results.push(planstelle);
      }
    }
    berechneteWerte.gesamtPlanstellen = berechneteWerte.summeGrundbedarf + berechneteWerte.summeAusgleichsbedarf + berechneteWerte.weitereBereiche;
    const berechneteFelder = [
      {
        name: "Summe Grundbedarf",
        value: berechneteWerte.summeGrundbedarf,
        formula: "=SUM(F6,F8:F9)",
        color: "cyan"
      },
      {
        name: "Summe Ausgleichsbedarf",
        value: berechneteWerte.summeAusgleichsbedarf,
        formula: "=SUM(F12:F25)",
        color: "cyan"
      },
      {
        name: "Weitere Bereiche",
        value: berechneteWerte.weitereBereiche,
        formula: "=SUM(F30:F38)",
        color: "cyan"
      },
      {
        name: "Gesamtsumme Planstellen",
        value: berechneteWerte.gesamtPlanstellen,
        formula: "=SUM(F10,F27,weitere)",
        color: "green"
      }
    ];
    for (const feld of berechneteFelder) {
      const planstelle = {
        id: randomUUID(),
        scenarioId: null,
        subjectId: null,
        grade: null,
        category: "berechnet",
        component: feld.name,
        lineType: "calculated",
        formula: {
          op: "sum",
          terms: [],
          description: feld.formula
        },
        color: feld.color,
        requiredHours: feld.value.toString(),
        availableHours: "0",
        deficit: feld.value.toString(),
        calculatedAt: /* @__PURE__ */ new Date()
      };
      results.push(planstelle);
    }
    const gesamtStunden = berechneteWerte.gesamtPlanstellen;
    const benoetigtePlanstellen = input.deputat > 0 ? gesamtStunden / input.deputat : 0;
    const gesamtPlanstelle = {
      id: randomUUID(),
      scenarioId: null,
      subjectId: null,
      grade: null,
      category: "summe",
      component: "Gesamtbedarf Planstellen",
      lineType: "summary",
      formula: {
        op: "divide",
        terms: [gesamtStunden, input.deputat],
        description: `Gesamtstunden (${gesamtStunden}) \xF7 Deputat (${input.deputat})`
      },
      color: "blue",
      requiredHours: gesamtStunden.toString(),
      availableHours: benoetigtePlanstellen.toFixed(2),
      deficit: "0",
      calculatedAt: /* @__PURE__ */ new Date()
    };
    results.push(gesamtPlanstelle);
    return results;
  }
  // Analytics
  async getTeacherStats() {
    const [teacherCount] = await db.select({ count: sql2`count(*)` }).from(teachers);
    const [studentCount] = await db.select({ count: sql2`count(*)` }).from(students);
    const [hourStats] = await db.select({
      totalHours: sql2`sum(${teachers.currentHours})`,
      avgWorkload: sql2`avg(${teachers.currentHours}::float / ${teachers.maxHours}::float * 100)`
    }).from(teachers);
    return {
      totalTeachers: teacherCount.count,
      totalStudents: studentCount.count,
      totalHours: hourStats.totalHours || 0,
      averageWorkload: hourStats.avgWorkload || 0
    };
  }
  // Bulk operations for CSV import
  async bulkCreateTeachers(teacherList) {
    const teacherData = teacherList.map((teacher) => ({
      ...teacher,
      subjects: teacher.subjects,
      qualifications: teacher.qualifications,
      reductionHours: teacher.reductionHours || {}
    }));
    return await db.insert(teachers).values(teacherData).returning();
  }
  async bulkCreateStudents(studentList) {
    return await db.insert(students).values(studentList).returning();
  }
  async bulkCreateClasses(classList) {
    return await db.insert(classes).values(classList).returning();
  }
  async bulkCreateSubjects(subjectList) {
    return await db.insert(subjects).values(subjectList).returning();
  }
  async bulkCreateSubjectsWithConflictHandling(subjectList) {
    const results = [];
    for (const subjectData of subjectList) {
      try {
        const [subject] = await db.insert(subjects).values(subjectData).returning();
        results.push(subject);
      } catch (error) {
        if (error.code === "23505") {
          const [existingSubject] = await db.select().from(subjects).where(eq(subjects.shortName, subjectData.shortName));
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
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || void 0;
  }
  async upsertUser(userData) {
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: {
        ...userData,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return user;
  }
  // Invitation operations
  async createInvitation(invitationData) {
    const token = randomUUID();
    const invitation = {
      ...invitationData,
      token
    };
    const [newInvitation] = await db.insert(invitations).values(invitation).returning();
    return newInvitation;
  }
  async getInvitations() {
    return await db.select().from(invitations).orderBy(desc(invitations.createdAt));
  }
  async getInvitationByToken(token) {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
    return invitation || void 0;
  }
  async getInvitationByEmail(email) {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.email, email));
    return invitation || void 0;
  }
  async markInvitationUsed(id, usedBy) {
    await db.update(invitations).set({
      used: true,
      usedBy,
      usedAt: /* @__PURE__ */ new Date()
    }).where(eq(invitations.id, id));
  }
  async deleteInvitation(id) {
    await db.delete(invitations).where(eq(invitations.id, id));
  }
  // School Year Transition operations
  async validateSchoolYearTransition(fromSchoolYearId) {
    try {
      const currentSchoolYear = await this.getSchoolYear(fromSchoolYearId);
      if (!currentSchoolYear) {
        return {
          valid: false,
          errors: ["Aktuelles Schuljahr nicht gefunden"],
          warnings: [],
          statistics: { totalTeachers: 0, totalClasses: 0, totalAssignments: 0, incompleteClasses: 0 }
        };
      }
      const [allTeachers, currentClasses, currentAssignments] = await Promise.all([
        this.getTeachers(),
        this.getClassesBySchoolYear(fromSchoolYearId),
        this.getAssignmentsBySchoolYear(fromSchoolYearId)
      ]);
      const warnings = [];
      const errors = [];
      const incompleteClasses = currentClasses.filter(
        (c) => !c.classTeacher1Id || c.studentCount === 0
      );
      if (incompleteClasses.length > 0) {
        warnings.push(`${incompleteClasses.length} Klassen ohne Klassenlehrer oder ohne Sch\xFCler`);
      }
      const classesWithoutAssignments = currentClasses.filter(
        (c) => !currentAssignments.some((a) => a.classId === c.id)
      );
      if (classesWithoutAssignments.length > 0) {
        warnings.push(`${classesWithoutAssignments.length} Klassen ohne Zuweisungen`);
      }
      const overloadedTeachers = allTeachers.filter(
        (t) => parseFloat(t.currentHours) > parseFloat(t.maxHours)
      );
      if (overloadedTeachers.length > 0) {
        warnings.push(`${overloadedTeachers.length} Lehrer mit \xDCberbelastung`);
      }
      return {
        valid: errors.length === 0,
        warnings,
        errors,
        statistics: {
          totalTeachers: allTeachers.length,
          totalClasses: currentClasses.length,
          totalAssignments: currentAssignments.length,
          incompleteClasses: incompleteClasses.length
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
  async previewSchoolYearTransition(fromSchoolYearId, toSchoolYearName) {
    try {
      const [currentClasses, currentAssignments, allSubjects] = await Promise.all([
        this.getClassesBySchoolYear(fromSchoolYearId),
        this.getAssignmentsBySchoolYear(fromSchoolYearId),
        this.getSubjects()
      ]);
      const classTransitions = [];
      const assignmentMigrations = [];
      const newClasses = [
        { name: "5a", grade: 5, expectedStudentCount: 28 },
        { name: "5b", grade: 5, expectedStudentCount: 26 }
      ];
      let graduatedClasses = 0;
      let continuingClasses = 0;
      for (const currentClass of currentClasses) {
        if (currentClass.grade === 10) {
          classTransitions.push({
            from: currentClass,
            to: null,
            action: "graduate",
            studentCount: currentClass.studentCount
          });
          graduatedClasses++;
        } else {
          const newGrade = currentClass.grade + 1;
          const newName = currentClass.name.replace(currentClass.grade.toString(), newGrade.toString());
          classTransitions.push({
            from: currentClass,
            to: null,
            // Will be created during transition
            action: "migrate",
            studentCount: currentClass.studentCount,
            newGrade,
            newName
          });
          continuingClasses++;
        }
      }
      const autoMigratableSubjects = ["Deutsch", "Mathematik", "Englisch", "Sport", "KR", "ER", "PP"];
      let autoMigrations = 0;
      let manualChecks = 0;
      let nonMigratable = 0;
      for (const assignment of currentAssignments) {
        const subject = allSubjects.find((s) => s.id === assignment.subjectId);
        const currentClass = currentClasses.find((c) => c.id === assignment.classId);
        if (!subject || !currentClass) continue;
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
                semester: assignment.semester
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
          assignmentMigrations.push({
            assignment,
            status: "manual_check",
            reason: `${subject.name} hat komplexe \xDCbergangsregeln`,
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
      throw new Error("Fehler bei der Erstellung der \xDCbergangs-Vorschau");
    }
  }
  async executeSchoolYearTransition(fromSchoolYearId, toSchoolYearName, params) {
    return await db.transaction(async (tx) => {
      try {
        const errors = [];
        let migratedClasses = 0;
        let migratedAssignments = 0;
        let migratedStudents = 0;
        let createdNewClasses = 0;
        let graduatedClasses = 0;
        const existingToSchoolYear = await tx.select().from(schoolYears).where(eq(schoolYears.name, toSchoolYearName)).limit(1);
        if (existingToSchoolYear.length > 0) {
          throw new Error(`Schuljahr "${toSchoolYearName}" existiert bereits. \xDCbergang wurde m\xF6glicherweise bereits ausgef\xFChrt.`);
        }
        const [fromSchoolYear] = await tx.select().from(schoolYears).where(eq(schoolYears.id, fromSchoolYearId));
        if (!fromSchoolYear) {
          throw new Error(`Quell-Schuljahr mit ID ${fromSchoolYearId} nicht gefunden`);
        }
        const [newSchoolYear] = await tx.insert(schoolYears).values({
          name: toSchoolYearName,
          startDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0],
          isCurrent: false
        }).returning();
        const [currentClasses, currentAssignments, currentStudents, allSubjects] = await Promise.all([
          tx.select().from(classes).where(eq(classes.schoolYearId, fromSchoolYearId)),
          tx.select().from(assignments).where(eq(assignments.schoolYearId, fromSchoolYearId)),
          tx.select().from(students).where(eq(students.schoolYearId, fromSchoolYearId)),
          tx.select().from(subjects)
        ]);
        const newClassMap = /* @__PURE__ */ new Map();
        for (const currentClass of currentClasses) {
          if (currentClass.grade === 10) {
            const graduatingStudents = currentStudents.filter((s) => s.classId === currentClass.id);
            for (const student of graduatingStudents) {
              await tx.update(students).set({
                classId: null,
                // Remove from class (graduated)
                schoolYearId: newSchoolYear.id
                // But keep in new school year for record keeping
              }).where(eq(students.id, student.id));
              migratedStudents++;
            }
            graduatedClasses++;
          } else {
            const newGrade = currentClass.grade + 1;
            const newName = currentClass.name.replace(currentClass.grade.toString(), newGrade.toString());
            const [newClass] = await tx.insert(classes).values({
              name: newName,
              grade: newGrade,
              studentCount: currentClass.studentCount,
              subjectHours: {},
              // Will be populated by assignments
              classTeacher1Id: currentClass.classTeacher1Id,
              classTeacher2Id: currentClass.classTeacher2Id,
              schoolYearId: newSchoolYear.id
            }).returning();
            newClassMap.set(currentClass.id, newClass.id);
            migratedClasses++;
            const classStudents = currentStudents.filter((s) => s.classId === currentClass.id);
            for (const student of classStudents) {
              await tx.update(students).set({
                classId: newClass.id,
                grade: newGrade,
                schoolYearId: newSchoolYear.id
              }).where(eq(students.id, student.id));
              migratedStudents++;
            }
          }
        }
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
        if (params.migrationRules.autoMigrateContinuousSubjects) {
          const subjectMigrationRules = this.getNRWSubjectMigrationRules();
          for (const assignment of currentAssignments) {
            const subject = allSubjects.find((s) => s.id === assignment.subjectId);
            const currentClass = currentClasses.find((c) => c.id === assignment.classId);
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
                  semester: assignment.semester,
                  schoolYearId: newSchoolYear.id
                });
                migratedAssignments++;
              }
            }
          }
        }
        await tx.update(schoolYears).set({ isCurrent: false });
        await tx.update(schoolYears).set({ isCurrent: true }).where(eq(schoolYears.id, newSchoolYear.id));
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
      } catch (error) {
        console.error("Error executing school year transition:", error);
        throw error;
      }
    });
  }
  // NRW Realschule Subject Migration Rules
  getNRWSubjectMigrationRules() {
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
        canMigrateTo: [7, 8],
        // Pause in 9, resumes in 10
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
        canMigrateTo: [6],
        // 5→6 OK, then pause in 7, resumes in 8
        defaultHours: { 5: 2, 6: 2, 8: 1, 9: 2, 10: 2 },
        category: "interrupted",
        notes: "Pause in grade 7, reduced hours in grade 8"
      },
      "EK": {
        canMigrateTo: [],
        // 5→6 NOT possible (pause), resumes in 7
        defaultHours: { 5: 2, 7: 1, 8: 2, 9: 1, 10: 2 },
        category: "interrupted",
        notes: "Pause in grade 6, variable hours"
      },
      "KU": {
        canMigrateTo: [6, 7],
        // 5→6→7 OK, pause in 8, brief in 9, ends
        defaultHours: { 5: 2, 6: 2, 7: 1, 9: 1 },
        category: "interrupted",
        notes: "Pause in grade 8, ends after grade 9"
      },
      "MU": {
        canMigrateTo: [6],
        // Ends after grade 6 (except as differentiation)
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
  async getSubjectMappings() {
    return await db.select().from(subjectMappings).orderBy(desc(subjectMappings.usedCount));
  }
  async getSubjectMapping(id) {
    const [mapping] = await db.select().from(subjectMappings).where(eq(subjectMappings.id, id));
    return mapping || void 0;
  }
  async findSubjectMappingByName(normalizedName) {
    const [mapping] = await db.select().from(subjectMappings).where(eq(subjectMappings.normalizedName, normalizedName.toLowerCase()));
    return mapping || void 0;
  }
  async createSubjectMapping(mapping) {
    const [newMapping] = await db.insert(subjectMappings).values({
      ...mapping,
      normalizedName: mapping.normalizedName.toLowerCase()
    }).returning();
    return newMapping;
  }
  async updateSubjectMapping(id, mapping) {
    const updateData = { ...mapping };
    if (updateData.normalizedName) {
      updateData.normalizedName = updateData.normalizedName.toLowerCase();
    }
    const [updatedMapping] = await db.update(subjectMappings).set(updateData).where(eq(subjectMappings.id, id)).returning();
    return updatedMapping;
  }
  async deleteSubjectMapping(id) {
    await db.delete(subjectMappings).where(eq(subjectMappings.id, id));
  }
  async incrementMappingUsage(id) {
    await db.update(subjectMappings).set({
      usedCount: sql2`${subjectMappings.usedCount} + 1`,
      lastUsedAt: /* @__PURE__ */ new Date()
    }).where(eq(subjectMappings.id, id));
  }
  // PDF Imports and Tables
  async getPdfImports() {
    return await db.select().from(pdfImports).orderBy(desc(pdfImports.createdAt));
  }
  async getPdfImport(id) {
    const [pdfImport] = await db.select().from(pdfImports).where(eq(pdfImports.id, id));
    return pdfImport || void 0;
  }
  async createPdfImport(pdfImport) {
    const [created] = await db.insert(pdfImports).values(pdfImport).returning();
    return created;
  }
  async deletePdfImport(id) {
    await db.delete(pdfImports).where(eq(pdfImports.id, id));
  }
  async getPdfTables() {
    return await db.select().from(pdfTables).orderBy(desc(pdfTables.extractedAt));
  }
  async getPdfTable(id) {
    const [pdfTable] = await db.select().from(pdfTables).where(eq(pdfTables.id, id));
    return pdfTable || void 0;
  }
  async getPdfTablesByImport(importId) {
    return await db.select().from(pdfTables).where(eq(pdfTables.importId, importId));
  }
  async createPdfTable(pdfTable) {
    const [created] = await db.insert(pdfTables).values(pdfTable).returning();
    return created;
  }
  async updatePdfTable(id, pdfTable) {
    const [updated] = await db.update(pdfTables).set(pdfTable).where(eq(pdfTables.id, id)).returning();
    return updated;
  }
  async deletePdfTable(id) {
    await db.delete(pdfTables).where(eq(pdfTables.id, id));
  }
};
var storage = new DatabaseStorage();

// server/replitAuth.ts
import * as client from "openid-client";
import { Strategy } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}
var getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID
    );
  },
  { maxAge: 3600 * 1e3 }
);
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1e3;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions"
  });
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl
    }
  });
}
function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}
async function upsertUser(claims) {
  const email = claims["email"];
  if (!email) {
    throw new Error("E-Mail-Adresse nicht verf\xFCgbar. Bitte verwenden Sie ein Konto mit g\xFCltiger E-Mail-Adresse.");
  }
  const invitation = await storage.getInvitationByEmail(email);
  if (!invitation) {
    throw new Error(`Keine Einladung f\xFCr ${email} gefunden. Bitte kontaktieren Sie einen Administrator f\xFCr eine Einladung.`);
  }
  if (invitation.used) {
    const existingUser = await storage.getUserByEmail(email);
    if (!existingUser) {
      throw new Error(`Die Einladung f\xFCr ${email} wurde bereits verwendet. Bitte kontaktieren Sie einen Administrator.`);
    }
    return;
  }
  if (invitation.expiresAt < /* @__PURE__ */ new Date()) {
    throw new Error(`Die Einladung f\xFCr ${email} ist abgelaufen. Bitte kontaktieren Sie einen Administrator f\xFCr eine neue Einladung.`);
  }
  const userData = {
    id: claims["sub"],
    email,
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
    role: invitation.role
  };
  await storage.upsertUser(userData);
  await storage.markInvitationUsed(invitation.id, claims["sub"]);
}
async function setupAuth(app2) {
  app2.set("trust proxy", 1);
  app2.use(getSession());
  app2.use(passport.initialize());
  app2.use(passport.session());
  const config = await getOidcConfig();
  const verify = async (tokens, verified) => {
    try {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    } catch (error) {
      console.error("Authentication error:", error);
      verified(error, false);
    }
  };
  for (const domain of process.env.REPLIT_DOMAINS.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`
      },
      verify
    );
    passport.use(strategy);
  }
  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user, cb) => cb(null, user));
  app2.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"]
    })(req, res, next);
  });
  app2.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login"
    })(req, res, next);
  });
  app2.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`
        }).href
      );
    });
  });
}
var isAuthenticated = async (req, res, next) => {
  const user = req.user;
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const now = Math.floor(Date.now() / 1e3);
  if (now <= user.expires_at) {
    return next();
  }
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
var isAdmin = async (req, res, next) => {
  const user = req.user;
  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const email = user.claims?.email;
    if (!email) {
      return res.status(403).json({ message: "Access denied - no email found" });
    }
    const dbUser = await storage.getUserByEmail(email);
    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied - admin role required" });
    }
    return next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    return res.status(500).json({ message: "Error checking permissions" });
  }
};

// shared/parallel-subjects.ts
var PARALLEL_GROUPS = {
  "Differenzierung": {
    id: "Differenzierung",
    name: "Differenzierungsf\xE4cher",
    description: "Wahlpflichtf\xE4cher die parallel unterrichtet werden (7.-10. Klasse)",
    subjects: ["FS", "SW", "NW", "IF", "TC", "MUS"],
    // FS=Französisch, SW=Sozialwissenschaften, NW=Biologie-Kurs, IF=Informatik, TC=Technik, MUS=Musik-Kurs
    hoursPerGrade: {
      7: 3,
      8: 4,
      9: 3,
      10: 4
    }
  },
  "Religion": {
    id: "Religion",
    name: "Religionsf\xE4cher",
    description: "Religions- und Philosophieunterricht die parallel unterrichtet werden",
    subjects: ["KR", "ER", "PP"],
    // KR=Katholische Religion, ER=Evangelische Religion, PP=Praktische Philosophie
    hoursPerGrade: {
      5: 2,
      6: 2,
      7: 2,
      8: 2,
      9: 2,
      10: 2
    }
  }
};
function getParallelGroupForSubject(subjectShortName) {
  for (const group of Object.values(PARALLEL_GROUPS)) {
    if (group.subjects.includes(subjectShortName)) {
      return group;
    }
  }
  return null;
}
function calculateCorrectHours(subjectHours, grade, semester) {
  const parallelGroupHours = {};
  const regularHours = {};
  const processedGroups = /* @__PURE__ */ new Set();
  for (const [subjectName, hours] of Object.entries(subjectHours)) {
    const parallelGroup = getParallelGroupForSubject(subjectName);
    if (parallelGroup && !processedGroups.has(parallelGroup.id)) {
      let groupHours = parallelGroup.hoursPerGrade[grade] || 0;
      if (semester && groupHours > 0) {
        groupHours = Math.round(groupHours / 2 * 10) / 10;
      }
      parallelGroupHours[parallelGroup.id] = groupHours;
      processedGroups.add(parallelGroup.id);
    } else if (!parallelGroup) {
      let subjectHours_calc = hours;
      if (semester && hours > 0) {
        subjectHours_calc = Math.round(hours / 2 * 10) / 10;
      }
      regularHours[subjectName] = subjectHours_calc;
    }
  }
  const parallelTotal = Object.values(parallelGroupHours).reduce((sum, hours) => sum + hours, 0);
  const regularTotal = Object.values(regularHours).reduce((sum, hours) => sum + hours, 0);
  const totalHours = parallelTotal + regularTotal;
  return {
    totalHours,
    parallelGroupHours,
    regularHours
  };
}
var PARALLEL_GROUPS_ARRAY = Object.values(PARALLEL_GROUPS);

// server/routes.ts
init_lesson_distribution_importer();

// server/pdf-lesson-parser.ts
var PdfLessonParser = class _PdfLessonParser {
  async parsePDF(pdfBuffer) {
    const result = {
      classes: [],
      errors: [],
      warnings: []
    };
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const text2 = await this.extractTextFromPDF(pdfBuffer, pdfjs);
      console.log("DEBUG: Extracted PDF text (first 1000 chars):");
      console.log(text2.substring(0, 1e3));
      console.log("DEBUG: Total text length:", text2.length);
      const classSections = this.extractClassSections(text2);
      console.log("DEBUG: Found class sections:", classSections.length);
      classSections.forEach((section, index2) => {
        console.log(`DEBUG: Section ${index2}:`, section.substring(0, 200));
      });
      for (const section of classSections) {
        try {
          const classData = this.parseClassSection(section);
          if (classData) {
            result.classes.push(classData);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Fehler beim Parsen der Klasse: ${errorMessage}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`PDF-Parse-Fehler: ${errorMessage}`);
    }
    return result;
  }
  async extractTextFromPDF(pdfBuffer, pdfjs) {
    const uint8Array = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjs.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  }
  extractClassSections(text2) {
    const sections = [];
    const classPattern = /Unterrichtsplan für Klasse (\d{2}[a-zA-Z])/g;
    const matches = Array.from(text2.matchAll(classPattern));
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];
      const startIndex = currentMatch.index;
      const endIndex = nextMatch ? nextMatch.index : text2.length;
      const sectionText = text2.substring(startIndex, endIndex);
      sections.push(sectionText);
    }
    return sections;
  }
  isClassHeader(line) {
    return line.includes("Unterrichtsplan f\xFCr Klasse") || !!line.match(/^\d{2}[a-zA-Z]$/) || // e.g., "05a"
    !!line.match(/Klasse \d{2}[a-zA-Z]/);
  }
  parseClassSection(section) {
    const classMatch = section.match(/Unterrichtsplan für Klasse (\d{2}[a-zA-Z])/);
    if (!classMatch) return null;
    const className = classMatch[1];
    const lessons = [];
    const teachers2 = [];
    const semesterSections = section.split(/(?=[12]\.\s*Halbjahr)/);
    for (const semesterSection of semesterSections) {
      let currentSemester = 1;
      if (semesterSection.includes("2. Halbjahr")) {
        currentSemester = 2;
      } else if (semesterSection.includes("1. Halbjahr")) {
        currentSemester = 1;
      } else {
        continue;
      }
      const subjectPattern = /([^()]+?)\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})/g;
      let match;
      while ((match = subjectPattern.exec(semesterSection)) !== null) {
        const subject = match[1].trim();
        const hours = parseFloat(match[2].replace(",", "."));
        const teacher = match[3].trim();
        const isSupplementary = subject.toLowerCase().includes("f\xF6rder") || subject.toLowerCase().includes("sol") || subject.toLowerCase().includes("ag");
        lessons.push({
          className,
          semester: currentSemester,
          subject: this.normalizeSubjectName(subject),
          hours,
          teacherShortName: teacher,
          isSupplementary
        });
      }
    }
    const teacherMatch = section.match(/Lehrkräfte:\s*(.+?)$/m);
    if (teacherMatch) {
      teachers2.push(...teacherMatch[1].split(",").map((t) => t.trim()));
    }
    return {
      className,
      lessons,
      teachers: teachers2
    };
  }
  extractClassName(header) {
    let match = header.match(/Klasse (\d{2}[a-zA-Z])/);
    if (match) return match[1];
    match = header.match(/^(\d{2}[a-zA-Z])$/);
    if (match) return match[1];
    return null;
  }
  parseLessonLine(line, className, semester) {
    const cleanLine = line.replace(/\s+/g, " ").trim();
    const patterns = [
      // Standard pattern: Subject (hours) bei Teacher
      /^(.+?)\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/,
      // Semester-specific pattern: Subject 1./2. Hj. (hours) bei Teacher  
      /^(.+?)\s+[12]\.\s*Hj\.\s*\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/,
      // Förder pattern: Subject Förder ... (hours) bei Teacher
      /^(.+?)\s+Förder.+?\(([0-9,\.]+)\s*Stunde[ns]?\)\s*bei\s+([A-Z]{2,4})$/
    ];
    for (const pattern of patterns) {
      const match = cleanLine.match(pattern);
      if (match) {
        const subject = match[1].trim();
        const hours = parseFloat(match[2].replace(",", "."));
        const teacher = match[3].trim();
        const isSupplementary = subject.toLowerCase().includes("f\xF6rder") || subject.toLowerCase().includes("sol") || subject.toLowerCase().includes("ag");
        return {
          className,
          semester,
          subject: this.normalizeSubjectName(subject),
          hours,
          teacherShortName: teacher,
          isSupplementary
        };
      }
    }
    return null;
  }
  // Static method to normalize subject names for consistent matching
  static normalizeSubjectName(subject) {
    let normalized = subject.replace(/\s+Förder.*$/i, "").replace(/\s+[12]\.\s*Hj\..*$/i, "").trim().toLowerCase();
    const normalizations = {
      "evangelische religon": "evangelische religion",
      // Fix common typo
      "kath. religion": "katholische religion",
      "kath religion": "katholische religion",
      "ev. religion": "evangelische religion",
      "ev religion": "evangelische religion",
      "sol": "soziales lernen",
      "pp": "praktische philosophie",
      "haus- wirtschaft": "hauswirtschaft",
      "hauswirtschaft": "hauswirtschaft"
    };
    return normalizations[normalized] || normalized;
  }
  normalizeSubjectName(subject) {
    return _PdfLessonParser.normalizeSubjectName(subject);
  }
};

// server/intelligent-mapping-service.ts
var IntelligentMappingService = class {
  /**
   * Attempts to intelligently map a PDF subject name to a system subject ID
   * @param pdfSubjectName Original subject name from PDF
   * @param allSubjects All available system subjects
   * @returns Mapping result with either resolved subject ID or conflict details
   */
  async mapSubject(pdfSubjectName, allSubjects) {
    const normalizedName = PdfLessonParser.normalizeSubjectName(pdfSubjectName);
    const existingMapping = await storage.findSubjectMappingByName(normalizedName);
    if (existingMapping) {
      await storage.incrementMappingUsage(existingMapping.id);
      return {
        subjectId: existingMapping.systemSubjectId,
        autoResolved: true,
        mappingUsed: existingMapping
      };
    }
    const matches = this.findPossibleMatches(normalizedName, allSubjects);
    const highConfidenceMatch = matches.find((m) => m.confidence >= 0.9);
    if (highConfidenceMatch) {
      await this.createMapping(pdfSubjectName, normalizedName, highConfidenceMatch.subject.id, highConfidenceMatch.confidence);
      return {
        subjectId: highConfidenceMatch.subject.id,
        autoResolved: true
      };
    }
    return {
      subjectId: null,
      conflict: {
        id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        pdfSubjectName,
        normalizedName,
        possibleMatches: matches.slice(0, 5)
        // Top 5 matches
      },
      autoResolved: false
    };
  }
  /**
   * Manually resolve a conflict by creating a mapping
   * @param pdfSubjectName Original PDF subject name
   * @param selectedSubjectId Chosen system subject ID
   */
  async resolveConflict(pdfSubjectName, selectedSubjectId) {
    const normalizedName = PdfLessonParser.normalizeSubjectName(pdfSubjectName);
    return await this.createMapping(pdfSubjectName, normalizedName, selectedSubjectId, 1);
  }
  /**
   * Create a new subject mapping
   */
  async createMapping(pdfSubjectName, normalizedName, systemSubjectId, confidence) {
    const mappingData = {
      pdfSubjectName,
      normalizedName,
      systemSubjectId,
      confidence: confidence.toString(),
      // Convert to string for database
      usedCount: 1
    };
    return await storage.createSubjectMapping(mappingData);
  }
  /**
   * Find possible subject matches using fuzzy string matching
   */
  findPossibleMatches(normalizedName, allSubjects) {
    const matches = [];
    for (const subject of allSubjects) {
      const subjectNormalized = subject.name.toLowerCase().trim();
      const shortNameNormalized = subject.shortName.toLowerCase().trim();
      if (subjectNormalized === normalizedName || shortNameNormalized === normalizedName) {
        matches.push({
          subject,
          confidence: 1,
          reason: "Exakte \xDCbereinstimmung"
        });
        continue;
      }
      if (subjectNormalized.includes(normalizedName) || normalizedName.includes(subjectNormalized)) {
        matches.push({
          subject,
          confidence: 0.8,
          reason: "Teilweise \xDCbereinstimmung"
        });
        continue;
      }
      const similarity = this.calculateWordSimilarity(normalizedName, subjectNormalized);
      if (similarity >= 0.7) {
        matches.push({
          subject,
          confidence: similarity,
          reason: `${Math.round(similarity * 100)}% \xC4hnlichkeit`
        });
      }
    }
    return matches.sort((a, b) => b.confidence - a.confidence);
  }
  /**
   * Calculate word similarity using Levenshtein distance
   */
  calculateWordSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1;
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          // deletion
          matrix[j - 1][i] + 1,
          // insertion
          matrix[j - 1][i - 1] + indicator
          // substitution
        );
      }
    }
    return matrix[str2.length][str1.length];
  }
  /**
   * Get all existing mappings for management/review
   */
  async getAllMappings() {
    return await storage.getSubjectMappings();
  }
  /**
   * Delete a mapping (if incorrect)
   */
  async deleteMapping(mappingId) {
    await storage.deleteSubjectMapping(mappingId);
  }
};
var intelligentMappingService = new IntelligentMappingService();

// server/pdf-lesson-importer.ts
var PdfLessonImporter = class {
  constructor(storage2, parser) {
    this.storage = storage2;
    this.parser = parser;
    this.intelligentMapping = new IntelligentMappingService();
  }
  intelligentMapping;
  async previewImport(pdfBuffer, schoolYearId) {
    const parseResult = await this.parser.parsePDF(pdfBuffer);
    if (parseResult.errors.length > 0) {
      throw new Error(`PDF-Parse-Fehler: ${parseResult.errors.join(", ")}`);
    }
    const [existingClasses, existingTeachers, existingSubjects, existingAssignments] = await Promise.all([
      this.storage.getClassesBySchoolYear(schoolYearId),
      this.storage.getTeachers(),
      this.storage.getSubjects(),
      this.storage.getAssignmentsBySchoolYear(schoolYearId)
    ]);
    const classMap = this.createClassMap(existingClasses);
    const teacherMap = this.createTeacherMap(existingTeachers);
    const subjectMap = this.createSubjectMap(existingSubjects);
    const matches = [];
    const conflicts = [];
    const allLessons = [];
    for (const classData of parseResult.classes) {
      for (const lesson of classData.lessons) {
        allLessons.push(lesson);
        const match = {
          className: lesson.className,
          classId: null,
          teacherShortName: lesson.teacherShortName,
          teacherId: null,
          subjectName: lesson.subject,
          subjectId: null
        };
        const normalizedClassName = this.normalizeClassName(lesson.className);
        const matchedClass = classMap.get(normalizedClassName);
        if (matchedClass) {
          match.classId = matchedClass.id;
        } else {
          conflicts.push({
            type: "class_not_found",
            message: `Klasse "${lesson.className}" nicht im System gefunden`,
            suggestion: this.suggestSimilarClass(lesson.className, existingClasses),
            data: { className: lesson.className }
          });
        }
        const matchedTeacher = teacherMap.get(lesson.teacherShortName.toUpperCase());
        if (matchedTeacher) {
          match.teacherId = matchedTeacher.id;
        } else {
          conflicts.push({
            type: "teacher_not_found",
            message: `Lehrkraft "${lesson.teacherShortName}" nicht im System gefunden`,
            suggestion: this.suggestSimilarTeacher(lesson.teacherShortName, existingTeachers),
            data: { teacherShortName: lesson.teacherShortName }
          });
        }
        const mappingResult = await this.intelligentMapping.mapSubject(lesson.subject, existingSubjects);
        if (mappingResult.autoResolved && mappingResult.subjectId) {
          match.subjectId = mappingResult.subjectId;
        } else if (mappingResult.conflict) {
          conflicts.push({
            type: "intelligent_mapping_conflict",
            message: `Fach "${lesson.subject}" konnte nicht eindeutig zugeordnet werden`,
            suggestion: mappingResult.conflict.possibleMatches.length > 0 ? `M\xF6gliche Zuordnungen: ${mappingResult.conflict.possibleMatches.slice(0, 3).map((m) => m.subject.name).join(", ")}` : "Keine passenden F\xE4cher gefunden",
            data: { subjectName: lesson.subject },
            mappingConflict: mappingResult.conflict
          });
        } else {
          const matchedSubject = subjectMap.get(lesson.subject.toLowerCase());
          if (matchedSubject) {
            match.subjectId = matchedSubject.id;
          } else {
            conflicts.push({
              type: "subject_not_found",
              message: `Fach "${lesson.subject}" nicht im System gefunden`,
              suggestion: this.suggestSimilarSubject(lesson.subject, existingSubjects),
              data: { subjectName: lesson.subject }
            });
          }
        }
        if (match.classId && match.teacherId && match.subjectId) {
          const existingAssignment = existingAssignments.find(
            (a) => a.classId === match.classId && a.teacherId === match.teacherId && a.subjectId === match.subjectId && a.semester === lesson.semester.toString()
          );
          if (existingAssignment) {
            conflicts.push({
              type: "duplicate_assignment",
              message: `Zuweisung bereits vorhanden: ${lesson.subject} bei ${lesson.teacherShortName} f\xFCr Klasse ${lesson.className} (Semester ${lesson.semester})`,
              data: {
                lesson,
                existingAssignment,
                action: "update_or_skip"
              }
            });
          }
        }
        matches.push(match);
      }
    }
    const summary = {
      totalLessons: allLessons.length,
      matchedClasses: matches.filter((m) => m.classId).length,
      matchedTeachers: matches.filter((m) => m.teacherId).length,
      matchedSubjects: matches.filter((m) => m.subjectId).length,
      conflicts: conflicts.length
    };
    return {
      matches,
      conflicts,
      lessons: allLessons,
      summary
    };
  }
  async applyImport(lessons, resolutions, schoolYearId) {
    const errors = [];
    let imported = 0;
    let skipped = 0;
    const [existingClasses, existingTeachers, existingSubjects] = await Promise.all([
      this.storage.getClassesBySchoolYear(schoolYearId),
      this.storage.getTeachers(),
      this.storage.getSubjects()
    ]);
    const classMap = this.createClassMap(existingClasses);
    const teacherMap = this.createTeacherMap(existingTeachers);
    const subjectMap = this.createSubjectMap(existingSubjects);
    for (const lesson of lessons) {
      try {
        const resolvedClassName = resolutions[`class_${lesson.className}`] || lesson.className;
        const resolvedTeacherShortName = resolutions[`teacher_${lesson.teacherShortName}`] || lesson.teacherShortName;
        const resolvedSubjectName = resolutions[`subject_${lesson.subject}`] || lesson.subject;
        const classId = classMap.get(this.normalizeClassName(resolvedClassName))?.id;
        const teacherId = teacherMap.get(resolvedTeacherShortName.toUpperCase())?.id;
        const subjectId = subjectMap.get(resolvedSubjectName.toLowerCase())?.id;
        if (!classId || !teacherId || !subjectId) {
          errors.push(`Unvollst\xE4ndige Zuordnung f\xFCr ${lesson.subject} bei ${lesson.teacherShortName} in Klasse ${lesson.className}`);
          skipped++;
          continue;
        }
        const assignment = {
          teacherId,
          subjectId,
          classId,
          schoolYearId,
          semester: lesson.semester.toString(),
          hoursPerWeek: lesson.hours.toString()
        };
        await this.storage.createAssignment(assignment);
        imported++;
      } catch (error) {
        errors.push(`Fehler beim Import von ${lesson.subject}: ${error?.message || "Unbekannter Fehler"}`);
        skipped++;
      }
    }
    return { imported, skipped, errors };
  }
  createClassMap(classes2) {
    const map = /* @__PURE__ */ new Map();
    for (const cls of classes2) {
      const normalized = this.normalizeClassName(cls.name);
      map.set(normalized, cls);
    }
    return map;
  }
  createTeacherMap(teachers2) {
    const map = /* @__PURE__ */ new Map();
    for (const teacher of teachers2) {
      map.set(teacher.shortName.toUpperCase(), teacher);
    }
    return map;
  }
  createSubjectMap(subjects2) {
    const map = /* @__PURE__ */ new Map();
    for (const subject of subjects2) {
      map.set(subject.name.toLowerCase(), subject);
      if (subject.shortName) {
        map.set(subject.shortName.toLowerCase(), subject);
      }
    }
    return map;
  }
  normalizeClassName(className) {
    return className.toUpperCase().trim();
  }
  suggestSimilarClass(target, classes2) {
    const normalized = this.normalizeClassName(target);
    for (const cls of classes2) {
      const clsNormalized = this.normalizeClassName(cls.name);
      if (clsNormalized.includes(normalized.substring(0, 2)) || normalized.includes(clsNormalized.substring(0, 2))) {
        return cls.name;
      }
    }
    return "";
  }
  suggestSimilarTeacher(target, teachers2) {
    const targetUpper = target.toUpperCase();
    for (const teacher of teachers2) {
      if (teacher.shortName.toUpperCase().includes(targetUpper) || targetUpper.includes(teacher.shortName.toUpperCase())) {
        return teacher.shortName;
      }
    }
    return "";
  }
  suggestSimilarSubject(target, subjects2) {
    const targetLower = target.toLowerCase();
    for (const subject of subjects2) {
      if (subject.name.toLowerCase().includes(targetLower) || targetLower.includes(subject.name.toLowerCase())) {
        return subject.name;
      }
      if (subject.shortName && (subject.shortName.toLowerCase().includes(targetLower) || targetLower.includes(subject.shortName.toLowerCase()))) {
        return subject.name;
      }
    }
    return "";
  }
};

// server/openai-service.ts
import OpenAI from "openai";
var openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
var OpenAIHelpService = class {
  openai;
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  async getHelpResponse(userQuestion) {
    try {
      const systemPrompt = `Du bist ein hilfreicher Assistent f\xFCr das deutsche Stundenplan-Verwaltungssystem "DistriLesson PLANNER". 

      Das System verwaltet:
      - Lehrer (mit Qualifikationen und Stundendeputaten)
      - Klassen (mit Sch\xFClerzahlen und Stundenvorgaben)
      - F\xE4cher (mit Parallelgruppen f\xFCr Religion/Differenzierung)
      - Stundenpl\xE4ne und Zuweisungen
      - Planstellenberechnung nach deutschen Schulstandards
      - Master-Stundenplan mit Semester-Planung
      - CSV-Import f\xFCr Massendaten
      - Admin-Panel f\xFCr Benutzerverwaltung

      Hauptfunktionen:
      - Dashboard mit \xDCbersichten
      - Lehrerverwaltung (K\xFCrzel, Namen, F\xE4cher, Deputate)
      - Klassenverwaltung (Jahrg\xE4nge, Sch\xFClerzahlen, Zielstunden)
      - F\xE4cherverwaltung (auch mit Parallelgruppen)
      - Stundenplanoptimierung
      - Planstellenberechnung
      - Schuljahreswechsel
      - CSV/ChatGPT Import

      Antworte auf Deutsch in freundlichem Ton. Erkl\xE4re Funktionen, Prozesse und gib praktische Tipps f\xFCr die Nutzung des Systems.`;
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userQuestion
          }
        ],
        max_completion_tokens: 1e3
      });
      return response.choices[0].message.content || "Entschuldigung, ich konnte keine Antwort generieren.";
    } catch (error) {
      console.error("OpenAI help error:", error);
      throw new Error(`Fehler beim Generieren der Hilfe-Antwort: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`);
    }
  }
};
var OpenAIScheduleService = class {
  /**
   * Normalize class names to match database format (e.g., "5a" -> "05A")
   */
  normalizeClassName(className) {
    if (!className || typeof className !== "string") return className;
    const match = className.match(/^(\d{1,2})([a-zA-Z]*)$/);
    if (!match) return className;
    const [, grade, letter] = match;
    const normalizedGrade = grade.padStart(2, "0");
    const normalizedLetter = letter.toUpperCase();
    return `${normalizedGrade}${normalizedLetter}`;
  }
  async parseScheduleText(scheduleText) {
    console.log("Parsing schedule text with OpenAI GPT-5...");
    const maxInputLength = 2e3;
    let trimmedText = scheduleText;
    if (scheduleText.length > maxInputLength) {
      const lines = scheduleText.split("\n");
      let charCount = 0;
      let includedLines = [];
      for (const line of lines) {
        if (charCount + line.length + 1 <= maxInputLength) {
          includedLines.push(line);
          charCount += line.length + 1;
        } else {
          break;
        }
      }
      trimmedText = includedLines.join("\n") + (includedLines.length < lines.length ? "\n...(weitere Daten)" : "");
    }
    const prompt = `Analysiere diesen deutschen Stundenplan und extrahiere die Daten als JSON.

Antworte AUSSCHLIESSLICH mit einem g\xFCltigen JSON-Objekt in diesem Format:
{
  "teachers": [{"name": "Vollname oder null", "shortName": "ABC", "qualifications": ["D", "M"]}],
  "classes": [{"name": "5a", "grade": 5, "studentCount": null}],
  "subjects": [{"name": "Deutsch", "shortName": "D", "category": "Hauptfach"}],
  "assignments": [{"teacherShortName": "ABC", "className": "5a", "subjectShortName": "D", "hoursPerWeek": 4, "semester": 1}]
}

Wichtige Regeln:
- Lehrer-K\xFCrzel sind meist 2-4 Buchstaben (z.B. "M\xDCL", "SCH")
- Klassen wie "5a", "10b", "Q1" normalisieren
- Standard-F\xE4cher: D, M, E, BIO, CH, PH, KU, MU, SP, REL, PP, SoWi, GE, EK
- Semester: 1 = erstes Halbjahr, 2 = zweites Halbjahr

Stundenplan-Text:
${trimmedText}`;
    console.log("Prompt length:", prompt.length, "Input length:", scheduleText.length);
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        // Using GPT-4o for better reliability and token handling
        messages: [
          {
            role: "system",
            content: "Du bist ein Experte f\xFCr deutsche Schulstundenpl\xE4ne. Antworte ausschlie\xDFlich mit validen JSON-Daten."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        // Use JSON mode as per blueprint
        max_tokens: 4e3,
        // Using max_tokens for GPT-4o compatibility
        temperature: 0.1
        // Low temperature for consistent output
      });
      const content = response.choices[0].message.content;
      console.log("OpenAI Response:", {
        contentLength: content?.length || 0,
        finishReason: response.choices[0].finish_reason,
        hasContent: !!content
      });
      if (!content) {
        throw new Error("OpenAI returned empty response");
      }
      if (response.choices[0].finish_reason === "length") {
        console.warn("Response was truncated, trying with shorter input...");
        const shorterText = scheduleText.substring(0, 800);
        return this.parseScheduleText(shorterText);
      }
      const parsedData = JSON.parse(content);
      if (!parsedData.teachers || !parsedData.classes || !parsedData.subjects || !parsedData.assignments) {
        throw new Error("Invalid data structure returned by OpenAI");
      }
      console.log("Successfully parsed:", {
        teachers: parsedData.teachers?.length || 0,
        classes: parsedData.classes?.length || 0,
        subjects: parsedData.subjects?.length || 0,
        assignments: parsedData.assignments?.length || 0
      });
      return parsedData;
    } catch (error) {
      console.error("OpenAI parsing error:", error);
      if (error instanceof SyntaxError) {
        throw new Error("Fehler beim Parsen der OpenAI Antwort. Die JSON-Antwort war unvollst\xE4ndig oder fehlerhaft.");
      }
      throw new Error("Fehler beim Parsen des Stundenplans mit ChatGPT: " + error.message);
    }
  }
  async importParsedData(parsedData) {
    const result = {
      teachers: 0,
      classes: 0,
      subjects: 0,
      assignments: 0,
      errors: []
    };
    try {
      for (const teacherData of parsedData.teachers) {
        try {
          const fullName = teacherData.name || teacherData.shortName || "Unbekannt";
          const nameParts = fullName.split(" ");
          const validatedTeacher = insertTeacherSchema.parse({
            firstName: nameParts[0] || teacherData.shortName || "Unbekannt",
            lastName: nameParts.slice(1).join(" ") || "",
            shortName: teacherData.shortName || "",
            email: `${(teacherData.shortName || "").toLowerCase()}@schule.de`,
            currentHours: "0",
            qualifications: teacherData.qualifications || [],
            notes: "Importiert via ChatGPT"
          });
          const existingTeachers = await storage.getTeachers();
          const exists = existingTeachers.find((t) => t.shortName === teacherData.shortName);
          if (!exists) {
            await storage.createTeacher(validatedTeacher);
            result.teachers++;
          } else {
            const allQualifications = [...exists.qualifications, ...teacherData.qualifications];
            const uniqueQualifications = allQualifications.filter((qual, index2) => allQualifications.indexOf(qual) === index2);
            const updatedTeacher = {
              ...exists,
              qualifications: uniqueQualifications,
              notes: exists.notes + " | Aktualisiert via ChatGPT"
            };
            await storage.updateTeacher(exists.id, updatedTeacher);
            result.teachers++;
          }
        } catch (error) {
          result.errors.push(`Lehrer ${teacherData.shortName}: ${error.message}`);
        }
      }
      for (const classData of parsedData.classes) {
        try {
          const normalizedClassName = this.normalizeClassName(classData.name);
          const validatedClass = insertClassSchema.parse({
            name: normalizedClassName,
            grade: classData.grade,
            studentCount: classData.studentCount || 25,
            subjectHours: {},
            targetHoursTotal: null,
            targetHoursSemester1: null,
            targetHoursSemester2: null,
            classTeacher1Id: null,
            classTeacher2Id: null,
            schoolYearId: null
          });
          const existingClasses = await storage.getClasses();
          const exists = existingClasses.find((c) => c.name === normalizedClassName);
          if (!exists) {
            await storage.createClass(validatedClass);
            result.classes++;
          } else {
            const updatedClass = {
              ...exists,
              studentCount: classData.studentCount || exists.studentCount
            };
            await storage.updateClass(exists.id, updatedClass);
            result.classes++;
          }
        } catch (error) {
          result.errors.push(`Klasse ${classData.name} (normalisiert zu ${this.normalizeClassName(classData.name)}): ${error.message}`);
        }
      }
      for (const subjectData of parsedData.subjects) {
        try {
          const validatedSubject = insertSubjectSchema.parse({
            name: subjectData.name,
            shortName: subjectData.shortName,
            category: subjectData.category || "Hauptfach",
            hoursPerWeek: {},
            parallelGroup: null
          });
          const existingSubjects = await storage.getSubjects();
          const exists = existingSubjects.find((s) => s.shortName === subjectData.shortName);
          if (!exists) {
            await storage.createSubject(validatedSubject);
            result.subjects++;
          } else {
            result.subjects++;
          }
        } catch (error) {
          result.errors.push(`Fach ${subjectData.shortName}: ${error.message}`);
        }
      }
      const teachers2 = await storage.getTeachers();
      const classes2 = await storage.getClasses();
      const subjects2 = await storage.getSubjects();
      const schoolYears2 = await storage.getSchoolYears();
      const currentSchoolYear = schoolYears2.find((sy) => sy.isCurrent);
      if (!currentSchoolYear) {
        result.errors.push("Kein aktuelles Schuljahr gefunden. Zuweisungen k\xF6nnen nicht importiert werden.");
        return result;
      }
      const existingAssignments = await storage.getAssignments();
      for (const assignmentData of parsedData.assignments) {
        try {
          if (!assignmentData.className || assignmentData.className.trim() === "") {
            console.log(`Skipping assignment without class: ${assignmentData.teacherShortName} - ${assignmentData.subjectShortName}`);
            continue;
          }
          const normalizedClassName = this.normalizeClassName(assignmentData.className);
          const teacher = teachers2.find((t) => t.shortName === assignmentData.teacherShortName);
          const classObj = classes2.find((c) => c.name === normalizedClassName);
          const subject = subjects2.find((s) => s.shortName === assignmentData.subjectShortName);
          if (!teacher) {
            result.errors.push(`Lehrer mit K\xFCrzel "${assignmentData.teacherShortName}" nicht gefunden`);
            continue;
          }
          if (!classObj) {
            result.errors.push(`Klasse "${assignmentData.className}" (normalisiert zu "${normalizedClassName}") nicht gefunden`);
            continue;
          }
          if (!subject) {
            result.errors.push(`Fach "${assignmentData.subjectShortName}" nicht gefunden`);
            continue;
          }
          const semesterStr = (assignmentData.semester || 1).toString();
          const exists = existingAssignments.find(
            (a) => a.teacherId === teacher.id && a.classId === classObj.id && a.subjectId === subject.id && a.schoolYearId === currentSchoolYear.id && a.semester === semesterStr
          );
          if (exists) {
            const updatedAssignment = {
              hoursPerWeek: assignmentData.hoursPerWeek.toString(),
              // Storage update braucht String
              teacherId: exists.teacherId,
              classId: exists.classId,
              subjectId: exists.subjectId,
              semester: exists.semester,
              schoolYearId: exists.schoolYearId,
              isOptimized: exists.isOptimized,
              teamTeachingId: exists.teamTeachingId
            };
            await storage.updateAssignment(exists.id, updatedAssignment);
            result.assignments++;
            continue;
          }
          const validatedAssignment = insertAssignmentSchema.parse({
            teacherId: teacher.id,
            classId: classObj.id,
            subjectId: subject.id,
            schoolYearId: currentSchoolYear.id,
            hoursPerWeek: assignmentData.hoursPerWeek,
            // Schema erwartet Number, nicht String!
            semester: semesterStr,
            teamTeachingId: null
          });
          await storage.createAssignment(validatedAssignment);
          result.assignments++;
        } catch (error) {
          const normalizedClassName = this.normalizeClassName(assignmentData.className);
          result.errors.push(`Zuweisung ${assignmentData.teacherShortName}-${assignmentData.className}(\u2192${normalizedClassName})-${assignmentData.subjectShortName}: ${error.message}`);
        }
      }
      return result;
    } catch (error) {
      result.errors.push("Allgemeiner Import-Fehler: " + error.message);
      return result;
    }
  }
};
var openaiScheduleService = new OpenAIScheduleService();

// server/routes.ts
import { z as z2 } from "zod";
var upload = multer({ storage: multer.memoryStorage() });
async function registerRoutes(app2) {
  await setupAuth(app2);
  const openaiHelpService = new OpenAIHelpService();
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app2.post("/api/admin/invitations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`DEBUG: Creating invitation with userId: ${userId} (type: ${typeof userId})`);
      const dataToValidate = {
        ...req.body,
        createdBy: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3)
        // 7 days
      };
      console.log("DEBUG: Data to validate:", JSON.stringify(dataToValidate, null, 2));
      const invitationData = insertInvitationSchema.parse(dataToValidate);
      const invitation = await storage.createInvitation(invitationData);
      res.status(201).json(invitation);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("duplicate key")) {
        return res.status(400).json({ error: "Eine Einladung f\xFCr diese E-Mail-Adresse existiert bereits" });
      }
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });
  app2.get("/api/admin/invitations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const invitations2 = await storage.getInvitations();
      res.json(invitations2);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });
  app2.delete("/api/admin/invitations/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteInvitation(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });
  app2.get("/api/invitation/:token", async (req, res) => {
    try {
      const invitation = await storage.getInvitationByToken(req.params.token);
      if (!invitation) {
        return res.status(404).json({ error: "Einladung nicht gefunden oder bereits verwendet" });
      }
      if (invitation.used) {
        return res.status(400).json({ error: "Diese Einladung wurde bereits verwendet" });
      }
      if (invitation.expiresAt < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ error: "Diese Einladung ist abgelaufen" });
      }
      res.json({
        email: invitation.email,
        role: invitation.role,
        valid: true
      });
    } catch (error) {
      console.error("Error validating invitation:", error);
      res.status(500).json({ error: "Failed to validate invitation" });
    }
  });
  app2.use("/api", (req, res, next) => {
    const publicRoutes = ["/api/login", "/api/callback", "/api/invitation"];
    const isPublicRoute = publicRoutes.some((route) => req.path.startsWith(route));
    if (isPublicRoute) {
      return next();
    }
    if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
      if (!req.user) {
        req.user = {
          claims: { sub: "dev-user-123" },
          role: "admin"
        };
        req.isAuthenticated = () => true;
      }
      return next();
    }
    return isAuthenticated(req, res, next);
  });
  app2.get("/api/teachers", async (req, res) => {
    try {
      const teachers2 = await storage.getTeachers();
      res.json(teachers2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teachers" });
    }
  });
  app2.get("/api/teachers/:id", async (req, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.id);
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }
      res.json(teacher);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teacher" });
    }
  });
  app2.post("/api/teachers", async (req, res) => {
    try {
      const teacherData = insertTeacherSchema.parse(req.body);
      const teacher = await storage.createTeacher(teacherData);
      res.status(201).json(teacher);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create teacher" });
    }
  });
  app2.put("/api/teachers/:id", async (req, res) => {
    try {
      console.log("PUT /api/teachers/:id - Request body:", JSON.stringify(req.body, null, 2));
      console.log("Teacher ID:", req.params.id);
      const processedData = { ...req.body };
      if (processedData.maxHours && typeof processedData.maxHours === "string") {
        processedData.maxHours = processedData.maxHours.toString();
      }
      if (processedData.currentHours && typeof processedData.currentHours === "string") {
        processedData.currentHours = processedData.currentHours.toString();
      }
      if (processedData.reductionHours) {
        const reductionHours = {};
        for (const [key, value] of Object.entries(processedData.reductionHours)) {
          if (value !== null && value !== void 0 && value !== "") {
            reductionHours[key] = typeof value === "string" ? parseFloat(value) || 0 : value;
          } else {
            reductionHours[key] = 0;
          }
        }
        processedData.reductionHours = reductionHours;
      }
      console.log("Processed data:", JSON.stringify(processedData, null, 2));
      const teacherData = insertTeacherSchema.partial().parse(processedData);
      console.log("Validated data:", JSON.stringify(teacherData, null, 2));
      const teacher = await storage.updateTeacher(req.params.id, teacherData);
      console.log("Updated teacher:", JSON.stringify(teacher, null, 2));
      res.json(teacher);
    } catch (error) {
      console.error("Error updating teacher:", error);
      if (error instanceof z2.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({
        error: "Failed to update teacher",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.delete("/api/teachers/:id", async (req, res) => {
    try {
      console.log("Attempting to delete teacher with ID:", req.params.id);
      await storage.deleteTeacher(req.params.id);
      console.log("Teacher deleted successfully");
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting teacher:", error);
      res.status(500).json({ error: "Failed to delete teacher", details: error instanceof Error ? error.message : String(error) });
    }
  });
  app2.get("/api/students", async (req, res) => {
    try {
      const students2 = await storage.getStudents();
      res.json(students2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });
  app2.post("/api/students", async (req, res) => {
    try {
      const studentData = insertStudentSchema.parse(req.body);
      const student = await storage.createStudent(studentData);
      res.status(201).json(student);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("Keine aktuelle Schuljahr gefunden")) {
        return res.status(400).json({
          error: "Keine aktuelles Schuljahr konfiguriert",
          details: "Bitte setzen Sie zuerst ein aktuelles Schuljahr \xFCber die Schuljahr-Verwaltung."
        });
      }
      res.status(500).json({ error: "Failed to create student" });
    }
  });
  app2.get("/api/classes", async (req, res) => {
    try {
      const classes2 = await storage.getClasses();
      res.json(classes2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });
  app2.post("/api/classes", async (req, res) => {
    try {
      const createClassSchema = insertClassSchema.extend({
        classTeacher1Id: z2.string().uuid().nullable().optional(),
        classTeacher2Id: z2.string().uuid().nullable().optional()
      });
      const classData = createClassSchema.parse(req.body);
      const newClass = await storage.createClass(classData);
      res.status(201).json(newClass);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("Keine aktuelle Schuljahr gefunden")) {
        return res.status(400).json({
          error: "Keine aktuelles Schuljahr konfiguriert",
          details: "Bitte setzen Sie zuerst ein aktuelles Schuljahr \xFCber die Schuljahr-Verwaltung."
        });
      }
      res.status(500).json({ error: "Failed to create class" });
    }
  });
  app2.put("/api/classes/:id", async (req, res) => {
    try {
      const updateClassSchema = insertClassSchema.partial().extend({
        classTeacher1Id: z2.string().uuid().nullable().optional(),
        classTeacher2Id: z2.string().uuid().nullable().optional()
      });
      const classData = updateClassSchema.parse(req.body);
      const updatedClass = await storage.updateClass(req.params.id, classData);
      res.json(updatedClass);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update class" });
    }
  });
  app2.delete("/api/classes/:id", async (req, res) => {
    try {
      await storage.deleteClass(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete class" });
    }
  });
  const gradeBulkUpdateSchema = z2.object({
    grade: z2.number().int().min(5).max(10),
    targetHoursTotal: z2.string().optional().refine((val) => {
      if (val === void 0 || val === "" || val === null) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, { message: "Gesamtstunden m\xFCssen zwischen 0 und 100 liegen" }),
    targetHoursSemester1: z2.string().nullable().optional().refine((val) => {
      if (val === null || val === void 0 || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 50;
    }, { message: "Soll-Stunden 1.HJ m\xFCssen zwischen 0 und 50 liegen" }),
    targetHoursSemester2: z2.string().nullable().optional().refine((val) => {
      if (val === null || val === void 0 || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 50;
    }, { message: "Soll-Stunden 2.HJ m\xFCssen zwischen 0 und 50 liegen" })
  });
  app2.post("/api/classes/bulk-update-grade", async (req, res) => {
    try {
      const validatedData = gradeBulkUpdateSchema.parse(req.body);
      const { grade, targetHoursTotal, targetHoursSemester1, targetHoursSemester2 } = validatedData;
      const allClasses = await storage.getClasses();
      const classesToUpdate = allClasses.filter((c) => c.grade === grade);
      if (classesToUpdate.length === 0) {
        return res.status(404).json({
          error: `Keine Klassen f\xFCr Jahrgangsstufe ${grade} gefunden.`
        });
      }
      let updatedCount = 0;
      for (const classData of classesToUpdate) {
        const updateData = {};
        if (targetHoursTotal !== void 0) {
          updateData.targetHoursTotal = targetHoursTotal === "" ? null : targetHoursTotal;
        }
        if (targetHoursSemester1 !== void 0) {
          updateData.targetHoursSemester1 = targetHoursSemester1 === "" ? null : targetHoursSemester1;
        }
        if (targetHoursSemester2 !== void 0) {
          updateData.targetHoursSemester2 = targetHoursSemester2 === "" ? null : targetHoursSemester2;
        }
        if (Object.keys(updateData).length > 0) {
          await storage.updateClass(classData.id, updateData);
          updatedCount++;
        }
      }
      res.json({
        success: true,
        updatedCount,
        message: `${updatedCount} Klassen der Jahrgangsstufe ${grade} wurden aktualisiert.`
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({
          error: "Ung\xFCltige Eingabedaten",
          details: error.errors
        });
      }
      console.error("Error bulk updating classes:", error);
      res.status(500).json({ error: "Failed to bulk update classes" });
    }
  });
  app2.post("/api/classes/bulk-edit", async (req, res) => {
    try {
      const validatedData = gradeBulkUpdateSchema.parse(req.body);
      const { grade, targetHoursTotal, targetHoursSemester1, targetHoursSemester2 } = validatedData;
      const allClasses = await storage.getClasses();
      const classesToUpdate = allClasses.filter((c) => c.grade === grade);
      if (classesToUpdate.length === 0) {
        return res.status(404).json({
          error: `Keine Klassen f\xFCr Jahrgangsstufe ${grade} gefunden.`
        });
      }
      let updatedCount = 0;
      for (const classData of classesToUpdate) {
        const updateData = {};
        if (targetHoursTotal !== void 0) {
          updateData.targetHoursTotal = targetHoursTotal === "" ? null : targetHoursTotal;
        }
        if (targetHoursSemester1 !== void 0) {
          updateData.targetHoursSemester1 = targetHoursSemester1 === "" ? null : targetHoursSemester1;
        }
        if (targetHoursSemester2 !== void 0) {
          updateData.targetHoursSemester2 = targetHoursSemester2 === "" ? null : targetHoursSemester2;
        }
        if (Object.keys(updateData).length > 0) {
          await storage.updateClass(classData.id, updateData);
          updatedCount++;
        }
      }
      res.json({
        success: true,
        updatedCount,
        message: `${updatedCount} Klassen der Jahrgangsstufe ${grade} wurden aktualisiert.`
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({
          error: "Ung\xFCltige Eingabedaten",
          details: error.errors
        });
      }
      console.error("Error bulk updating classes:", error);
      res.status(500).json({ error: "Failed to bulk update classes" });
    }
  });
  app2.get("/api/subjects", async (req, res) => {
    try {
      const subjects2 = await storage.getSubjects();
      res.json(subjects2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subjects" });
    }
  });
  app2.post("/api/subjects", async (req, res) => {
    try {
      const subjectData = insertSubjectSchema.parse(req.body);
      const subject = await storage.createSubject(subjectData);
      res.status(201).json(subject);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create subject" });
    }
  });
  app2.put("/api/subjects/:id", async (req, res) => {
    try {
      const subjectData = insertSubjectSchema.partial().parse(req.body);
      const subject = await storage.updateSubject(req.params.id, subjectData);
      res.json(subject);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update subject" });
    }
  });
  app2.delete("/api/subjects/:id", async (req, res) => {
    try {
      await storage.deleteSubject(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete subject" });
    }
  });
  app2.post("/api/subjects/cleanup-orphaned", async (req, res) => {
    try {
      await storage.cleanupOrphanedSubjectReferences();
      res.json({ message: "Orphaned subject references cleaned up successfully" });
    } catch (error) {
      console.error("Error cleaning up orphaned subject references:", error);
      res.status(500).json({ error: "Failed to cleanup orphaned subject references" });
    }
  });
  app2.post("/api/subjects/init-defaults", async (req, res) => {
    try {
      const defaultSubjects = [
        {
          name: "Vertretungsreserve",
          shortName: "VR",
          category: "Sonderbereich",
          hoursPerWeek: {}
        }
      ];
      const results = await storage.bulkCreateSubjectsWithConflictHandling(defaultSubjects);
      res.json({
        message: "Default subjects initialized",
        subjects: results,
        count: results.length
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to initialize default subjects" });
    }
  });
  app2.get("/api/assignments", async (req, res) => {
    try {
      const assignments2 = await storage.getAssignmentsWithRelations();
      res.json(assignments2);
    } catch (error) {
      console.error("Failed to fetch assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });
  app2.post("/api/assignments", async (req, res) => {
    try {
      const assignmentData = insertAssignmentSchema.parse(req.body);
      const assignment = await storage.createAssignment(assignmentData);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("Keine aktuelle Schuljahr gefunden")) {
        return res.status(400).json({
          error: "Keine aktuelles Schuljahr konfiguriert",
          details: "Bitte setzen Sie zuerst ein aktuelles Schuljahr \xFCber die Schuljahr-Verwaltung."
        });
      }
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });
  app2.put("/api/assignments/:id", async (req, res) => {
    try {
      const assignmentData = insertAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateAssignment(req.params.id, assignmentData);
      res.json(assignment);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });
  app2.delete("/api/assignments/bulk", async (req, res) => {
    try {
      const { assignmentIds } = req.body;
      if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return res.status(400).json({ error: "assignmentIds must be a non-empty array" });
      }
      console.log(`Bulk deleting ${assignmentIds.length} assignments:`, assignmentIds);
      for (const id of assignmentIds) {
        await storage.deleteAssignment(id);
      }
      console.log("Bulk deletion completed successfully");
      res.status(204).send();
    } catch (error) {
      console.error("Error in bulk delete assignments:", error);
      res.status(500).json({ error: "Failed to delete assignments" });
    }
  });
  app2.delete("/api/assignments/:id", async (req, res) => {
    try {
      await storage.deleteAssignment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });
  app2.post("/api/assignments/fix-missing-semester2", async (req, res) => {
    try {
      const { dryRun = true } = req.body;
      const assignments2 = await storage.getAssignments();
      const teachers2 = await storage.getTeachers();
      const subjects2 = await storage.getSubjects();
      const classes2 = await storage.getClasses();
      const assignmentMap = /* @__PURE__ */ new Map();
      for (const assignment of assignments2) {
        const teacher = teachers2.find((t) => t.id === assignment.teacherId);
        const subject = subjects2.find((s) => s.id === assignment.subjectId);
        const classObj = classes2.find((c) => c.id === assignment.classId);
        if (!teacher || !subject || !classObj) continue;
        const key = `${teacher.shortName}-${subject.shortName}-${classObj.name}`;
        if (!assignmentMap.has(key)) {
          assignmentMap.set(key, {});
        }
        const entry = assignmentMap.get(key);
        if (assignment.semester === "1") {
          entry.semester1 = assignment;
        } else if (assignment.semester === "2") {
          entry.semester2 = assignment;
        }
      }
      const missingAssignments = [];
      const teacherIdMap = new Map(teachers2.map((t) => [t.shortName, t.id]));
      const subjectIdMap = new Map(subjects2.map((s) => [s.shortName, s.id]));
      const classIdMap = new Map(classes2.map((c) => [c.name, c.id]));
      for (const [key, entry] of Array.from(assignmentMap.entries())) {
        if (entry.semester1 && !entry.semester2) {
          const [teacherShort, subjectShort, className] = key.split("-");
          const teacherId = teacherIdMap.get(teacherShort);
          const subjectId = subjectIdMap.get(subjectShort);
          const classId = classIdMap.get(className);
          if (teacherId && subjectId && classId) {
            missingAssignments.push({
              teacherId,
              subjectId,
              classId,
              teacherShort,
              subjectShort,
              className,
              hoursPerWeek: entry.semester1.hoursPerWeek,
              semester: "2",
              schoolYearId: entry.semester1.schoolYearId,
              isOptimized: false
            });
          }
        }
      }
      const result = {
        found: missingAssignments.length,
        missingAssignments: missingAssignments.map((a) => ({
          teacher: a.teacherShort,
          subject: a.subjectShort,
          class: a.className,
          hours: a.hoursPerWeek
        })),
        created: 0
      };
      if (!dryRun && missingAssignments.length > 0) {
        for (const assignment of missingAssignments) {
          try {
            const assignmentData = insertAssignmentSchema.parse({
              teacherId: assignment.teacherId,
              subjectId: assignment.subjectId,
              classId: assignment.classId,
              hoursPerWeek: assignment.hoursPerWeek,
              semester: assignment.semester,
              schoolYearId: assignment.schoolYearId,
              isOptimized: assignment.isOptimized
            });
            await storage.createAssignment(assignmentData);
            result.created++;
          } catch (error) {
            console.error(`Failed to create assignment for ${assignment.teacherShort}-${assignment.subjectShort}-${assignment.className}:`, error);
          }
        }
      }
      res.json({
        success: true,
        message: dryRun ? `Gefunden: ${result.found} fehlende Semester 2 Zuweisungen (Testlauf)` : `Erstellt: ${result.created} von ${result.found} fehlenden Semester 2 Zuweisungen`,
        dryRun,
        ...result
      });
    } catch (error) {
      console.error("Error fixing missing semester 2 assignments:", error);
      res.status(500).json({
        error: "Failed to fix missing semester 2 assignments",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getTeacherStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });
  const createTeamTeachingSchema = z2.object({
    teacherIds: z2.array(z2.string().uuid()).min(1, "At least one teacher ID is required")
  });
  app2.post("/api/assignments/:id/team", async (req, res) => {
    try {
      const { teacherIds } = createTeamTeachingSchema.parse(req.body);
      const teamAssignments = await storage.createTeamTeaching(req.params.id, teacherIds);
      res.status(201).json(teamAssignments);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error) {
        if (error.message.includes("Base assignment not found")) {
          return res.status(404).json({ error: "Assignment not found" });
        }
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create team teaching" });
    }
  });
  app2.get("/api/team-teaching/:teamTeachingId", async (req, res) => {
    try {
      const teamAssignments = await storage.getTeamTeachingGroup(req.params.teamTeachingId);
      res.json(teamAssignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team teaching group" });
    }
  });
  app2.get("/api/team-teaching/:teamTeachingId/validate", async (req, res) => {
    try {
      const validation = await storage.validateTeamTeachingGroup(req.params.teamTeachingId);
      res.json(validation);
    } catch (error) {
      res.status(500).json({ error: "Failed to validate team teaching group" });
    }
  });
  app2.delete("/api/assignments/:id/team", async (req, res) => {
    try {
      const assignment = await storage.removeFromTeamTeaching(req.params.id);
      res.json(assignment);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Assignment not found")) {
          return res.status(404).json({ error: "Assignment not found" });
        }
        if (error.message.includes("not part of a team teaching group")) {
          return res.status(400).json({ error: "Assignment is not part of a team teaching group" });
        }
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to remove from team teaching" });
    }
  });
  async function performPlanstellenCalculation(teachers2, classes2, subjects2, storage2) {
    const results = [];
    const gradeHours = {};
    for (const classData of classes2) {
      const grade = classData.grade.toString();
      if (!gradeHours[grade]) {
        gradeHours[grade] = { totalHours: 0, parallelGroupHours: {}, regularHours: {} };
      }
      const classCorrectHours = calculateCorrectHours(classData.subjectHours, classData.grade);
      for (const [groupId, hours] of Object.entries(classCorrectHours.parallelGroupHours)) {
        gradeHours[grade].parallelGroupHours[groupId] = Math.max(
          gradeHours[grade].parallelGroupHours[groupId] || 0,
          hours
        );
      }
      for (const [subjectName, hours] of Object.entries(classCorrectHours.regularHours)) {
        if (!gradeHours[grade].regularHours[subjectName]) {
          gradeHours[grade].regularHours[subjectName] = 0;
        }
        gradeHours[grade].regularHours[subjectName] += hours;
      }
      const parallelTotal = Object.values(gradeHours[grade].parallelGroupHours).reduce((sum, h) => sum + h, 0);
      const regularTotal = Object.values(gradeHours[grade].regularHours).reduce((sum, h) => sum + h, 0);
      gradeHours[grade].totalHours = parallelTotal + regularTotal;
    }
    for (const [grade, gradeData] of Object.entries(gradeHours)) {
      for (const [groupId, hours] of Object.entries(gradeData.parallelGroupHours)) {
        const availableHours = teachers2.filter((teacher) => {
          const groupSubjects = groupId === "Differenzierung" ? ["FS", "SW", "NW", "IF", "TC", "MUS"] : groupId === "Religion" ? ["KR", "ER", "PP"] : [];
          return teacher.subjects.some((subj) => groupSubjects.includes(subj));
        }).reduce((sum, teacher) => sum + parseFloat(teacher.currentHours || "0"), 0);
        const planstelle = await storage2.createPlanstelle({
          subjectId: null,
          // Parallel groups don't map to single subjects
          grade: parseInt(grade),
          category: "grundbedarf",
          component: `${groupId} - Klasse ${grade} (Parallelgruppe)`,
          lineType: "requirement",
          formula: { description: `Parallele F\xE4chergruppe ${groupId} f\xFCr Klasse ${grade}` },
          color: "#10B981",
          // Green for parallel groups
          requiredHours: hours.toString(),
          availableHours: availableHours.toString(),
          deficit: (hours - availableHours).toString()
        });
        results.push(planstelle);
      }
      for (const [subjectName, requiredHours] of Object.entries(gradeData.regularHours)) {
        const subject = subjects2.find((s) => s.name === subjectName || s.shortName === subjectName);
        const availableHours = teachers2.filter((teacher) => teacher.subjects.includes(subjectName)).reduce((sum, teacher) => sum + parseFloat(teacher.currentHours || "0"), 0);
        const planstelle = await storage2.createPlanstelle({
          subjectId: subject?.id || null,
          grade: parseInt(grade),
          category: "grundbedarf",
          component: `${subjectName} - Klasse ${grade}`,
          lineType: "requirement",
          formula: { description: `Calculated for grade ${grade}` },
          color: "#3B82F6",
          // Blue for regular subjects
          requiredHours: requiredHours.toString(),
          availableHours: availableHours.toString(),
          deficit: (requiredHours - availableHours).toString()
        });
        results.push(planstelle);
      }
    }
    return results;
  }
  app2.get("/api/planstellen", async (req, res) => {
    try {
      const planstellen2 = await storage.getPlanstellen();
      res.json(planstellen2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch planstellen" });
    }
  });
  app2.post("/api/calculate-planstellen", isAuthenticated, async (req, res) => {
    try {
      if (req.body && Object.keys(req.body).length > 0) {
        const input = planstellenInputSchema.parse(req.body);
        const calculated = await storage.calculatePlanstellenFromInput(input);
        return res.json({
          message: "Planstellen calculation completed successfully",
          planstellen: calculated,
          calculated: calculated.length,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        const teachers2 = await storage.getTeachers();
        const classes2 = await storage.getClasses();
        const subjects2 = await storage.getSubjects();
        const calculated = await performPlanstellenCalculation(teachers2, classes2, subjects2, storage);
        return res.json({
          message: "Planstellen calculation completed successfully",
          calculated: calculated.length,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Planstellen calculation error:", error);
      res.status(500).json({ error: "Failed to calculate planstellen" });
    }
  });
  app2.post("/api/planstellen/save", isAuthenticated, async (req, res) => {
    try {
      const input = planstellenInputSchema.parse(req.body);
      const calculated = await storage.calculatePlanstellenFromInput(input);
      const savedPlanstellen = [];
      for (const planstelle of calculated) {
        const saved = await storage.createPlanstelle(planstelle);
        savedPlanstellen.push(saved);
      }
      return res.json({
        message: "Planstellen saved successfully",
        planstellen: savedPlanstellen,
        calculated: savedPlanstellen.length,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Planstellen save error:", error);
      res.status(500).json({ error: "Failed to save planstellen" });
    }
  });
  app2.post("/api/import/csv", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const { dataType } = req.body;
      let csvContent = req.file.buffer.toString("utf-8");
      if (csvContent.charCodeAt(0) === 65279) {
        csvContent = csvContent.slice(1);
      }
      const lines = csvContent.split("\n").filter((line) => line.trim());
      const firstLine = lines[0];
      const separator = firstLine.includes(";") ? ";" : ",";
      const headers = firstLine.split(separator).map((h) => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map(
        (line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ""))
      ).filter((row) => row.length > 1 && row[0]);
      let result;
      switch (dataType) {
        case "teachers":
          const teacherData = rows.map((row) => ({
            firstName: row[0] || "",
            lastName: row[1] || "",
            shortName: row[2] || "",
            email: row[3] || "",
            subjects: row[4] ? row[4].split(";") : [],
            maxHours: (parseFloat(row[5]) || 25).toString(),
            currentHours: (parseFloat(row[6]) || 0).toString(),
            dateOfBirth: row[7] || null,
            // Format: YYYY-MM-DD
            qualifications: row[8] ? row[8].split(";") : [],
            notes: row[9] || ""
          }));
          result = await storage.bulkCreateTeachers(teacherData);
          break;
        case "students":
          const uniqueClasses = Array.from(new Set(rows.map((row) => row[2]).filter(Boolean)));
          const classMap = /* @__PURE__ */ new Map();
          for (const className of uniqueClasses) {
            let classRecord = await storage.getClassByName(className);
            if (!classRecord) {
              const gradeMatch = className.match(/^(\d+)/);
              const grade = gradeMatch ? parseInt(gradeMatch[1]) : 5;
              classRecord = await storage.createClass({
                name: className,
                grade,
                studentCount: 0,
                subjectHours: {}
              });
            }
            classMap.set(className, classRecord.id);
          }
          const studentData = rows.map((row) => ({
            firstName: row[0] || "",
            lastName: row[1] || "",
            classId: classMap.get(row[2]) || null,
            grade: parseInt(row[3]) || 5
          }));
          result = await storage.bulkCreateStudents(studentData);
          break;
        case "classes":
          const classData = rows.map((row) => ({
            name: row[0] || "",
            grade: parseInt(row[1]) || 5,
            studentCount: parseInt(row[2]) || 0,
            subjectHours: {}
          }));
          result = await storage.bulkCreateClasses(classData);
          break;
        case "subjects":
          if (headers.length > 10 && headers[0].toLowerCase().includes("klasse")) {
            const subjects2 = /* @__PURE__ */ new Set();
            for (let i = 2; i < headers.length; i += 3) {
              const shortNameHeader = headers[i];
              const nameHeader = headers[i + 1];
              if (shortNameHeader && nameHeader) {
                const shortName = shortNameHeader.split("_")[0];
                const name = nameHeader.split("_")[0].replace(/([A-Z])/g, " $1").trim();
                if (shortName && shortName !== "AG") {
                  subjects2.add({ shortName, name });
                }
              }
            }
            for (const row of rows) {
              for (let i = 2; i < row.length; i += 3) {
                const shortName = row[i]?.trim();
                const name = row[i + 1]?.trim();
                if (shortName && name && shortName !== "AG") {
                  subjects2.add({ shortName, name });
                }
              }
            }
            const subjectData = Array.from(subjects2).map((s) => ({
              name: s.name || s.shortName,
              shortName: s.shortName,
              category: "Hauptfach",
              hoursPerWeek: {}
            }));
            result = await storage.bulkCreateSubjectsWithConflictHandling(subjectData);
          } else {
            const subjectData = rows.filter((row) => row[0] && row[1] && row[0] !== "**").map((row) => ({
              name: row[1] || row[0],
              // Use full name (column 1) or fallback to shortName
              shortName: row[0],
              category: row[2] || "Hauptfach",
              hoursPerWeek: {}
            }));
            if (subjectData.length === 0) {
              return res.status(400).json({ error: "No valid subjects found in CSV" });
            }
            result = await storage.bulkCreateSubjectsWithConflictHandling(subjectData);
          }
          break;
        default:
          return res.status(400).json({ error: "Invalid data type" });
      }
      res.json({
        message: `Successfully imported ${result.length} ${dataType}`,
        count: result.length
      });
    } catch (error) {
      console.error("CSV Import error:", error);
      res.status(500).json({ error: "Failed to import CSV data" });
    }
  });
  const findSubjectByName = (subjects2, semesterName, baseName) => {
    const subjectAliases = {
      "D": ["D", "DE", "Deutsch"],
      "D1": ["D1", "DE1", "Deutsch1"],
      "D2": ["D2", "DE2", "Deutsch2"],
      "M": ["M", "MA", "Mathe", "Mathematik"],
      "M1": ["M1", "MA1", "Mathe1"],
      "M2": ["M2", "MA2", "Mathe2"],
      "E": ["E", "EN", "Englisch", "English"],
      "E1": ["E1", "EN1", "Englisch1"],
      "E2": ["E2", "EN2", "Englisch2"],
      "L": ["L", "F", "FR", "LA", "FS", "Franz\xF6sisch", "Latein", "Fremdsprache"],
      "L1": ["L1", "F1", "FR1", "LA1"],
      "L2": ["L2", "F2", "FR2", "LA2"],
      "PK": ["PK", "SW", "Politik", "Sozialwissenschaften"],
      "PK1": ["PK1", "SW1"],
      "PK2": ["PK2", "SW2"],
      "TC": ["TC", "TX", "Technik"],
      "TC1": ["TC1", "TX1"],
      "TC2": ["TC2", "TX2"],
      "NW": ["NW", "BI", "BIO", "CH", "PH", "Naturwissenschaften"],
      "NW1": ["NW1", "BI1", "CH1", "PH1"],
      "NW2": ["NW2", "BI2", "CH2", "PH2"],
      "GE": ["GE", "Geschichte"],
      "GE1": ["GE1"],
      "GE2": ["GE2"],
      "EK": ["EK", "Erdkunde", "Geografie"],
      "EK1": ["EK1"],
      "EK2": ["EK2"],
      "SP": ["SP", "Sport"],
      "SP1": ["SP1"],
      "SP2": ["SP2"],
      "KU": ["KU", "Kunst"],
      "KU1": ["KU1"],
      "KU2": ["KU2"],
      "MU": ["MU", "Musik"],
      "MU1": ["MU1"],
      "MU2": ["MU2"],
      "KR": ["KR", "katholische Religion"],
      "KR1": ["KR1"],
      "KR2": ["KR2"],
      "ER": ["ER", "evangelische Religion"],
      "ER1": ["ER1"],
      "ER2": ["ER2"]
    };
    if (subjectAliases[semesterName]) {
      for (const alias of subjectAliases[semesterName]) {
        const found = subjects2.find((s) => s.shortName === alias);
        if (found) return found;
      }
    }
    if (subjectAliases[baseName]) {
      for (const alias of subjectAliases[baseName]) {
        const found = subjects2.find((s) => s.shortName === alias);
        if (found) return found;
      }
    }
    return subjects2.find((s) => s.shortName === semesterName) || subjects2.find((s) => s.shortName === baseName);
  };
  const findQualifiedTeacher = (baseSubject, teachers2, teacherWorkloads, semesterHours) => {
    const subjectMappings2 = {
      "D": ["D", "DE", "Deutsch"],
      "M": ["M", "MA", "Mathe", "Mathematik"],
      "E": ["E", "EN", "Englisch", "English"],
      "L": ["L", "F", "FS", "Franz\xF6sisch", "Latein"],
      "NW": ["NW", "BI", "BIO", "CH", "Chemie", "PH", "Physik"],
      "GE": ["GE", "Geschichte"],
      "EK": ["EK", "Erdkunde", "Geografie"],
      "PK": ["PK", "Politik", "SW", "Sozialwissenschaften"],
      "SP": ["SP", "Sport"],
      "KU": ["KU", "Kunst"],
      "MU": ["MU", "Musik"],
      "TC": ["TC", "Technik", "Tx"],
      "KR": ["KR"],
      // Only exact match for religion
      "ER": ["ER"]
      // Only exact match for religion
    };
    const possibleSubjects = subjectMappings2[baseSubject] || [baseSubject];
    const qualifiedTeacher = teachers2.find((teacher) => {
      const currentWorkload = teacherWorkloads.get(teacher.id) || 0;
      const totalHoursNeeded = currentWorkload + semesterHours * 2;
      if (totalHoursNeeded > parseFloat(teacher.maxHours)) {
        console.log(`    WORKLOAD LIMIT: ${teacher.shortName} (${totalHoursNeeded.toFixed(1)}h > ${teacher.maxHours}h)`);
        return false;
      }
      if ((baseSubject === "KR" || baseSubject === "ER") && teacher.shortName === "BEU") {
        console.log(`    BLOCKED: ${teacher.shortName} cannot teach ${baseSubject} (only E, GE, EK)`);
        return false;
      }
      return teacher.subjects.some((teacherSubjectStr) => {
        const teacherSubjects = teacherSubjectStr.split(/[,;]/).map((s) => s.trim());
        return teacherSubjects.some((sub) => {
          return possibleSubjects.some((possible) => {
            return sub.toUpperCase() === possible.toUpperCase();
          });
        });
      });
    });
    return qualifiedTeacher;
  };
  app2.post("/api/optimize", async (req, res) => {
    try {
      const teachers2 = await storage.getTeachers();
      const classes2 = await storage.getClasses();
      const subjects2 = await storage.getSubjects();
      const existingAssignments = await storage.getAssignments();
      await Promise.all(existingAssignments.map((a) => storage.deleteAssignment(a.id)));
      let createdAssignments = 0;
      const assignmentPromises = [];
      const teacherWorkloads = /* @__PURE__ */ new Map();
      teachers2.forEach((teacher) => {
        teacherWorkloads.set(teacher.id, 0);
      });
      console.log("=== SEMESTER-BASED OPTIMIZATION STARTING ===");
      console.log(`Teachers: ${teachers2.length}, Classes: ${classes2.length}, Subjects: ${subjects2.length}`);
      const semesterSubjects = {
        "D": { semesters: ["D1", "D2"], hours: 4 },
        "M": { semesters: ["M1", "M2"], hours: 4 },
        "E": { semesters: ["E1", "E2"], hours: 4 },
        "L": { semesters: ["L1", "L2"], hours: 3 },
        // Second language (French/Latin)
        "NW": { semesters: ["NW1", "NW2"], hours: 2 },
        // Natural Sciences
        "GE": { semesters: ["GE1", "GE2"], hours: 2 },
        // History
        "EK": { semesters: ["EK1", "EK2"], hours: 1 },
        // Geography
        "PK": { semesters: ["PK1", "PK2"], hours: 2 },
        // Politics
        "SP": { semesters: ["SP1", "SP2"], hours: 3 },
        // Sports
        "KU": { semesters: ["KU1", "KU2"], hours: 2 },
        // Art
        "MU": { semesters: ["MU1", "MU2"], hours: 2 },
        // Music
        "TC": { semesters: ["TC1", "TC2"], hours: 2 },
        // Technology
        "KR": { semesters: ["KR1", "KR2"], hours: 2 },
        // Catholic Religion
        "ER": { semesters: ["ER1", "ER2"], hours: 2 }
        // Protestant Religion
      };
      for (const classData of classes2) {
        let gradeSubjects = [];
        if (classData.grade >= 5 && classData.grade <= 10) {
          gradeSubjects = ["D", "M", "E", "SP"];
          if (classData.grade >= 6) {
            gradeSubjects.push("NW", "GE", "MU", "KU");
          }
          if (classData.grade >= 7) {
            gradeSubjects.push("L", "TC", "KR");
          }
          if (classData.grade >= 8) {
            gradeSubjects.push("EK", "PK");
          }
        }
        for (const baseSubject of gradeSubjects) {
          if (semesterSubjects[baseSubject]) {
            const teacherPool = teachers2.filter(
              (t) => !(t.shortName === "BEU" && (baseSubject === "KR" || baseSubject === "ER"))
            );
            const semesterHours = semesterSubjects[baseSubject].hours;
            const qualifiedTeacher = findQualifiedTeacher(baseSubject, teacherPool, teacherWorkloads, semesterHours);
            if (qualifiedTeacher) {
              const hoursForBothSemesters = semesterHours * 2;
              const currentWorkload = teacherWorkloads.get(qualifiedTeacher.id) || 0;
              teacherWorkloads.set(qualifiedTeacher.id, currentWorkload + hoursForBothSemesters);
              console.log(`  ${baseSubject}: ${qualifiedTeacher.shortName} (${currentWorkload + hoursForBothSemesters}h / ${qualifiedTeacher.maxHours}h)`);
              for (let semester = 1; semester <= 2; semester++) {
                const semesterSubjectName = semesterSubjects[baseSubject].semesters[semester - 1];
                let subject = findSubjectByName(subjects2, semesterSubjectName, baseSubject);
                if (subject) {
                  const assignmentPromise = storage.createAssignment({
                    teacherId: qualifiedTeacher.id,
                    classId: classData.id,
                    subjectId: subject.id,
                    hoursPerWeek: semesterSubjects[baseSubject].hours.toString(),
                    semester: semester === 1 ? "1" : "2",
                    isOptimized: true
                  });
                  assignmentPromises.push(assignmentPromise);
                  createdAssignments++;
                } else {
                  console.log(`    Warning: Subject ${semesterSubjectName}/${baseSubject} not found in database`);
                }
              }
            } else {
              console.log(`  ${baseSubject}: No qualified teacher found`);
              let fallbackTeacher = null;
              const subjectMappings2 = {
                "D": ["D", "DE", "Deutsch"],
                "M": ["M", "MA", "Mathe", "Mathematik"],
                "E": ["E", "EN", "Englisch", "English"],
                "L": ["L", "F", "FR", "LA", "FS", "Franz\xF6sisch", "Latein", "Fremdsprache"],
                "PK": ["PK", "SW", "Politik", "Sozialwissenschaften"],
                "TC": ["TC", "TX", "Technik"],
                "NW": ["NW", "BI", "BIO", "CH", "PH", "Naturwissenschaften"],
                "GE": ["GE", "Geschichte"],
                "EK": ["EK", "Erdkunde", "Geografie"],
                "SP": ["SP", "Sport"],
                "KU": ["KU", "Kunst"],
                "MU": ["MU", "Musik"],
                "KR": ["KR", "katholische Religion"],
                "ER": ["ER", "evangelische Religion"]
              };
              for (const teacher of teachers2) {
                const currentWorkload = teacherWorkloads.get(teacher.id) || 0;
                const totalHoursNeeded = currentWorkload + semesterHours * 2;
                if (totalHoursNeeded <= parseFloat(teacher.maxHours)) {
                  const subjectAliases = subjectMappings2[baseSubject] || [baseSubject];
                  const canTeach = teacher.subjects.some((subj) => {
                    return subjectAliases.some(
                      (alias) => subj.toUpperCase().includes(alias.toUpperCase()) || alias.toUpperCase().includes(subj.toUpperCase())
                    );
                  });
                  if (canTeach) {
                    fallbackTeacher = teacher;
                    break;
                  }
                }
              }
              if (fallbackTeacher) {
                console.log(`    SMART FALLBACK: Assigned to ${fallbackTeacher.shortName} (${fallbackTeacher.firstName} ${fallbackTeacher.lastName})`);
                console.log(`    Teacher subjects: ${fallbackTeacher.subjects.join(", ")}`);
                console.log(`    Workload check: ${(teacherWorkloads.get(fallbackTeacher.id) || 0) + semesterHours * 2}h <= ${fallbackTeacher.maxHours}h`);
                const hoursForBothSemesters = semesterHours * 2;
                const currentWorkload = teacherWorkloads.get(fallbackTeacher.id) || 0;
                teacherWorkloads.set(fallbackTeacher.id, currentWorkload + hoursForBothSemesters);
                for (let semester = 1; semester <= 2; semester++) {
                  const semesterSubjectName = semesterSubjects[baseSubject].semesters[semester - 1];
                  let subject = findSubjectByName(subjects2, semesterSubjectName, baseSubject);
                  if (subject) {
                    const assignmentPromise = storage.createAssignment({
                      teacherId: fallbackTeacher.id,
                      classId: classData.id,
                      subjectId: subject.id,
                      hoursPerWeek: semesterSubjects[baseSubject].hours.toString(),
                      semester: semester === 1 ? "1" : "2",
                      isOptimized: true
                    });
                    assignmentPromises.push(assignmentPromise);
                    createdAssignments++;
                  }
                }
              } else {
                console.log(`    ERROR: No suitable teacher found for ${baseSubject} in class ${classData.name} - assignment skipped`);
              }
            }
          }
        }
      }
      await Promise.all(assignmentPromises);
      res.json({
        message: "Optimization completed successfully",
        optimizedAssignments: createdAssignments
      });
    } catch (error) {
      console.error("Optimization error:", error);
      res.status(500).json({ error: "Failed to run optimization" });
    }
  });
  app2.get("/api/school-years/validate-transition/:fromSchoolYearId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const fromSchoolYearIdSchema = z2.string().uuid("Ung\xFCltige Schuljahr-ID");
      const fromSchoolYearId = fromSchoolYearIdSchema.parse(req.params.fromSchoolYearId);
      const rawValidation = await storage.validateSchoolYearTransition(fromSchoolYearId);
      const [allStudents, classes2] = await Promise.all([
        storage.getStudentsBySchoolYear(fromSchoolYearId),
        storage.getClassesBySchoolYear(fromSchoolYearId)
      ]);
      const graduatingClasses = classes2.filter((c) => c.grade === 10).length;
      const validation = {
        valid: rawValidation.valid,
        errors: rawValidation.errors,
        warnings: rawValidation.warnings,
        statistics: {
          totalClasses: rawValidation.statistics.totalClasses,
          totalStudents: allStudents.length,
          totalTeachers: rawValidation.statistics.totalTeachers,
          totalAssignments: rawValidation.statistics.totalAssignments,
          graduatingClasses
        }
      };
      res.json(validation);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(422).json({
          error: "Ung\xFCltige Parameter",
          details: error.errors
        });
      }
      console.error("Error validating school year transition:", error);
      if (error instanceof Error && error.message.includes("nicht gefunden")) {
        return res.status(404).json({ error: "Schuljahr nicht gefunden" });
      }
      res.status(500).json({ error: "Fehler bei der Validierung des Schuljahreswechsels" });
    }
  });
  app2.post("/api/school-years/preview-transition", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const previewRequestSchema = z2.object({
        fromSchoolYearId: z2.string().uuid("Ung\xFCltige Schuljahr-ID f\xFCr Ausgangsjahr"),
        toSchoolYearName: z2.string().min(1, "Zielschuljahr-Name ist erforderlich").max(50, "Name zu lang"),
        params: z2.object({
          newClasses: z2.array(z2.object({
            name: z2.string().min(1, "Klassenname erforderlich").max(10, "Klassenname zu lang"),
            grade: z2.number().int().min(5, "Mindestklasse 5").max(10, "H\xF6chstklasse 10"),
            expectedStudentCount: z2.number().int().min(1, "Mindestens 1 Sch\xFCler").max(35, "Maximal 35 Sch\xFCler")
          })).min(1, "Mindestens eine neue Klasse erforderlich"),
          migrationRules: z2.object({
            autoMigrateContinuousSubjects: z2.boolean().optional().default(true),
            handleDifferenzierung: z2.boolean().optional().default(true),
            archiveGraduatedClasses: z2.boolean().optional().default(true),
            preserveInactiveTeachers: z2.boolean().optional().default(false),
            createMissingSubjects: z2.boolean().optional().default(false)
          }).optional().default({})
        })
      });
      const { fromSchoolYearId, toSchoolYearName, params } = previewRequestSchema.parse(req.body);
      const rawPreview = await storage.previewSchoolYearTransition(fromSchoolYearId, toSchoolYearName);
      const [teachers2, subjects2, classes2] = await Promise.all([
        storage.getTeachers(),
        storage.getSubjects(),
        storage.getClassesBySchoolYear(fromSchoolYearId)
      ]);
      const preview = {
        success: true,
        preview: {
          newClasses: params.newClasses,
          migratedAssignments: rawPreview.assignmentMigrations.map((am) => {
            const teacher = teachers2.find((t) => t.id === am.assignment.teacherId);
            const subject = subjects2.find((s) => s.id === am.assignment.subjectId);
            const fromClass = classes2.find((c) => c.id === am.assignment.classId);
            let toClassName = "Abschluss";
            if (am.targetGrade && am.targetGrade <= 10) {
              const currentGrade = fromClass?.grade || 5;
              const classSuffix = fromClass?.name.slice(-1) || "a";
              toClassName = `${am.targetGrade}${classSuffix}`;
            }
            return {
              teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "Unbekannter Lehrer",
              subject: subject?.shortName || subject?.name || "Unbekanntes Fach",
              fromClass: fromClass?.name || "Unbekannte Klasse",
              toClass: toClassName,
              status: am.status === "auto_migrate" ? "auto" : am.status === "manual_check" ? "manual_check" : "skip"
            };
          }),
          archivedClasses: rawPreview.classTransitions.filter((ct) => ct.action === "graduate").map((ct) => ({
            name: ct.from.name,
            studentCount: ct.studentCount
          })),
          migratedStudents: rawPreview.classTransitions.filter((ct) => ct.action === "migrate").reduce((sum, ct) => sum + ct.studentCount, 0),
          statistics: {
            classesCreated: params.newClasses.length + rawPreview.statistics.continuingClasses,
            assignmentsMigrated: rawPreview.statistics.autoMigrations,
            studentsArchived: rawPreview.classTransitions.filter((ct) => ct.action === "graduate").reduce((sum, ct) => sum + ct.studentCount, 0),
            studentsMigrated: rawPreview.classTransitions.filter((ct) => ct.action === "migrate").reduce((sum, ct) => sum + ct.studentCount, 0)
          }
        }
      };
      res.json(preview);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(422).json({
          error: "Ung\xFCltige Eingabedaten",
          details: error.errors
        });
      }
      console.error("Error creating school year transition preview:", error);
      if (error instanceof Error && error.message.includes("nicht gefunden")) {
        return res.status(404).json({ error: "Schuljahr nicht gefunden" });
      }
      if (error instanceof Error && error.message.includes("bereits")) {
        return res.status(409).json({ error: "Schuljahr existiert bereits" });
      }
      res.status(500).json({ error: "Fehler bei der Erstellung der \xDCbergangs-Vorschau" });
    }
  });
  app2.post("/api/school-years/execute-transition", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const executeRequestSchema = z2.object({
        fromSchoolYearId: z2.string().uuid("Ung\xFCltige Schuljahr-ID f\xFCr Ausgangsjahr"),
        toSchoolYearName: z2.string().min(1, "Zielschuljahr-Name ist erforderlich").max(50, "Name zu lang"),
        params: z2.object({
          newClasses: z2.array(z2.object({
            name: z2.string().min(1, "Klassenname erforderlich").max(10, "Klassenname zu lang").regex(/^[0-9]+[a-zA-Z]$/, "Format: z.B. '5a', '6b'"),
            grade: z2.number().int().min(5, "Mindestklasse 5").max(10, "H\xF6chstklasse 10"),
            expectedStudentCount: z2.number().int().min(1, "Mindestens 1 Sch\xFCler").max(35, "Maximal 35 Sch\xFCler")
          })).min(1, "Mindestens eine neue Klasse erforderlich"),
          migrationRules: z2.object({
            autoMigrateContinuousSubjects: z2.boolean().optional().default(true),
            handleDifferenzierung: z2.boolean().optional().default(true),
            archiveGraduatedClasses: z2.boolean().optional().default(true),
            preserveInactiveTeachers: z2.boolean().optional().default(false),
            createMissingSubjects: z2.boolean().optional().default(false)
          }).optional().default({})
        })
      });
      const { fromSchoolYearId, toSchoolYearName, params } = executeRequestSchema.parse(req.body);
      const validatedParams = params;
      const validation = await storage.validateSchoolYearTransition(fromSchoolYearId);
      if (!validation.valid) {
        return res.status(422).json({
          error: "Schuljahreswechsel-Validierung fehlgeschlagen",
          details: validation.errors,
          warnings: validation.warnings
        });
      }
      const rawResult = await storage.executeSchoolYearTransition(
        fromSchoolYearId,
        toSchoolYearName,
        validatedParams
      );
      if (!rawResult.success) {
        return res.status(500).json({
          error: "Schuljahreswechsel fehlgeschlagen",
          details: rawResult.errors
        });
      }
      const result = {
        success: rawResult.success,
        newSchoolYearId: rawResult.newSchoolYear.id,
        statistics: {
          classesCreated: rawResult.createdNewClasses + rawResult.migratedClasses,
          assignmentsMigrated: rawResult.migratedAssignments,
          studentsArchived: validatedParams.newClasses.reduce((sum, nc) => sum + nc.expectedStudentCount, 0),
          // Approximation
          studentsMigrated: rawResult.migratedStudents
        },
        warnings: [],
        // TODO: Add warnings from transition process
        errors: rawResult.errors
      };
      res.json(result);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(422).json({
          error: "Ung\xFCltige Eingabedaten",
          details: error.errors
        });
      }
      console.error("Error executing school year transition:", error);
      if (error instanceof Error && error.message.includes("nicht gefunden")) {
        return res.status(404).json({ error: "Schuljahr nicht gefunden" });
      }
      if (error instanceof Error && error.message.includes("bereits")) {
        return res.status(409).json({ error: "Schuljahr existiert bereits" });
      }
      if (error instanceof Error && error.message.includes("Validierung")) {
        return res.status(422).json({ error: "Validierungsfehler", details: error.message });
      }
      res.status(500).json({ error: "Fehler bei der Ausf\xFChrung des Schuljahreswechsels" });
    }
  });
  app2.post("/api/import/lesson-distribution-validated", upload.single("file"), isAuthenticated, isAdmin, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }
      const filePath = `/tmp/lesson-distribution-validated-${Date.now()}.xlsx`;
      const fs2 = await import("fs/promises");
      await fs2.writeFile(filePath, req.file.buffer);
      console.log("=== VALIDIERTER IMPORT GESTARTET ===");
      console.log("Datei:", filePath);
      const schoolYears2 = await storage.getSchoolYears();
      const currentSchoolYear = schoolYears2.find((sy) => sy.isCurrent) || schoolYears2[0];
      if (!currentSchoolYear) {
        return res.status(400).json({ error: "Kein Schuljahr gefunden" });
      }
      const importer = new LessonDistributionImporter(storage);
      const result = await importer.importFromExcelValidated(filePath, currentSchoolYear.id);
      await fs2.unlink(filePath);
      console.log("=== VALIDIERTER IMPORT ABGESCHLOSSEN ===");
      console.log("Ergebnis:", result);
      res.json(result);
    } catch (error) {
      console.error("Fehler beim validierten Import:", error);
      res.status(500).json({
        error: "Import fehlgeschlagen",
        details: error instanceof Error ? error.message : "Unbekannter Fehler"
      });
    }
  });
  app2.post("/api/import/lesson-distribution", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { filePath, schoolYearId } = req.body;
      if (!filePath || !schoolYearId) {
        return res.status(400).json({
          error: "Datei-Pfad und Schuljahr-ID sind erforderlich"
        });
      }
      const { LessonDistributionImporter: LessonDistributionImporter2 } = await Promise.resolve().then(() => (init_lesson_distribution_importer(), lesson_distribution_importer_exports));
      const importer = new LessonDistributionImporter2(storage);
      const result = await importer.importFromExcel(filePath, schoolYearId);
      if (result.success) {
        res.json({
          success: true,
          message: `Import erfolgreich: ${result.imported.teachers} Lehrer, ${result.imported.subjects} F\xE4cher, ${result.imported.classes} Klassen, ${result.imported.assignments} Zuweisungen`,
          imported: result.imported,
          warnings: result.warnings
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Import fehlgeschlagen",
          errors: result.errors,
          warnings: result.warnings
        });
      }
    } catch (error) {
      console.error("Error importing lesson distribution:", error);
      res.status(500).json({
        error: "Fehler beim Import der Unterrichtsverteilung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler"
      });
    }
  });
  app2.post("/api/import/lesson-distribution/pdf-preview", upload.single("file"), isAuthenticated, isAdmin, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Keine Datei hochgeladen" });
      }
      const { schoolYearId } = req.body;
      if (!schoolYearId) {
        return res.status(400).json({ error: "Schuljahr-ID erforderlich" });
      }
      if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({ error: "Nur PDF-Dateien sind erlaubt" });
      }
      const parser = new PdfLessonParser();
      const importer = new PdfLessonImporter(storage, parser);
      const preview = await importer.previewImport(req.file.buffer, schoolYearId);
      res.json({
        success: true,
        preview
      });
    } catch (error) {
      console.error("Error previewing PDF import:", error);
      res.status(500).json({
        error: "Fehler beim Vorschau der PDF-Stundenverteilung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler"
      });
    }
  });
  app2.post("/api/import/lesson-distribution/pdf-apply", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { lessons, resolutions, schoolYearId } = req.body;
      if (!lessons || !schoolYearId) {
        return res.status(400).json({ error: "Lessons und Schuljahr-ID erforderlich" });
      }
      const parser = new PdfLessonParser();
      const importer = new PdfLessonImporter(storage, parser);
      const result = await importer.applyImport(lessons, resolutions || {}, schoolYearId);
      res.json({
        success: true,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors
      });
    } catch (error) {
      console.error("Error applying PDF import:", error);
      res.status(500).json({
        error: "Fehler beim Import der PDF-Stundenverteilung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler"
      });
    }
  });
  app2.get("/api/subject-mappings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const mappings = await intelligentMappingService.getAllMappings();
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching subject mappings:", error);
      res.status(500).json({ error: "Failed to fetch subject mappings" });
    }
  });
  app2.post("/api/subject-mappings/resolve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { pdfSubjectName, selectedSubjectId } = req.body;
      if (!pdfSubjectName || !selectedSubjectId) {
        return res.status(400).json({ error: "PDF subject name and selected subject ID are required" });
      }
      const mapping = await intelligentMappingService.resolveConflict(pdfSubjectName, selectedSubjectId);
      res.json(mapping);
    } catch (error) {
      console.error("Error resolving subject mapping conflict:", error);
      res.status(500).json({
        error: "Failed to resolve subject mapping conflict",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.delete("/api/subject-mappings/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await intelligentMappingService.deleteMapping(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting subject mapping:", error);
      res.status(500).json({
        error: "Failed to delete subject mapping",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/school-years", async (req, res) => {
    try {
      const schoolYears2 = await storage.getSchoolYears();
      res.json(schoolYears2);
    } catch (error) {
      console.error("Error fetching school years:", error);
      res.status(500).json({ error: "Failed to fetch school years" });
    }
  });
  app2.get("/api/school-years/current", async (req, res) => {
    try {
      const currentSchoolYear = await storage.getCurrentSchoolYear();
      if (!currentSchoolYear) {
        return res.status(404).json({ error: "Kein aktuelles Schuljahr gefunden" });
      }
      res.json(currentSchoolYear);
    } catch (error) {
      console.error("Error fetching current school year:", error);
      res.status(500).json({ error: "Failed to fetch current school year" });
    }
  });
  app2.get("/api/pdf-imports", isAuthenticated, async (req, res) => {
    try {
      const pdfImports2 = await storage.getPdfImports();
      res.json(pdfImports2);
    } catch (error) {
      console.error("Error fetching PDF imports:", error);
      res.status(500).json({ error: "Failed to fetch PDF imports" });
    }
  });
  app2.post("/api/pdf-imports", isAuthenticated, upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "PDF file is required" });
      }
      const userId = req.user?.claims.sub;
      const pdfImportData = insertPdfImportSchema.parse({
        fileName: req.file.originalname,
        fileHash: createHash("sha256").update(req.file.buffer).digest("hex"),
        uploadedBy: userId,
        pageCount: 0,
        // Will be updated after processing
        metadata: {}
      });
      const pdfImport = await storage.createPdfImport(pdfImportData);
      res.status(201).json(pdfImport);
    } catch (error) {
      console.error("Error creating PDF import:", error);
      res.status(500).json({ error: "Failed to create PDF import" });
    }
  });
  app2.get("/api/pdf-tables", isAuthenticated, async (req, res) => {
    try {
      const pdfTables2 = await storage.getPdfTables();
      res.json(pdfTables2);
    } catch (error) {
      console.error("Error fetching PDF tables:", error);
      res.status(500).json({ error: "Failed to fetch PDF tables" });
    }
  });
  app2.post("/api/pdf-tables", isAuthenticated, async (req, res) => {
    try {
      const pdfTableData = insertPdfTableSchema.parse(req.body);
      const pdfTable = await storage.createPdfTable(pdfTableData);
      res.status(201).json(pdfTable);
    } catch (error) {
      console.error("Error creating PDF table:", error);
      res.status(500).json({ error: "Failed to create PDF table" });
    }
  });
  app2.put("/api/pdf-tables/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = insertPdfTableSchema.partial().parse(req.body);
      const updatedTable = await storage.updatePdfTable(id, updateData);
      res.json(updatedTable);
    } catch (error) {
      console.error("Error updating PDF table:", error);
      res.status(500).json({ error: "Failed to update PDF table" });
    }
  });
  app2.delete("/api/pdf-tables/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePdfTable(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting PDF table:", error);
      res.status(500).json({ error: "Failed to delete PDF table" });
    }
  });
  app2.get("/api/pdf-imports/:id/tables", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const tables = await storage.getPdfTablesByImport(id);
      res.json(tables);
    } catch (error) {
      console.error("Error fetching tables for PDF import:", error);
      res.status(500).json({ error: "Failed to fetch tables for PDF import" });
    }
  });
  app2.post("/api/chatgpt/parse-schedule", isAuthenticated, async (req, res) => {
    try {
      const { scheduleText } = req.body;
      if (!scheduleText || typeof scheduleText !== "string") {
        return res.status(400).json({ error: "scheduleText is required and must be a string" });
      }
      const parsedData = await openaiScheduleService.parseScheduleText(scheduleText);
      res.json(parsedData);
    } catch (error) {
      console.error("Error parsing schedule with ChatGPT:", error);
      res.status(500).json({ error: "Failed to parse schedule: " + error.message });
    }
  });
  app2.post("/api/chatgpt/import-schedule", isAuthenticated, async (req, res) => {
    try {
      const { scheduleText } = req.body;
      if (!scheduleText || typeof scheduleText !== "string") {
        return res.status(400).json({ error: "scheduleText is required and must be a string" });
      }
      const parsedData = await openaiScheduleService.parseScheduleText(scheduleText);
      const importResult = await openaiScheduleService.importParsedData(parsedData);
      res.json({
        message: "Schedule import completed",
        results: importResult,
        parsedData
      });
    } catch (error) {
      console.error("Error importing schedule with ChatGPT:", error);
      res.status(500).json({ error: "Failed to import schedule: " + error.message });
    }
  });
  app2.post("/api/chatgpt/import-structured", isAuthenticated, async (req, res) => {
    try {
      const parsedData = req.body;
      if (!parsedData || typeof parsedData !== "object") {
        return res.status(400).json({ error: "Structured data is required" });
      }
      if (!parsedData.teachers || !Array.isArray(parsedData.teachers)) {
        return res.status(400).json({ error: "teachers array is required" });
      }
      if (!parsedData.classes || !Array.isArray(parsedData.classes)) {
        return res.status(400).json({ error: "classes array is required" });
      }
      if (!parsedData.subjects || !Array.isArray(parsedData.subjects)) {
        return res.status(400).json({ error: "subjects array is required" });
      }
      if (!parsedData.assignments || !Array.isArray(parsedData.assignments)) {
        return res.status(400).json({ error: "assignments array is required" });
      }
      const importResult = await openaiScheduleService.importParsedData(parsedData);
      res.json(importResult);
    } catch (error) {
      console.error("Error importing structured schedule data:", error);
      res.status(500).json({ error: "Failed to import structured data: " + error.message });
    }
  });
  app2.post("/api/help/ask", isAuthenticated, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "question is required and must be a string" });
      }
      const answer = await openaiHelpService.getHelpResponse(question);
      res.json({ answer });
    } catch (error) {
      console.error("Error getting help response:", error);
      res.status(500).json({ error: "Failed to get help response: " + error.message });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  app.use(/^\/api\//, (req, res, next) => {
    res.set("X-Api-Gate", "1");
    return next();
  });
  const server = await registerRoutes(app);
  app.get("/api/__debug/routes", (_req, res) => {
    res.json({
      message: "Routes registered",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      registered: ["POST /api/calculate-planstellen", "GET /api/planstellen", "etc..."]
    });
  });
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  app.all(/^\/api\//, (_req, res) => res.status(404).json({ error: "API Route Not Found" }));
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
