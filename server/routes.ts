import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { insertTeacherSchema, insertStudentSchema, insertClassSchema, insertSubjectSchema, insertAssignmentSchema, insertInvitationSchema, insertPdfImportSchema, insertPdfTableSchema, planstellenInputSchema, Teacher } from "@shared/schema";
import { SchoolYearTransitionParams } from "./storage";
import { calculateCorrectHours } from "@shared/parallel-subjects";
import { LessonDistributionImporter } from "./lesson-distribution-importer";
import { PdfLessonParser } from "./pdf-lesson-parser";
import { PdfLessonImporter } from "./pdf-lesson-importer";
import { intelligentMappingService } from "./intelligent-mapping-service";
import { openaiScheduleService, OpenAIHelpService } from "./openai-service";
import { z } from "zod";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware - setup authentication first
  await setupAuth(app);

  // Initialize OpenAI services
  const openaiHelpService = new OpenAIHelpService();

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
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

  // Invitation management routes (Admin only)
  app.post('/api/admin/invitations', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      console.log(`DEBUG: Creating invitation with userId: ${userId} (type: ${typeof userId})`);
      
      const dataToValidate = {
        ...req.body,
        createdBy: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };
      
      console.log('DEBUG: Data to validate:', JSON.stringify(dataToValidate, null, 2));
      
      const invitationData = insertInvitationSchema.parse(dataToValidate);
      
      const invitation = await storage.createInvitation(invitationData);
      res.status(201).json(invitation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("duplicate key")) {
        return res.status(400).json({ error: "Eine Einladung für diese E-Mail-Adresse existiert bereits" });
      }
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });

  app.get('/api/admin/invitations', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const invitations = await storage.getInvitations();
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.delete('/api/admin/invitations/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteInvitation(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  // Public invitation validation route
  app.get('/api/invitation/:token', async (req, res) => {
    try {
      const invitation = await storage.getInvitationByToken(req.params.token);
      if (!invitation) {
        return res.status(404).json({ error: "Einladung nicht gefunden oder bereits verwendet" });
      }
      
      if (invitation.used) {
        return res.status(400).json({ error: "Diese Einladung wurde bereits verwendet" });
      }
      
      if (invitation.expiresAt < new Date()) {
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

  // Global authentication middleware - protect all API routes except public ones
  app.use('/api', (req, res, next) => {
    const publicRoutes = ['/api/login', '/api/callback', '/api/invitation'];
    const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
    
    if (isPublicRoute) {
      return next();
    }
    
    // DEVELOPMENT BYPASS: Skip authentication in development for testing
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      // Mock authenticated user for development
      if (!req.user) {
        (req as any).user = {
          claims: { sub: 'dev-user-123' },
          role: 'admin'
        };
        (req as any).isAuthenticated = () => true;
      }
      return next();
    }
    
    // Apply authentication to all other API routes in production
    return isAuthenticated(req, res, next);
  });

  // Protected routes - all routes below this point require authentication
  // Teachers routes
  app.get("/api/teachers", async (req, res) => {
    const startTime = Date.now();
    try {
      const teachers = await storage.getTeachers();
      const duration = Date.now() - startTime;
      console.log(`[PERF] Teachers query completed in ${duration}ms`);
      res.json(teachers);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PERF] Teachers query failed after ${duration}ms:`, error);
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
      console.log("PUT /api/teachers/:id - Request body:", JSON.stringify(req.body, null, 2));
      console.log("Teacher ID:", req.params.id);
      
      // Convert string fields to proper types before validation
      const processedData = { ...req.body };
      
      // Convert string numbers to decimal strings for Drizzle
      if (processedData.maxHours && typeof processedData.maxHours === 'string') {
        processedData.maxHours = processedData.maxHours.toString();
      }
      if (processedData.currentHours && typeof processedData.currentHours === 'string') {
        processedData.currentHours = processedData.currentHours.toString();
      }
      
      // Ensure reductionHours is properly formatted
      if (processedData.reductionHours) {
        // Convert any string numbers to actual numbers in reductionHours
        const reductionHours: any = {};
        for (const [key, value] of Object.entries(processedData.reductionHours)) {
          if (value !== null && value !== undefined && value !== '') {
            reductionHours[key] = typeof value === 'string' ? parseFloat(value as string) || 0 : value;
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
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ 
        error: "Failed to update teacher",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.delete("/api/teachers/:id", async (req, res) => {
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
      if (error instanceof Error && error.message.includes("Keine aktuelle Schuljahr gefunden")) {
        return res.status(400).json({ 
          error: "Keine aktuelles Schuljahr konfiguriert",
          details: "Bitte setzen Sie zuerst ein aktuelles Schuljahr über die Schuljahr-Verwaltung."
        });
      }
      res.status(500).json({ error: "Failed to create student" });
    }
  });

  // Classes routes
  app.get("/api/classes", async (req, res) => {
    const startTime = Date.now();
    try {
      const type = req.query.type as string | undefined;
      const classes = await storage.getClassesByType(type);
      const duration = Date.now() - startTime;
      console.log(`[PERF] Classes query completed in ${duration}ms${type ? ` (type: ${type})` : ''}`);
      res.json(classes);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PERF] Classes query failed after ${duration}ms:`, error);
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  });

  app.get("/api/classes/:id", async (req, res) => {
    try {
      const classItem = await storage.getClass(req.params.id);
      if (!classItem) {
        return res.status(404).json({ error: "Klasse nicht gefunden" });
      }
      res.json(classItem);
    } catch (error) {
      console.error("Error fetching class:", error);
      res.status(500).json({ error: "Failed to fetch class" });
    }
  });

  app.post("/api/classes", async (req, res) => {
    try {
      // Allow null values for teacher fields to support "Kein Klassenlehrer" option
      const createClassSchema = insertClassSchema.extend({
        classTeacher1Id: z.string().uuid().nullable().optional(),
        classTeacher2Id: z.string().uuid().nullable().optional(),
      });
      const classData = createClassSchema.parse(req.body);
      const newClass = await storage.createClass(classData);
      res.status(201).json(newClass);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      if (error instanceof Error && error.message.includes("Keine aktuelle Schuljahr gefunden")) {
        return res.status(400).json({ 
          error: "Keine aktuelles Schuljahr konfiguriert",
          details: "Bitte setzen Sie zuerst ein aktuelles Schuljahr über die Schuljahr-Verwaltung."
        });
      }
      res.status(500).json({ error: "Failed to create class" });
    }
  });

  app.put("/api/classes/:id", async (req, res) => {
    try {
      // Create update schema that allows null for teacher fields to enable clearing assignments
      const updateClassSchema = insertClassSchema.partial().extend({
        classTeacher1Id: z.string().uuid().nullable().optional(),
        classTeacher2Id: z.string().uuid().nullable().optional(),
      });
      const classData = updateClassSchema.parse(req.body);
      const updatedClass = await storage.updateClass(req.params.id, classData);
      res.json(updatedClass);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update class" });
    }
  });

  app.delete("/api/classes/:id", async (req, res) => {
    try {
      await storage.deleteClass(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete class" });
    }
  });

  // Grade bulk update validation schema
  const gradeBulkUpdateSchema = z.object({
    grade: z.number().int().min(5).max(10),
    targetHoursTotal: z.string()
      .optional()
      .refine((val) => {
        if (val === undefined || val === "" || val === null) return true;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0 && num <= 100;
      }, { message: "Gesamtstunden müssen zwischen 0 und 100 liegen" }),
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
  });

  app.post("/api/classes/bulk-update-grade", async (req, res) => {
    try {
      // Validate request body
      const validatedData = gradeBulkUpdateSchema.parse(req.body);
      const { grade, targetHoursTotal, targetHoursSemester1, targetHoursSemester2 } = validatedData;
      
      // Get all classes for the specified grade
      const allClasses = await storage.getClasses();
      const classesToUpdate = allClasses.filter(c => c.grade === grade);
      
      if (classesToUpdate.length === 0) {
        return res.status(404).json({ 
          error: `Keine Klassen für Jahrgangsstufe ${grade} gefunden.` 
        });
      }
      
      let updatedCount = 0;
      
      // Update each class in the grade
      for (const classData of classesToUpdate) {
        // Create properly typed update data
        const updateData: Partial<{
          targetHoursTotal: string | null;
          targetHoursSemester1: string | null;
          targetHoursSemester2: string | null;
        }> = {};
        
        // Convert empty strings to null for consistent handling
        if (targetHoursTotal !== undefined) {
          updateData.targetHoursTotal = targetHoursTotal === "" ? null : targetHoursTotal;
        }
        if (targetHoursSemester1 !== undefined) {
          updateData.targetHoursSemester1 = targetHoursSemester1 === "" ? null : targetHoursSemester1;
        }
        if (targetHoursSemester2 !== undefined) {
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Ungültige Eingabedaten", 
          details: error.errors 
        });
      }
      console.error("Error bulk updating classes:", error);
      res.status(500).json({ error: "Failed to bulk update classes" });
    }
  });

  // Alias for frontend compatibility - bulk-edit endpoint
  app.post("/api/classes/bulk-edit", async (req, res) => {
    try {
      // Validate request body
      const validatedData = gradeBulkUpdateSchema.parse(req.body);
      const { grade, targetHoursTotal, targetHoursSemester1, targetHoursSemester2 } = validatedData;
      
      // Get all classes for the specified grade
      const allClasses = await storage.getClasses();
      const classesToUpdate = allClasses.filter(c => c.grade === grade);
      
      if (classesToUpdate.length === 0) {
        return res.status(404).json({ 
          error: `Keine Klassen für Jahrgangsstufe ${grade} gefunden.` 
        });
      }
      
      let updatedCount = 0;
      
      // Update each class in the grade
      for (const classData of classesToUpdate) {
        // Create properly typed update data
        const updateData: Partial<{
          targetHoursTotal: string | null;
          targetHoursSemester1: string | null;
          targetHoursSemester2: string | null;
        }> = {};
        
        // Convert empty strings to null for consistent handling
        if (targetHoursTotal !== undefined) {
          updateData.targetHoursTotal = targetHoursTotal === "" ? null : targetHoursTotal;
        }
        if (targetHoursSemester1 !== undefined) {
          updateData.targetHoursSemester1 = targetHoursSemester1 === "" ? null : targetHoursSemester1;
        }
        if (targetHoursSemester2 !== undefined) {
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Ungültige Eingabedaten", 
          details: error.errors 
        });
      }
      console.error("Error bulk updating classes:", error);
      res.status(500).json({ error: "Failed to bulk update classes" });
    }
  });

  // Subjects routes
  app.get("/api/subjects", async (req, res) => {
    const startTime = Date.now();
    try {
      const subjects = await storage.getSubjects();
      const duration = Date.now() - startTime;
      console.log(`[PERF] Subjects query completed in ${duration}ms`);
      res.json(subjects);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PERF] Subjects query failed after ${duration}ms:`, error);
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

  app.put("/api/subjects/:id", async (req, res) => {
    try {
      const subjectData = insertSubjectSchema.partial().parse(req.body);
      const subject = await storage.updateSubject(req.params.id, subjectData);
      res.json(subject);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update subject" });
    }
  });

  app.delete("/api/subjects/:id", async (req, res) => {
    try {
      await storage.deleteSubject(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete subject" });
    }
  });

  app.post("/api/subjects/cleanup-orphaned", async (req, res) => {
    try {
      await storage.cleanupOrphanedSubjectReferences();
      res.json({ message: "Orphaned subject references cleaned up successfully" });
    } catch (error) {
      console.error("Error cleaning up orphaned subject references:", error);
      res.status(500).json({ error: "Failed to cleanup orphaned subject references" });
    }
  });

  // Initialize default subjects
  app.post("/api/subjects/init-defaults", async (req, res) => {
    try {
      const defaultSubjects = [
        {
          name: "Vertretungsreserve",
          shortName: "VR",
          category: "Sonderbereich",
          hoursPerWeek: {},
        },
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

  // Assignments routes
  app.get("/api/assignments", async (req, res) => {
    const startTime = Date.now();
    try {
      // Optional parameters for filtering
      const semester = req.query.semester as string;
      const classId = req.query.classId as string;
      
      // For performance, return minimal data when explicitly requested
      if (req.query.minimal === 'true') {
        // If classId is provided, use class-specific query for better performance
        if (classId) {
          console.log(`[PERF] Starting class-specific assignments query (class: ${classId}, semester: ${semester})`);
          const assignments = await storage.getAssignmentsByClassAndSemesterMinimal(classId, semester);
          const duration = Date.now() - startTime;
          console.log(`[PERF] Class-specific assignments query completed in ${duration}ms`);
          res.json(assignments);
        } else {
          console.log(`[PERF] Starting minimal assignments query (semester: ${semester})`);
          const assignments = await storage.getAssignmentsMinimal(semester);
          const duration = Date.now() - startTime;
          console.log(`[PERF] Minimal assignments query completed in ${duration}ms`);
          res.json(assignments);
        }
      } else {
        console.log(`[PERF] Starting full assignments query (semester: ${semester})`);
        // Use optimized method with pre-loaded relations for other uses
        const assignments = await storage.getAssignmentsWithRelations(semester);
        const duration = Date.now() - startTime;
        console.log(`[PERF] Full assignments query completed in ${duration}ms`);
        res.json(assignments);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PERF] Assignments query failed after ${duration}ms:`, error);
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
      if (error instanceof Error && error.message.includes("Keine aktuelle Schuljahr gefunden")) {
        return res.status(400).json({ 
          error: "Keine aktuelles Schuljahr konfiguriert",
          details: "Bitte setzen Sie zuerst ein aktuelles Schuljahr über die Schuljahr-Verwaltung."
        });
      }
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  app.put("/api/assignments/:id", async (req, res) => {
    try {
      const assignmentData = insertAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateAssignment(req.params.id, assignmentData);
      res.json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });

  // Bulk delete assignments - MUST be before /:id route!
  app.delete("/api/assignments/bulk", async (req, res) => {
    try {
      const { assignmentIds } = req.body;
      
      if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        return res.status(400).json({ error: "assignmentIds must be a non-empty array" });
      }
      
      console.log(`Bulk deleting ${assignmentIds.length} assignments:`, assignmentIds);
      
      // Delete all assignments
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

  app.delete("/api/assignments/:id", async (req, res) => {
    try {
      await storage.deleteAssignment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // Detect and create missing semester 2 assignments
  app.post("/api/assignments/fix-missing-semester2", async (req, res) => {
    try {
      const { dryRun = true } = req.body;
      
      // Get all current assignments
      const assignments = await storage.getAssignments();
      const teachers = await storage.getTeachers();
      const subjects = await storage.getSubjects();
      const classes = await storage.getClasses();
      
      // Group assignments by teacher-subject-class combination
      const assignmentMap = new Map<string, { semester1?: any, semester2?: any }>();
      
      for (const assignment of assignments) {
        const teacher = teachers.find(t => t.id === assignment.teacherId);
        const subject = subjects.find(s => s.id === assignment.subjectId);
        const classObj = classes.find(c => c.id === assignment.classId);
        
        if (!teacher || !subject || !classObj) continue;
        
        const key = `${teacher.shortName}-${subject.shortName}-${classObj.name}`;
        
        if (!assignmentMap.has(key)) {
          assignmentMap.set(key, {});
        }
        
        const entry = assignmentMap.get(key)!;
        if (assignment.semester === "1") {
          entry.semester1 = assignment;
        } else if (assignment.semester === "2") {
          entry.semester2 = assignment;
        }
      }
      
      // Find missing semester 2 assignments
      const missingAssignments = [];
      const teacherIdMap = new Map(teachers.map(t => [t.shortName, t.id]));
      const subjectIdMap = new Map(subjects.map(s => [s.shortName, s.id]));
      const classIdMap = new Map(classes.map(c => [c.name, c.id]));
      
      for (const [key, entry] of Array.from(assignmentMap.entries())) {
        if (entry.semester1 && !entry.semester2) {
          const [teacherShort, subjectShort, className] = key.split('-');
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
        missingAssignments: missingAssignments.map(a => ({
          teacher: a.teacherShort,
          subject: a.subjectShort,
          class: a.className,
          hours: a.hoursPerWeek
        })),
        created: 0
      };
      
      if (!dryRun && missingAssignments.length > 0) {
        // Create the missing assignments
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
        message: dryRun 
          ? `Gefunden: ${result.found} fehlende Semester 2 Zuweisungen (Testlauf)` 
          : `Erstellt: ${result.created} von ${result.found} fehlenden Semester 2 Zuweisungen`,
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

  // Statistics route
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getTeacherStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // Team Teaching Routes
  // Create team teaching validation schema
  const createTeamTeachingSchema = z.object({
    teacherIds: z.array(z.string().uuid()).min(1, "At least one teacher ID is required")
  });

  app.post("/api/assignments/:id/team", async (req, res) => {
    try {
      const { teacherIds } = createTeamTeachingSchema.parse(req.body);
      const teamAssignments = await storage.createTeamTeaching(req.params.id, teacherIds);
      res.status(201).json(teamAssignments);
    } catch (error) {
      if (error instanceof z.ZodError) {
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

  // Use specific routes before any potential wildcard patterns
  app.get("/api/team-teaching/:teamTeachingId", async (req, res) => {
    try {
      const teamAssignments = await storage.getTeamTeachingGroup(req.params.teamTeachingId);
      res.json(teamAssignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team teaching group" });
    }
  });

  app.get("/api/team-teaching/:teamTeachingId/validate", async (req, res) => {
    try {
      const validation = await storage.validateTeamTeachingGroup(req.params.teamTeachingId);
      res.json(validation);
    } catch (error) {
      res.status(500).json({ error: "Failed to validate team teaching group" });
    }
  });

  app.delete("/api/assignments/:id/team", async (req, res) => {
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

  // Helper function for planstellen calculation
  async function performPlanstellenCalculation(teachers: any[], classes: any[], subjects: any[], storage: any) {
    const results = [];
    
    // Calculate required hours per grade with correct handling of parallel subjects
    const gradeHours: Record<string, { totalHours: number; parallelGroupHours: Record<string, number>; regularHours: Record<string, number> }> = {};
    
    // Calculate total hours needed per grade considering parallel subjects
    for (const classData of classes) {
      const grade = classData.grade.toString();
      if (!gradeHours[grade]) {
        gradeHours[grade] = { totalHours: 0, parallelGroupHours: {}, regularHours: {} };
      }
      
      // Use the correct calculation that handles parallel subjects
      const classCorrectHours = calculateCorrectHours(classData.subjectHours, classData.grade);
      
      // Accumulate parallel group hours (taking maximum needed across classes)
      for (const [groupId, hours] of Object.entries(classCorrectHours.parallelGroupHours)) {
        gradeHours[grade].parallelGroupHours[groupId] = Math.max(
          gradeHours[grade].parallelGroupHours[groupId] || 0, 
          hours
        );
      }
      
      // Accumulate regular subject hours
      for (const [subjectName, hours] of Object.entries(classCorrectHours.regularHours)) {
        if (!gradeHours[grade].regularHours[subjectName]) {
          gradeHours[grade].regularHours[subjectName] = 0;
        }
        gradeHours[grade].regularHours[subjectName] += hours;
      }
      
      // Update total hours
      const parallelTotal = Object.values(gradeHours[grade].parallelGroupHours).reduce((sum, h) => sum + h, 0);
      const regularTotal = Object.values(gradeHours[grade].regularHours).reduce((sum, h) => sum + h, 0);
      gradeHours[grade].totalHours = parallelTotal + regularTotal;
    }
    
    // Create planstelle entries for each grade
    for (const [grade, gradeData] of Object.entries(gradeHours)) {
      // Create entries for parallel groups
      for (const [groupId, hours] of Object.entries(gradeData.parallelGroupHours)) {
        // Calculate available hours (simplified: sum all teachers with subjects in this group)
        const availableHours = teachers
          .filter((teacher: any) => {
            // Check if teacher has any subject from this parallel group
            const groupSubjects = groupId === "Differenzierung" ? ["FS", "SW", "NW", "IF", "TC", "MUS"] :
                                 groupId === "Religion" ? ["KR", "ER", "PP"] : [];
            return teacher.subjects.some((subj: string) => groupSubjects.includes(subj));
          })
          .reduce((sum: number, teacher: any) => sum + parseFloat(teacher.currentHours || "0"), 0);
        
        const planstelle = await storage.createPlanstelle({
          subjectId: null, // Parallel groups don't map to single subjects
          grade: parseInt(grade),
          category: "grundbedarf",
          component: `${groupId} - Klasse ${grade} (Parallelgruppe)`,
          lineType: "requirement",
          formula: { description: `Parallele Fächergruppe ${groupId} für Klasse ${grade}` },
          color: "#10B981", // Green for parallel groups
          requiredHours: hours.toString(),
          availableHours: availableHours.toString(),
          deficit: (hours - availableHours).toString(),
        });
        
        results.push(planstelle);
      }
      
      // Create entries for regular subjects
      for (const [subjectName, requiredHours] of Object.entries(gradeData.regularHours)) {
        const subject = subjects.find((s: any) => s.name === subjectName || s.shortName === subjectName);
        
        // Calculate available hours (simplified: sum all teachers with this subject)
        const availableHours = teachers
          .filter((teacher: any) => teacher.subjects.includes(subjectName))
          .reduce((sum: number, teacher: any) => sum + parseFloat(teacher.currentHours || "0"), 0);
        
        const planstelle = await storage.createPlanstelle({
          subjectId: subject?.id || null,
          grade: parseInt(grade),
          category: "grundbedarf",
          component: `${subjectName} - Klasse ${grade}`,
          lineType: "requirement",
          formula: { description: `Calculated for grade ${grade}` },
          color: "#3B82F6", // Blue for regular subjects
          requiredHours: requiredHours.toString(),
          availableHours: availableHours.toString(),
          deficit: (requiredHours - availableHours).toString(),
        });
        
        results.push(planstelle);
      }
    }
    
    return results;
  }

  // Planstellen routes
  app.get("/api/planstellen", async (req, res) => {
    try {
      const planstellen = await storage.getPlanstellen();
      res.json(planstellen);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch planstellen" });
    }
  });

  app.post("/api/calculate-planstellen", isAuthenticated, async (req, res) => {
    try {
      // Check if request body contains planstellen input data
      if (req.body && Object.keys(req.body).length > 0) {
        // Validate input data
        const input = planstellenInputSchema.parse(req.body);
        
        // Calculate planstellen from user input (no persistence)
        const calculated = await storage.calculatePlanstellenFromInput(input);
        
        return res.json({
          message: "Planstellen calculation completed successfully",
          planstellen: calculated,
          calculated: calculated.length,
          timestamp: new Date().toISOString()
        });
      } else {
        // Legacy calculation using existing data
        const teachers = await storage.getTeachers();
        const classes = await storage.getClasses();
        const subjects = await storage.getSubjects();
        
        // Perform planstellen calculation (simplified example)
        const calculated = await performPlanstellenCalculation(teachers, classes, subjects, storage);
        
        return res.json({
          message: "Planstellen calculation completed successfully",
          calculated: calculated.length,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Planstellen calculation error:", error);
      res.status(500).json({ error: "Failed to calculate planstellen" });
    }
  });

  // Separate endpoint for saving planstellen
  app.post("/api/planstellen/save", isAuthenticated, async (req, res) => {
    try {
      // Validate input data
      const input = planstellenInputSchema.parse(req.body);
      
      // Calculate and persist planstellen from user input
      const calculated = await storage.calculatePlanstellenFromInput(input);
      
      // Persist each planstelle to the database
      const savedPlanstellen = [];
      for (const planstelle of calculated) {
        const saved = await storage.createPlanstelle(planstelle);
        savedPlanstellen.push(saved);
      }
      
      return res.json({
        message: "Planstellen saved successfully",
        planstellen: savedPlanstellen,
        calculated: savedPlanstellen.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Planstellen save error:", error);
      res.status(500).json({ error: "Failed to save planstellen" });
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
            maxHours: (parseFloat(row[5]) || 25).toString(),
            currentHours: (parseFloat(row[6]) || 0).toString(),
            dateOfBirth: row[7] || null, // Format: YYYY-MM-DD
            qualifications: row[8] ? row[8].split(";") : [],
            notes: row[9] || "",
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

  // Subject normalization for database lookup
  const findSubjectByName = (subjects: any[], semesterName: string, baseName: string) => {
    // Comprehensive subject mapping for German schools
    const subjectAliases: Record<string, string[]> = {
      'D': ['D', 'DE', 'Deutsch'],
      'D1': ['D1', 'DE1', 'Deutsch1'], 
      'D2': ['D2', 'DE2', 'Deutsch2'],
      'M': ['M', 'MA', 'Mathe', 'Mathematik'],
      'M1': ['M1', 'MA1', 'Mathe1'],
      'M2': ['M2', 'MA2', 'Mathe2'], 
      'E': ['E', 'EN', 'Englisch', 'English'],
      'E1': ['E1', 'EN1', 'Englisch1'],
      'E2': ['E2', 'EN2', 'Englisch2'],
      'L': ['L', 'F', 'FR', 'LA', 'FS', 'Französisch', 'Latein', 'Fremdsprache'],
      'L1': ['L1', 'F1', 'FR1', 'LA1'],
      'L2': ['L2', 'F2', 'FR2', 'LA2'],
      'PK': ['PK', 'SW', 'Politik', 'Sozialwissenschaften'],
      'PK1': ['PK1', 'SW1'], 
      'PK2': ['PK2', 'SW2'],
      'TC': ['TC', 'TX', 'Technik'],
      'TC1': ['TC1', 'TX1'],
      'TC2': ['TC2', 'TX2'],
      'NW': ['NW', 'BI', 'BIO', 'CH', 'PH', 'Naturwissenschaften'],
      'NW1': ['NW1', 'BI1', 'CH1', 'PH1'],
      'NW2': ['NW2', 'BI2', 'CH2', 'PH2'],
      'GE': ['GE', 'Geschichte'],
      'GE1': ['GE1'], 'GE2': ['GE2'],
      'EK': ['EK', 'Erdkunde', 'Geografie'],
      'EK1': ['EK1'], 'EK2': ['EK2'],
      'SP': ['SP', 'Sport'],
      'SP1': ['SP1'], 'SP2': ['SP2'],
      'KU': ['KU', 'Kunst'],
      'KU1': ['KU1'], 'KU2': ['KU2'],
      'MU': ['MU', 'Musik'],
      'MU1': ['MU1'], 'MU2': ['MU2'],
      'KR': ['KR', 'katholische Religion'],
      'KR1': ['KR1'], 'KR2': ['KR2'],
      'ER': ['ER', 'evangelische Religion'],
      'ER1': ['ER1'], 'ER2': ['ER2']
    };

    // Try semester name first with all aliases
    if (subjectAliases[semesterName]) {
      for (const alias of subjectAliases[semesterName]) {
        const found = subjects.find(s => s.shortName === alias);
        if (found) return found;
      }
    }

    // Try base name with all aliases
    if (subjectAliases[baseName]) {
      for (const alias of subjectAliases[baseName]) {
        const found = subjects.find(s => s.shortName === alias);
        if (found) return found;
      }
    }

    // Last resort: direct name match
    return subjects.find(s => s.shortName === semesterName) || 
           subjects.find(s => s.shortName === baseName);
  };

  // Helper function for optimization with workload tracking
  const findQualifiedTeacher = (baseSubject: string, teachers: Teacher[], teacherWorkloads: Map<string, number>, semesterHours: number) => {
    // Teacher subject mapping - normalize German subject abbreviations
    const subjectMappings: Record<string, string[]> = {
      'D': ['D', 'DE', 'Deutsch'],
      'M': ['M', 'MA', 'Mathe', 'Mathematik'],
      'E': ['E', 'EN', 'Englisch', 'English'],
      'L': ['L', 'F', 'FS', 'Französisch', 'Latein'],
      'NW': ['NW', 'BI', 'BIO', 'CH', 'Chemie', 'PH', 'Physik'],
      'GE': ['GE', 'Geschichte'],
      'EK': ['EK', 'Erdkunde', 'Geografie'],
      'PK': ['PK', 'Politik', 'SW', 'Sozialwissenschaften'],
      'SP': ['SP', 'Sport'],
      'KU': ['KU', 'Kunst'],
      'MU': ['MU', 'Musik'],
      'TC': ['TC', 'Technik', 'Tx'],
      'KR': ['KR'], // Only exact match for religion
      'ER': ['ER']  // Only exact match for religion
    };
    
    const possibleSubjects = subjectMappings[baseSubject] || [baseSubject];
    
    const qualifiedTeacher = teachers.find((teacher: Teacher) => {
      // CHECK WORKLOAD LIMITS FIRST
      const currentWorkload = teacherWorkloads.get(teacher.id) || 0;
      const totalHoursNeeded = currentWorkload + (semesterHours * 2); // Both semesters
      
      if (totalHoursNeeded > parseFloat(teacher.maxHours)) {
        console.log(`    WORKLOAD LIMIT: ${teacher.shortName} (${totalHoursNeeded.toFixed(1)}h > ${teacher.maxHours}h)`);
        return false;
      }
      
      // HARDCODED FIX: BEU should never teach KR or ER (only E, GE, EK)
      if ((baseSubject === 'KR' || baseSubject === 'ER') && teacher.shortName === 'BEU') {
        console.log(`    BLOCKED: ${teacher.shortName} cannot teach ${baseSubject} (only E, GE, EK)`);
        return false;
      }
      
      return teacher.subjects.some((teacherSubjectStr: string) => {
        const teacherSubjects = teacherSubjectStr.split(/[,;]/).map(s => s.trim());
        return teacherSubjects.some((sub: string) => {
          return possibleSubjects.some((possible: string) => {
            // Use EXACT match only for all subjects to prevent false positives
            return sub.toUpperCase() === possible.toUpperCase();
          });
        });
      });
    });
    
    return qualifiedTeacher;
  };

  // Optimization endpoint - Realistic semester-based optimization
  app.post("/api/optimize", async (req, res) => {
    try {
      // Get current data for optimization
      const teachers = await storage.getTeachers();
      const classes = await storage.getClasses();
      const subjects = await storage.getSubjects();
      
      // Clear existing assignments to avoid duplicates (parallel)
      const existingAssignments = await storage.getAssignments();
      await Promise.all(existingAssignments.map(a => storage.deleteAssignment(a.id)));
      
      let createdAssignments = 0;
      const assignmentPromises: Promise<any>[] = [];
      
      // Initialize workload tracking to respect teacher hour limits
      const teacherWorkloads = new Map<string, number>();
      teachers.forEach(teacher => {
        teacherWorkloads.set(teacher.id, 0); // Start with 0 hours
      });
      
      console.log("=== SEMESTER-BASED OPTIMIZATION STARTING ===");
      console.log(`Teachers: ${teachers.length}, Classes: ${classes.length}, Subjects: ${subjects.length}`);
      
      // Define realistic semester subject mappings for Realschule
      const semesterSubjects: Record<string, { semesters: string[], hours: number }> = {
        'D': { semesters: ['D1', 'D2'], hours: 4 },
        'M': { semesters: ['M1', 'M2'], hours: 4 }, 
        'E': { semesters: ['E1', 'E2'], hours: 4 },
        'L': { semesters: ['L1', 'L2'], hours: 3 }, // Second language (French/Latin)
        'NW': { semesters: ['NW1', 'NW2'], hours: 2 }, // Natural Sciences
        'GE': { semesters: ['GE1', 'GE2'], hours: 2 }, // History
        'EK': { semesters: ['EK1', 'EK2'], hours: 1 }, // Geography
        'PK': { semesters: ['PK1', 'PK2'], hours: 2 }, // Politics
        'SP': { semesters: ['SP1', 'SP2'], hours: 3 }, // Sports
        'KU': { semesters: ['KU1', 'KU2'], hours: 2 }, // Art
        'MU': { semesters: ['MU1', 'MU2'], hours: 2 }, // Music
        'TC': { semesters: ['TC1', 'TC2'], hours: 2 }, // Technology
        'KR': { semesters: ['KR1', 'KR2'], hours: 2 }, // Catholic Religion
        'ER': { semesters: ['ER1', 'ER2'], hours: 2 }  // Protestant Religion
      };
      
      // For each class, create semester-based assignments  
      for (const classData of classes) {
        // Reduced logging for performance
        
        // Determine which subjects this grade level needs
        let gradeSubjects: string[] = [];
        if (classData.grade >= 5 && classData.grade <= 10) {
          gradeSubjects = ['D', 'M', 'E', 'SP'];
          
          if (classData.grade >= 6) {
            gradeSubjects.push('NW', 'GE', 'MU', 'KU');
          }
          if (classData.grade >= 7) {
            gradeSubjects.push('L', 'TC', 'KR');
          }
          if (classData.grade >= 8) {
            gradeSubjects.push('EK', 'PK');
          }
        }
        
        // Create assignments for each subject (both semesters with same teacher)
        for (const baseSubject of gradeSubjects) {
          if (semesterSubjects[baseSubject]) {
            // CRITICAL FIX: Pre-filter teachers to exclude BEU from KR/ER
            const teacherPool = teachers.filter(t => 
              !(t.shortName === 'BEU' && (baseSubject === 'KR' || baseSubject === 'ER'))
            );
            
            const semesterHours = semesterSubjects[baseSubject].hours;
            const qualifiedTeacher = findQualifiedTeacher(baseSubject, teacherPool, teacherWorkloads, semesterHours);
            
            if (qualifiedTeacher) {
              // Teacher assigned successfully - UPDATE WORKLOAD TRACKER
              const hoursForBothSemesters = semesterHours * 2;
              const currentWorkload = teacherWorkloads.get(qualifiedTeacher.id) || 0;
              teacherWorkloads.set(qualifiedTeacher.id, currentWorkload + hoursForBothSemesters);
              
              console.log(`  ${baseSubject}: ${qualifiedTeacher.shortName} (${currentWorkload + hoursForBothSemesters}h / ${qualifiedTeacher.maxHours}h)`);
              
              // Create assignments for both semesters with the same teacher
              for (let semester = 1; semester <= 2; semester++) {
                const semesterSubjectName = semesterSubjects[baseSubject].semesters[semester - 1];
                
                // Enhanced subject lookup with normalization
                let subject = findSubjectByName(subjects, semesterSubjectName, baseSubject);
                
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
              
              // Better fallback: Find teacher with similar subjects or skip
              let fallbackTeacher = null;
              
              // UNIFIED SMART FALLBACK: All subjects use workload + qualification checks
              const subjectMappings: Record<string, string[]> = {
                'D': ['D', 'DE', 'Deutsch'],
                'M': ['M', 'MA', 'Mathe', 'Mathematik'],
                'E': ['E', 'EN', 'Englisch', 'English'],
                'L': ['L', 'F', 'FR', 'LA', 'FS', 'Französisch', 'Latein', 'Fremdsprache'],
                'PK': ['PK', 'SW', 'Politik', 'Sozialwissenschaften'],
                'TC': ['TC', 'TX', 'Technik'],
                'NW': ['NW', 'BI', 'BIO', 'CH', 'PH', 'Naturwissenschaften'],
                'GE': ['GE', 'Geschichte'],
                'EK': ['EK', 'Erdkunde', 'Geografie'],
                'SP': ['SP', 'Sport'],
                'KU': ['KU', 'Kunst'],
                'MU': ['MU', 'Musik'],
                'KR': ['KR', 'katholische Religion'],
                'ER': ['ER', 'evangelische Religion']
              };
              
              // Try all teachers, but check workload and basic qualification
              for (const teacher of teachers) {
                // WORKLOAD CHECK FIRST  
                const currentWorkload = teacherWorkloads.get(teacher.id) || 0;
                const totalHoursNeeded = currentWorkload + (semesterHours * 2);
                
                if (totalHoursNeeded <= parseFloat(teacher.maxHours)) {
                  // BASIC QUALIFICATION CHECK (relaxed for emergency fallback)
                  const subjectAliases = subjectMappings[baseSubject] || [baseSubject];
                  const canTeach = teacher.subjects.some(subj => {
                    return subjectAliases.some(alias => 
                      subj.toUpperCase().includes(alias.toUpperCase()) ||
                      alias.toUpperCase().includes(subj.toUpperCase())
                    );
                  });
                  
                  if (canTeach) {
                    fallbackTeacher = teacher;
                    break; // Take first qualified teacher with workload capacity
                  }
                }
              }
              
              if (fallbackTeacher) {
                console.log(`    SMART FALLBACK: Assigned to ${fallbackTeacher.shortName} (${fallbackTeacher.firstName} ${fallbackTeacher.lastName})`);
                console.log(`    Teacher subjects: ${fallbackTeacher.subjects.join(', ')}`);
                console.log(`    Workload check: ${(teacherWorkloads.get(fallbackTeacher.id) || 0) + (semesterHours * 2)}h <= ${fallbackTeacher.maxHours}h`);
                
                // UPDATE WORKLOAD TRACKER for fallback assignments too!
                const hoursForBothSemesters = semesterHours * 2;
                const currentWorkload = teacherWorkloads.get(fallbackTeacher.id) || 0;
                teacherWorkloads.set(fallbackTeacher.id, currentWorkload + hoursForBothSemesters);
                
                for (let semester = 1; semester <= 2; semester++) {
                  const semesterSubjectName = semesterSubjects[baseSubject].semesters[semester - 1];
                  let subject = findSubjectByName(subjects, semesterSubjectName, baseSubject);
                  
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
      
      // Wait for all assignments to be created
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

  // School Year Transition routes (Admin only)
  app.get('/api/school-years/validate-transition/:fromSchoolYearId', isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Validate path parameter
      const fromSchoolYearIdSchema = z.string().uuid("Ungültige Schuljahr-ID");
      const fromSchoolYearId = fromSchoolYearIdSchema.parse(req.params.fromSchoolYearId);
      
      const rawValidation = await storage.validateSchoolYearTransition(fromSchoolYearId);
      
      // Get additional data needed for frontend ValidationResult type
      const [allStudents, classes] = await Promise.all([
        storage.getStudentsBySchoolYear(fromSchoolYearId),
        storage.getClassesBySchoolYear(fromSchoolYearId)
      ]);
      
      const graduatingClasses = classes.filter(c => c.grade === 10).length;
      
      // Transform to match frontend ValidationResult type exactly
      const validation = {
        valid: rawValidation.valid,
        errors: rawValidation.errors,
        warnings: rawValidation.warnings,
        statistics: {
          totalClasses: rawValidation.statistics.totalClasses,
          totalStudents: allStudents.length,
          totalTeachers: rawValidation.statistics.totalTeachers,
          totalAssignments: rawValidation.statistics.totalAssignments,
          graduatingClasses: graduatingClasses
        }
      };
      
      res.json(validation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Ungültige Parameter", 
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

  app.post('/api/school-years/preview-transition', isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Complete Zod validation for request body matching frontend format
      const previewRequestSchema = z.object({
        fromSchoolYearId: z.string().uuid("Ungültige Schuljahr-ID für Ausgangsjahr"),
        toSchoolYearName: z.string().min(1, "Zielschuljahr-Name ist erforderlich").max(50, "Name zu lang"),
        params: z.object({
          newClasses: z.array(z.object({
            name: z.string().min(1, "Klassenname erforderlich").max(10, "Klassenname zu lang"),
            grade: z.number().int().min(5, "Mindestklasse 5").max(10, "Höchstklasse 10"),
            expectedStudentCount: z.number().int().min(1, "Mindestens 1 Schüler").max(35, "Maximal 35 Schüler")
          })).min(1, "Mindestens eine neue Klasse erforderlich"),
          migrationRules: z.object({
            autoMigrateContinuousSubjects: z.boolean().optional().default(true),
            handleDifferenzierung: z.boolean().optional().default(true),
            archiveGraduatedClasses: z.boolean().optional().default(true),
            preserveInactiveTeachers: z.boolean().optional().default(false),
            createMissingSubjects: z.boolean().optional().default(false)
          }).optional().default({})
        })
      });
      
      const { fromSchoolYearId, toSchoolYearName, params } = previewRequestSchema.parse(req.body);

      const rawPreview = await storage.previewSchoolYearTransition(fromSchoolYearId, toSchoolYearName);
      
      // Transform to match frontend PreviewResult type
      // Get lookup data for proper mapping
      const [teachers, subjects, classes] = await Promise.all([
        storage.getTeachers(),
        storage.getSubjects(), 
        storage.getClassesBySchoolYear(fromSchoolYearId)
      ]);

      const preview = {
        success: true,
        preview: {
          newClasses: params.newClasses,
          migratedAssignments: rawPreview.assignmentMigrations.map(am => {
            // Find related data
            const teacher = teachers.find(t => t.id === am.assignment.teacherId);
            const subject = subjects.find(s => s.id === am.assignment.subjectId);
            const fromClass = classes.find(c => c.id === am.assignment.classId);
            
            // Determine target class based on grade advancement
            let toClassName = "Abschluss";
            if (am.targetGrade && am.targetGrade <= 10) {
              // Advanced class (5a -> 6a, 6b -> 7b, etc.)
              const currentGrade = fromClass?.grade || 5;
              const classSuffix = fromClass?.name.slice(-1) || 'a'; // Get 'a', 'b', etc.
              toClassName = `${am.targetGrade}${classSuffix}`;
            }

            return {
              teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "Unbekannter Lehrer",
              subject: subject?.shortName || subject?.name || "Unbekanntes Fach", 
              fromClass: fromClass?.name || "Unbekannte Klasse",
              toClass: toClassName,
              status: am.status === 'auto_migrate' ? 'auto' as const : 
                     am.status === 'manual_check' ? 'manual_check' as const : 'skip' as const
            };
          }),
          archivedClasses: rawPreview.classTransitions
            .filter(ct => ct.action === 'graduate')
            .map(ct => ({
              name: ct.from.name,
              studentCount: ct.studentCount
            })),
          migratedStudents: rawPreview.classTransitions
            .filter(ct => ct.action === 'migrate')
            .reduce((sum, ct) => sum + ct.studentCount, 0),
          statistics: {
            classesCreated: params.newClasses.length + rawPreview.statistics.continuingClasses,
            assignmentsMigrated: rawPreview.statistics.autoMigrations,
            studentsArchived: rawPreview.classTransitions
              .filter(ct => ct.action === 'graduate')
              .reduce((sum, ct) => sum + ct.studentCount, 0),
            studentsMigrated: rawPreview.classTransitions
              .filter(ct => ct.action === 'migrate')
              .reduce((sum, ct) => sum + ct.studentCount, 0)
          }
        }
      };
      
      res.json(preview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Ungültige Eingabedaten", 
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
      res.status(500).json({ error: "Fehler bei der Erstellung der Übergangs-Vorschau" });
    }
  });

  app.post('/api/school-years/execute-transition', isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Complete Zod validation for execute request
      const executeRequestSchema = z.object({
        fromSchoolYearId: z.string().uuid("Ungültige Schuljahr-ID für Ausgangsjahr"),
        toSchoolYearName: z.string().min(1, "Zielschuljahr-Name ist erforderlich").max(50, "Name zu lang"),
        params: z.object({
          newClasses: z.array(z.object({
            name: z.string().min(1, "Klassenname erforderlich").max(10, "Klassenname zu lang").regex(/^[0-9]+[a-zA-Z]$/, "Format: z.B. '5a', '6b'"),
            grade: z.number().int().min(5, "Mindestklasse 5").max(10, "Höchstklasse 10"),
            expectedStudentCount: z.number().int().min(1, "Mindestens 1 Schüler").max(35, "Maximal 35 Schüler")
          })).min(1, "Mindestens eine neue Klasse erforderlich"),
          migrationRules: z.object({
            autoMigrateContinuousSubjects: z.boolean().optional().default(true),
            handleDifferenzierung: z.boolean().optional().default(true),
            archiveGraduatedClasses: z.boolean().optional().default(true),
            preserveInactiveTeachers: z.boolean().optional().default(false),
            createMissingSubjects: z.boolean().optional().default(false)
          }).optional().default({})
        })
      });

      const { fromSchoolYearId, toSchoolYearName, params } = executeRequestSchema.parse(req.body);
      
      // The defaults are already applied by Zod schema, no need for manual assignment
      const validatedParams = params;

      // First validate that the transition is ready
      const validation = await storage.validateSchoolYearTransition(fromSchoolYearId);
      if (!validation.valid) {
        return res.status(422).json({ 
          error: "Schuljahreswechsel-Validierung fehlgeschlagen", 
          details: validation.errors,
          warnings: validation.warnings
        });
      }

      // Execute the transition
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

      // Transform to match frontend TransitionResult type
      const result = {
        success: rawResult.success,
        newSchoolYearId: rawResult.newSchoolYear.id,
        statistics: {
          classesCreated: rawResult.createdNewClasses + rawResult.migratedClasses,
          assignmentsMigrated: rawResult.migratedAssignments,
          studentsArchived: validatedParams.newClasses.reduce((sum, nc) => sum + nc.expectedStudentCount, 0), // Approximation
          studentsMigrated: rawResult.migratedStudents
        },
        warnings: [], // TODO: Add warnings from transition process
        errors: rawResult.errors
      };

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Ungültige Eingabedaten", 
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
      res.status(500).json({ error: "Fehler bei der Ausführung des Schuljahreswechsels" });
    }
  });

  // NEW: Validated lesson distribution import route
  app.post('/api/import/lesson-distribution-validated', upload.single('file'), isAuthenticated, isAdmin, async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Keine Datei hochgeladen' });
      }

      // Write file to temporary location
      const filePath = `/tmp/lesson-distribution-validated-${Date.now()}.xlsx`;
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, req.file.buffer);

      console.log('=== VALIDIERTER IMPORT GESTARTET ===');
      console.log('Datei:', filePath);

      // Get current school year
      const schoolYears = await storage.getSchoolYears();
      const currentSchoolYear = schoolYears.find(sy => sy.isCurrent) || schoolYears[0];
      
      if (!currentSchoolYear) {
        return res.status(400).json({ error: 'Kein Schuljahr gefunden' });
      }

      // Import with validation
      const importer = new LessonDistributionImporter(storage);
      const result = await importer.importFromExcelValidated(filePath, currentSchoolYear.id);

      // Clean up temporary file
      await fs.unlink(filePath);

      console.log('=== VALIDIERTER IMPORT ABGESCHLOSSEN ===');
      console.log('Ergebnis:', result);

      res.json(result);
    } catch (error) {
      console.error('Fehler beim validierten Import:', error);
      res.status(500).json({ 
        error: 'Import fehlgeschlagen', 
        details: error instanceof Error ? error.message : 'Unbekannter Fehler'
      });
    }
  });

  // Excel Import Route
  app.post('/api/import/lesson-distribution', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { filePath, schoolYearId } = req.body;
      
      if (!filePath || !schoolYearId) {
        return res.status(400).json({ 
          error: "Datei-Pfad und Schuljahr-ID sind erforderlich" 
        });
      }

      const { LessonDistributionImporter } = await import('./lesson-distribution-importer.js');
      const importer = new LessonDistributionImporter(storage);
      
      const result = await importer.importFromExcel(filePath, schoolYearId);
      
      if (result.success) {
        res.json({
          success: true,
          message: `Import erfolgreich: ${result.imported.teachers} Lehrer, ${result.imported.subjects} Fächer, ${result.imported.classes} Klassen, ${result.imported.assignments} Zuweisungen`,
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

  // PDF Import Routes
  app.post('/api/import/lesson-distribution/pdf-preview', upload.single('file'), isAuthenticated, isAdmin, async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Keine Datei hochgeladen' });
      }

      const { schoolYearId } = req.body;
      if (!schoolYearId) {
        return res.status(400).json({ error: 'Schuljahr-ID erforderlich' });
      }

      // Validate file type
      if (!req.file.originalname.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ error: 'Nur PDF-Dateien sind erlaubt' });
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

  app.post('/api/import/lesson-distribution/pdf-apply', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { lessons, resolutions, schoolYearId } = req.body;
      
      if (!lessons || !schoolYearId) {
        return res.status(400).json({ error: 'Lessons und Schuljahr-ID erforderlich' });
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

  // Subject Mapping Management Routes
  app.get('/api/subject-mappings', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const mappings = await intelligentMappingService.getAllMappings();
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching subject mappings:", error);
      res.status(500).json({ error: "Failed to fetch subject mappings" });
    }
  });

  app.post('/api/subject-mappings/resolve', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { pdfSubjectName, selectedSubjectId } = req.body;
      
      if (!pdfSubjectName || !selectedSubjectId) {
        return res.status(400).json({ error: 'PDF subject name and selected subject ID are required' });
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

  app.delete('/api/subject-mappings/:id', isAuthenticated, isAdmin, async (req, res) => {
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

  // School Years management routes
  app.get('/api/school-years', async (req, res) => {
    try {
      const schoolYears = await storage.getSchoolYears();
      res.json(schoolYears);
    } catch (error) {
      console.error("Error fetching school years:", error);
      res.status(500).json({ error: "Failed to fetch school years" });
    }
  });

  app.get('/api/school-years/current', async (req, res) => {
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

  // PDF Import routes
  app.get('/api/pdf-imports', isAuthenticated, async (req, res) => {
    try {
      const pdfImports = await storage.getPdfImports();
      res.json(pdfImports);
    } catch (error) {
      console.error("Error fetching PDF imports:", error);
      res.status(500).json({ error: "Failed to fetch PDF imports" });
    }
  });

  app.post('/api/pdf-imports', isAuthenticated, upload.single('pdf'), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      const userId = (req as any).user?.claims.sub;
      const pdfImportData = insertPdfImportSchema.parse({
        fileName: req.file.originalname,
        fileHash: createHash('sha256').update(req.file.buffer).digest('hex'),
        uploadedBy: userId,
        pageCount: 0, // Will be updated after processing
        metadata: {}
      });

      const pdfImport = await storage.createPdfImport(pdfImportData);
      res.status(201).json(pdfImport);
    } catch (error) {
      console.error("Error creating PDF import:", error);
      res.status(500).json({ error: "Failed to create PDF import" });
    }
  });

  app.get('/api/pdf-tables', isAuthenticated, async (req, res) => {
    try {
      const pdfTables = await storage.getPdfTables();
      res.json(pdfTables);
    } catch (error) {
      console.error("Error fetching PDF tables:", error);
      res.status(500).json({ error: "Failed to fetch PDF tables" });
    }
  });

  app.post('/api/pdf-tables', isAuthenticated, async (req, res) => {
    try {
      const pdfTableData = insertPdfTableSchema.parse(req.body);
      const pdfTable = await storage.createPdfTable(pdfTableData);
      res.status(201).json(pdfTable);
    } catch (error) {
      console.error("Error creating PDF table:", error);
      res.status(500).json({ error: "Failed to create PDF table" });
    }
  });

  app.put('/api/pdf-tables/:id', isAuthenticated, async (req, res) => {
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

  app.delete('/api/pdf-tables/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePdfTable(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting PDF table:", error);
      res.status(500).json({ error: "Failed to delete PDF table" });
    }
  });

  // Get tables for a specific PDF import
  app.get('/api/pdf-imports/:id/tables', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const tables = await storage.getPdfTablesByImport(id);
      res.json(tables);
    } catch (error) {
      console.error("Error fetching tables for PDF import:", error);
      res.status(500).json({ error: "Failed to fetch tables for PDF import" });
    }
  });

  // ChatGPT Schedule Import Routes
  app.post('/api/chatgpt/parse-schedule', isAuthenticated, async (req, res) => {
    try {
      const { scheduleText } = req.body;
      
      if (!scheduleText || typeof scheduleText !== 'string') {
        return res.status(400).json({ error: "scheduleText is required and must be a string" });
      }

      const parsedData = await openaiScheduleService.parseScheduleText(scheduleText);
      res.json(parsedData);
    } catch (error) {
      console.error("Error parsing schedule with ChatGPT:", error);
      res.status(500).json({ error: "Failed to parse schedule: " + (error as Error).message });
    }
  });

  app.post('/api/chatgpt/import-schedule', isAuthenticated, async (req, res) => {
    try {
      const { scheduleText } = req.body;
      
      if (!scheduleText || typeof scheduleText !== 'string') {
        return res.status(400).json({ error: "scheduleText is required and must be a string" });
      }

      // First parse the data
      const parsedData = await openaiScheduleService.parseScheduleText(scheduleText);
      
      // Then import it
      const importResult = await openaiScheduleService.importParsedData(parsedData);
      
      res.json({
        message: "Schedule import completed",
        results: importResult,
        parsedData: parsedData
      });
    } catch (error) {
      console.error("Error importing schedule with ChatGPT:", error);
      res.status(500).json({ error: "Failed to import schedule: " + (error as Error).message });
    }
  });

  // Import structured data directly (from editable preview)
  app.post('/api/chatgpt/import-structured', isAuthenticated, async (req, res) => {
    try {
      const parsedData = req.body;
      
      // Validate that we have the required structure
      if (!parsedData || typeof parsedData !== 'object') {
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
      
      // Import the structured data directly
      const importResult = await openaiScheduleService.importParsedData(parsedData);
      
      res.json(importResult);
    } catch (error) {
      console.error("Error importing structured schedule data:", error);
      res.status(500).json({ error: "Failed to import structured data: " + (error as Error).message });
    }
  });

  // Help Bot Routes
  app.post('/api/help/ask', isAuthenticated, async (req, res) => {
    try {
      const { question } = req.body;
      
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: "question is required and must be a string" });
      }

      const answer = await openaiHelpService.getHelpResponse(question);
      res.json({ answer });
    } catch (error) {
      console.error("Error getting help response:", error);
      res.status(500).json({ error: "Failed to get help response: " + (error as Error).message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
