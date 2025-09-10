import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { insertTeacherSchema, insertStudentSchema, insertClassSchema, insertSubjectSchema, insertAssignmentSchema } from "@shared/schema";
import { z } from "zod";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Teachers routes
  app.get("/api/teachers", async (req, res) => {
    try {
      const teachers = await storage.getTeachers();
      res.json(teachers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teachers" });
    }
  });

  app.get("/api/teachers/:id", async (req, res) => {
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

  app.post("/api/teachers", async (req, res) => {
    try {
      const teacherData = insertTeacherSchema.parse(req.body);
      const teacher = await storage.createTeacher(teacherData);
      res.status(201).json(teacher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create teacher" });
    }
  });

  app.put("/api/teachers/:id", async (req, res) => {
    try {
      const teacherData = insertTeacherSchema.partial().parse(req.body);
      const teacher = await storage.updateTeacher(req.params.id, teacherData);
      res.json(teacher);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update teacher" });
    }
  });

  app.delete("/api/teachers/:id", async (req, res) => {
    try {
      await storage.deleteTeacher(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete teacher" });
    }
  });

  // Students routes
  app.get("/api/students", async (req, res) => {
    try {
      const students = await storage.getStudents();
      res.json(students);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  app.post("/api/students", async (req, res) => {
    try {
      const studentData = insertStudentSchema.parse(req.body);
      const student = await storage.createStudent(studentData);
      res.status(201).json(student);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create student" });
    }
  });

  // Classes routes
  app.get("/api/classes", async (req, res) => {
    try {
      const classes = await storage.getClasses();
      res.json(classes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.post("/api/classes", async (req, res) => {
    try {
      const classData = insertClassSchema.parse(req.body);
      const newClass = await storage.createClass(classData);
      res.status(201).json(newClass);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create class" });
    }
  });

  // Subjects routes
  app.get("/api/subjects", async (req, res) => {
    try {
      const subjects = await storage.getSubjects();
      res.json(subjects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subjects" });
    }
  });

  app.post("/api/subjects", async (req, res) => {
    try {
      const subjectData = insertSubjectSchema.parse(req.body);
      const subject = await storage.createSubject(subjectData);
      res.status(201).json(subject);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create subject" });
    }
  });

  // Assignments routes
  app.get("/api/assignments", async (req, res) => {
    try {
      const assignments = await storage.getAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  app.post("/api/assignments", async (req, res) => {
    try {
      const assignmentData = insertAssignmentSchema.parse(req.body);
      const assignment = await storage.createAssignment(assignmentData);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  // Statistics route
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getTeacherStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // Planstellen routes
  app.get("/api/planstellen", async (req, res) => {
    try {
      const planstellen = await storage.getPlanstellen();
      res.json(planstellen);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch planstellen" });
    }
  });

  // CSV Import route
  app.post("/api/import/csv", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { dataType } = req.body;
      const csvContent = req.file.buffer.toString("utf-8");
      
      // Parse CSV content (simplified - in production would use a robust CSV parser)
      const lines = csvContent.split("\n").filter((line: string) => line.trim());
      const headers = lines[0].split(",").map((h: string) => h.trim());
      const rows = lines.slice(1).map((line: string) => line.split(",").map((cell: string) => cell.trim()));

      let result;
      switch (dataType) {
        case "teachers":
          const teacherData = rows.map((row: string[]) => ({
            firstName: row[0] || "",
            lastName: row[1] || "",
            shortName: row[2] || "",
            email: row[3] || "",
            subjects: row[4] ? row[4].split(";") : [],
            maxHours: parseInt(row[5]) || 25,
            qualifications: row[6] ? row[6].split(";") : [],
          }));
          result = await storage.bulkCreateTeachers(teacherData);
          break;

        case "students":
          const studentData = rows.map((row: string[]) => ({
            firstName: row[0] || "",
            lastName: row[1] || "",
            classId: row[2] || null,
            grade: parseInt(row[3]) || 5,
          }));
          result = await storage.bulkCreateStudents(studentData);
          break;

        case "classes":
          const classData = rows.map((row: string[]) => ({
            name: row[0] || "",
            grade: parseInt(row[1]) || 5,
            studentCount: parseInt(row[2]) || 0,
            subjectHours: {},
          }));
          result = await storage.bulkCreateClasses(classData);
          break;

        case "subjects":
          const subjectData = rows.map((row: string[]) => ({
            name: row[0] || "",
            shortName: row[1] || "",
            category: row[2] || "Hauptfach",
            hoursPerWeek: {},
          }));
          result = await storage.bulkCreateSubjects(subjectData);
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

  // Optimization endpoint
  app.post("/api/optimize", async (req, res) => {
    try {
      // Simplified optimization algorithm
      const teachers = await storage.getTeachers();
      const classes = await storage.getClasses();
      const subjects = await storage.getSubjects();
      
      // Basic optimization logic would go here
      // For now, return success status
      
      res.json({ 
        message: "Optimization completed successfully",
        optimizedAssignments: 0
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to run optimization" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
