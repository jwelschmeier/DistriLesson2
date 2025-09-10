import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { insertTeacherSchema, insertStudentSchema, insertClassSchema, insertSubjectSchema, insertAssignmentSchema, Teacher } from "@shared/schema";
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

  // Helper function for planstellen calculation
  async function performPlanstellenCalculation(teachers: any[], classes: any[], subjects: any[], storage: any) {
    const results = [];
    
    // Simple example calculation: Calculate required hours per grade and subject
    const gradeSubjectHours: Record<string, Record<string, number>> = {};
    
    // Calculate total hours needed per grade and subject
    for (const classData of classes) {
      const grade = classData.grade.toString();
      if (!gradeSubjectHours[grade]) {
        gradeSubjectHours[grade] = {};
      }
      
      // Add subject hours from class
      for (const [subjectName, hours] of Object.entries(classData.subjectHours)) {
        if (!gradeSubjectHours[grade][subjectName]) {
          gradeSubjectHours[grade][subjectName] = 0;
        }
        gradeSubjectHours[grade][subjectName] += hours as number;
      }
    }
    
    // Create planstelle entries for each grade/subject combination
    for (const [grade, subjectHours] of Object.entries(gradeSubjectHours)) {
      for (const [subjectName, requiredHours] of Object.entries(subjectHours)) {
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
          color: "#3B82F6",
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

  app.post("/api/calculate-planstellen", async (req, res) => {
    try {
      // Get current data for calculation
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
    } catch (error) {
      console.error("Planstellen calculation error:", error);
      res.status(500).json({ error: "Failed to calculate planstellen" });
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
                
                // Find or create subject in database
                let subject = subjects.find(s => s.shortName === semesterSubjectName);
                if (!subject) {
                  // Fallback to base subject
                  subject = subjects.find(s => s.shortName === baseSubject);
                }
                
                if (subject) {
                  const assignmentPromise = storage.createAssignment({
                    teacherId: qualifiedTeacher.id,
                    classId: classData.id,
                    subjectId: subject.id,
                    hoursPerWeek: semesterSubjects[baseSubject].hours,
                    semester: semester.toString(),
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
              
              // Try to find a teacher with related subjects
              if (baseSubject === 'KR') {
                fallbackTeacher = teachers.find(t => 
                  t.subjects.some(s => 
                    s.toUpperCase().includes('KR') || 
                    s.toUpperCase().includes('KATHOLISCH') ||
                    s.includes('Kr')
                  )
                );
                if (!fallbackTeacher) {
                  console.log(`    WARNING: No teacher found for KR - skipping assignment for class ${classData.name}`);
                  continue; // Skip this subject completely if no qualified teacher
                }
              } else if (baseSubject === 'ER') {
                fallbackTeacher = teachers.find(t => 
                  t.subjects.some(s => 
                    s.toUpperCase().includes('ER') || 
                    s.toUpperCase().includes('EVANGELISCH') ||
                    s.includes('Er')
                  )
                );
                if (!fallbackTeacher) {
                  console.log(`    WARNING: No teacher found for ER - skipping assignment for class ${classData.name}`);
                  continue;
                }
              } else {
                // For other subjects, try to find any available teacher
                fallbackTeacher = teachers.find(t => t.subjects.length > 0);
              }
              
              if (fallbackTeacher) {
                console.log(`    Fallback: Assigned to ${fallbackTeacher.shortName} (${fallbackTeacher.firstName} ${fallbackTeacher.lastName})`);
                console.log(`    Teacher subjects: ${fallbackTeacher.subjects.join(', ')}`);
                
                for (let semester = 1; semester <= 2; semester++) {
                  let subject = subjects.find(s => s.shortName === baseSubject);
                  if (subject) {
                    const assignmentPromise = storage.createAssignment({
                      teacherId: fallbackTeacher.id,
                      classId: classData.id,
                      subjectId: subject.id,
                      hoursPerWeek: semesterSubjects[baseSubject].hours,
                      semester: semester.toString(),
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

  const httpServer = createServer(app);
  return httpServer;
}
