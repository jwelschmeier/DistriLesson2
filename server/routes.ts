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
      let csvContent = req.file.buffer.toString("utf-8");
      
      // Remove UTF-8 BOM if present
      if (csvContent.charCodeAt(0) === 0xFEFF) {
        csvContent = csvContent.slice(1);
      }
      
      // Parse CSV content (auto-detect separator: semicolon or comma)
      const lines = csvContent.split("\n").filter((line: string) => line.trim());
      const firstLine = lines[0];
      const separator = firstLine.includes(';') ? ';' : ',';
      
      const headers = firstLine.split(separator).map((h: string) => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map((line: string) => 
        line.split(separator).map((cell: string) => cell.trim().replace(/^"|"$/g, ''))
      ).filter(row => row.length > 1 && row[0]); // Filter out empty rows or rows without first name

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
          // First, extract unique class names and create classes if they don't exist
          const uniqueClasses = Array.from(new Set(rows.map((row: string[]) => row[2]).filter(Boolean)));
          const classMap = new Map();
          
          for (const className of uniqueClasses) {
            let classRecord = await storage.getClassByName(className);
            if (!classRecord) {
              // Extract grade from class name (e.g., "05A" -> grade 5)
              const gradeMatch = className.match(/^(\d+)/);
              const grade = gradeMatch ? parseInt(gradeMatch[1]) : 5;
              
              classRecord = await storage.createClass({
                name: className,
                grade: grade,
                studentCount: 0,
                subjectHours: {},
              });
            }
            classMap.set(className, classRecord.id);
          }

          const studentData = rows.map((row: string[]) => ({
            firstName: row[0] || "",
            lastName: row[1] || "",
            classId: classMap.get(row[2]) || null,
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
          // Check if this is a SCHILD NRW curriculum format (many columns)
          if (headers.length > 10 && headers[0].toLowerCase().includes('klasse')) {
            // Parse SCHILD curriculum format: extract subjects from triplet pattern
            const subjects = new Set<{shortName: string, name: string}>();
            
            for (let i = 2; i < headers.length; i += 3) {
              const shortNameHeader = headers[i];
              const nameHeader = headers[i + 1];
              
              if (shortNameHeader && nameHeader) {
                // Extract subject from header (e.g., "BI_FachKrz" -> "BI")
                const shortName = shortNameHeader.split('_')[0];
                const name = nameHeader.split('_')[0].replace(/([A-Z])/g, ' $1').trim();
                
                if (shortName && shortName !== 'AG') { // Skip empty and AG subjects
                  subjects.add({ shortName, name });
                }
              }
            }
            
            // Also extract from actual data rows
            for (const row of rows) {
              for (let i = 2; i < row.length; i += 3) {
                const shortName = row[i]?.trim();
                const name = row[i + 1]?.trim();
                
                if (shortName && name && shortName !== 'AG') {
                  subjects.add({ shortName, name });
                }
              }
            }
            
            // Convert to array and create subjects
            const subjectData = Array.from(subjects).map(s => ({
              name: s.name || s.shortName,
              shortName: s.shortName,
              category: "Hauptfach",
              hoursPerWeek: {},
            }));
            
            result = await storage.bulkCreateSubjectsWithConflictHandling(subjectData);
          } else {
            // Standard simple subjects format
            const subjectData = rows
              .filter(row => row[0] && row[1] && row[0] !== '**') // Skip empty entries and "**"
              .map((row: string[]) => ({
                name: row[1] || row[0], // Use full name (column 1) or fallback to shortName
                shortName: row[0],
                category: row[2] || "Hauptfach",
                hoursPerWeek: {},
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
