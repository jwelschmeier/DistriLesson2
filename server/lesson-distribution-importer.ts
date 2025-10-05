import XLSX from 'xlsx';
import type { IStorage } from './storage.js';
import type { InsertTeacher, InsertSubject, InsertClass, InsertAssignment } from '@shared/schema.js';

export interface LessonDistributionRecord {
  className: string;
  subjectShort: string;
  hoursPerWeek: number;
  teacherShort: string;
  studentCount: number;
}

export interface ImportResult {
  success: boolean;
  imported: {
    teachers: number;
    subjects: number; 
    classes: number;
    assignments: number;
  };
  errors: string[];
  warnings: string[];
}

export class LessonDistributionImporter {
  constructor(private storage: IStorage) {}

  async importFromExcel(filePath: string, schoolYearId: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: { teachers: 0, subjects: 0, classes: 0, assignments: 0 },
      errors: [],
      warnings: []
    };

    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = 'Detail je Fach';
      
      if (!workbook.SheetNames.includes(sheetName)) {
        result.errors.push(`Arbeitsblatt "${sheetName}" nicht gefunden`);
        return result;
      }

      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Parse lesson distribution records
      const records: LessonDistributionRecord[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Skip empty rows
        if (!row || row.length < 4) continue;
        
        const className = row[0]?.toString().trim();
        const subjectShort = row[1]?.toString().trim();
        const hoursPerWeek = parseFloat(row[2]);
        const teacherShort = row[3]?.toString().trim();
        const studentCount = parseInt(row[7]) || 30; // Default to 30 if not specified
        
        // Validate required fields
        if (!className || !subjectShort || isNaN(hoursPerWeek) || !teacherShort) {
          result.warnings.push(`Zeile ${i + 1}: Unvollständige Daten übersprungen`);
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

      if (process.env.DEBUG_IMPORT === 'true') {
        console.log(`Gefundene Datensätze: ${records.length}`);
      }

      // Extract unique entities
      const uniqueTeachers = new Set(records.map(r => r.teacherShort));
      const uniqueSubjects = new Set(records.map(r => r.subjectShort));
      const uniqueClasses = new Map<string, { grade: number, studentCount: number }>();
      
      // Group classes and determine student counts
      records.forEach(r => {
        const grade = parseInt(r.className.match(/(\d+)/)?.[1] || '5');
        if (!uniqueClasses.has(r.className)) {
          uniqueClasses.set(r.className, { grade, studentCount: r.studentCount });
        }
      });

      // Get existing data from database
      const [existingTeachers, existingSubjects, existingClasses] = await Promise.all([
        this.storage.getTeachers(),
        this.storage.getSubjects(),
        this.storage.getClassesBySchoolYear(schoolYearId)
      ]);

      const existingTeacherShorts = new Set(existingTeachers.map(t => t.shortName));
      const existingSubjectShorts = new Set(existingSubjects.map(s => s.shortName));
      const existingClassNames = new Set(existingClasses.map(c => c.name));

      // BULK INSERT: Collect missing teachers and create in parallel
      const teachersToCreate: InsertTeacher[] = [];
      for (const teacherShort of Array.from(uniqueTeachers)) {
        if (!existingTeacherShorts.has(teacherShort)) {
          teachersToCreate.push({
            firstName: teacherShort,
            lastName: '(Importiert)',
            shortName: teacherShort,
            email: `${teacherShort.toLowerCase()}@schule.de`,
            subjects: [],
            maxHours: '25',
            currentHours: '0',
            qualifications: [],
            isActive: true
          });
        }
      }
      
      // Create all teachers in parallel
      if (teachersToCreate.length > 0) {
        await Promise.all(
          teachersToCreate.map(teacher => this.storage.createTeacher(teacher))
        );
        result.imported.teachers = teachersToCreate.length;
      }

      // Create missing subjects with NRW mapping
      const nrwSubjectMapping: { [key: string]: string } = {
        'D': 'Deutsch',
        'E': 'Englisch', 
        'M': 'Mathematik',
        'GE': 'Geschichte',
        'EK': 'Erdkunde',
        'PK': 'Politik',
        'BI': 'Biologie',
        'CH': 'Chemie',
        'PH': 'Physik',
        'SP': 'Sport',
        'KU': 'Kunst',
        'MU': 'Musik',
        'IF': 'Informatik',
        'TC': 'Technik',
        'HW': 'Hauswirtschaft',
        'Fs': 'Französisch',
        'SW': 'Sozialwissenschaften',
        'KR': 'Katholische Religionslehre',
        'ER': 'Evangelische Religionslehre',
        'PP': 'Praktische Philosophie',
        'IKG': 'Islamkunde',
        'WP': 'Wahlpflichtbereich'
      };

      // BULK INSERT: Collect missing subjects and create in parallel
      const subjectsToCreate: InsertSubject[] = [];
      for (const subjectShort of Array.from(uniqueSubjects)) {
        if (!existingSubjectShorts.has(subjectShort)) {
          subjectsToCreate.push({
            name: nrwSubjectMapping[subjectShort] || subjectShort,
            shortName: subjectShort,
            category: this.getSubjectCategory(subjectShort),
            hoursPerWeek: {},
            parallelGroup: this.getParallelGroup(subjectShort)
          });
        }
      }
      
      // Create all subjects in parallel
      if (subjectsToCreate.length > 0) {
        await Promise.all(
          subjectsToCreate.map(subject => this.storage.createSubject(subject))
        );
        result.imported.subjects = subjectsToCreate.length;
      }

      // BULK INSERT: Collect missing classes and create in parallel
      const classesToCreate: InsertClass[] = [];
      for (const [className, classInfo] of Array.from(uniqueClasses.entries())) {
        if (!existingClassNames.has(className)) {
          classesToCreate.push({
            name: className,
            type: "klasse",
            grade: classInfo.grade,
            studentCount: classInfo.studentCount,
            schoolYearId: schoolYearId,
            subjectHours: {},
            targetHoursSemester1: null,
            targetHoursSemester2: null
          });
        }
      }
      
      // Create all classes in parallel
      if (classesToCreate.length > 0) {
        await Promise.all(
          classesToCreate.map(classData => this.storage.createClass(classData))
        );
        result.imported.classes = classesToCreate.length;
      }

      // PERFORMANCE OPTIMIZATION: Load all data once and create lookup maps
      const [updatedTeachers, updatedSubjects, updatedClasses, existingAssignments] = await Promise.all([
        this.storage.getTeachers(),
        this.storage.getSubjects(),
        this.storage.getClassesBySchoolYear(schoolYearId),
        this.storage.getAssignmentsBySchoolYear(schoolYearId)
      ]);

      // Create O(1) lookup maps
      const teacherMap = new Map(updatedTeachers.map(t => [t.shortName, t]));
      const subjectMap = new Map(updatedSubjects.map(s => [s.shortName, s]));
      const classMap = new Map(updatedClasses.map(c => [c.name, c]));
      
      // Create assignment existence set for O(1) lookup
      const assignmentSet = new Set(
        existingAssignments.map(a => `${a.teacherId}-${a.subjectId}-${a.classId}`)
      );

      // BULK INSERT: Collect assignments to create
      const assignmentsToCreate: InsertAssignment[] = [];
      
      for (const record of records) {
        const teacher = teacherMap.get(record.teacherShort);
        const subject = subjectMap.get(record.subjectShort);
        const classObj = classMap.get(record.className);

        if (!teacher || !subject || !classObj) {
          result.warnings.push(`Zuordnung übersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className} (fehlende Entität)`);
          continue;
        }

        // O(1) lookup to check if assignment already exists
        const assignmentKey = `${teacher.id}-${subject.id}-${classObj.id}`;
        if (!assignmentSet.has(assignmentKey)) {
          assignmentsToCreate.push({
            teacherId: teacher.id,
            subjectId: subject.id,
            classId: classObj.id,
            schoolYearId: schoolYearId,
            hoursPerWeek: record.hoursPerWeek.toString(),
            semester: "1" // Default to first semester
          });
          assignmentSet.add(assignmentKey); // Add to set to prevent duplicates from Excel data
        } else {
          result.warnings.push(`Duplikat übersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className}`);
        }
      }
      
      // Create all assignments in parallel
      if (assignmentsToCreate.length > 0) {
        await Promise.all(
          assignmentsToCreate.map(assignment => this.storage.createAssignment(assignment))
        );
        result.imported.assignments = assignmentsToCreate.length;
      }

      result.success = true;
      if (process.env.DEBUG_IMPORT === 'true') {
        console.log('Import erfolgreich abgeschlossen:', result.imported);
      }
      
    } catch (error) {
      result.errors.push(`Import-Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      console.error('Import error:', error);
    }

    return result;
  }

  private getSubjectCategory(shortName: string): string {
    const categories: { [key: string]: string } = {
      'D': 'Hauptfach',
      'E': 'Hauptfach',
      'M': 'Hauptfach',
      'GE': 'Nebenfach',
      'EK': 'Nebenfach', 
      'PK': 'Nebenfach',
      'BI': 'Naturwissenschaft',
      'CH': 'Naturwissenschaft',
      'PH': 'Naturwissenschaft',
      'SP': 'Sport',
      'KU': 'Kunst/Musik',
      'MU': 'Kunst/Musik',
      'IF': 'Wahlpflicht',
      'TC': 'Wahlpflicht',
      'HW': 'Wahlpflicht',
      'Fs': 'Wahlpflicht',
      'SW': 'Wahlpflicht',
      'KR': 'Religion',
      'ER': 'Religion',
      'PP': 'Religion',
      'IKG': 'Religion'
    };
    
    return categories[shortName] || 'Sonstiges';
  }

  private getParallelGroup(shortName: string): string | null {
    // Define parallel groups for subjects that run at the same time
    if (['KR', 'ER', 'PP', 'IKG'].includes(shortName)) {
      return 'Religion';
    }
    if (['Fs', 'SW', 'IF', 'TC', 'HW'].includes(shortName)) {
      return 'Differenzierung';
    }
    return null;
  }

  // NEW: Validated import method that only allows assignments matching teacher subjects
  async importFromExcelValidated(filePath: string, schoolYearId: string): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: { teachers: 0, subjects: 0, classes: 0, assignments: 0 },
      errors: [],
      warnings: []
    };

    try {
      const debugImport = process.env.DEBUG_IMPORT === 'true';
      
      if (debugImport) {
        console.log('=== VALIDIERTER EXCEL-IMPORT GESTARTET ===');
      }
      
      // Load current teacher data with their correct subjects
      const existingTeachers = await this.storage.getTeachers();
      const teacherSubjectsMap: { [shortName: string]: string[] } = {};
      
      existingTeachers.forEach(teacher => {
        if (teacher.subjects && Array.isArray(teacher.subjects)) {
          teacherSubjectsMap[teacher.shortName] = teacher.subjects;
        } else {
          teacherSubjectsMap[teacher.shortName] = [];
        }
      });

      if (debugImport) {
        console.log('Geladene Lehrerdaten:', Object.keys(teacherSubjectsMap).length);
      }

      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      let foundSheet = null;
      
      // Try different common sheet names
      const possibleSheetNames = [
        'Detail je Fach',
        'Unterrichtsverteilung', 
        'Sheet1',
        'Tabelle1',
        workbook.SheetNames[0] // Fallback to first sheet
      ];
      
      for (const sheetName of possibleSheetNames) {
        if (workbook.SheetNames.includes(sheetName)) {
          foundSheet = sheetName;
          break;
        }
      }
      
      if (!foundSheet) {
        result.errors.push(`Kein passendes Arbeitsblatt gefunden. Verfügbare Blätter: ${workbook.SheetNames.join(', ')}`);
        return result;
      }

      if (debugImport) {
        console.log(`Verwende Arbeitsblatt: ${foundSheet}`);
      }
      const worksheet = workbook.Sheets[foundSheet];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      if (debugImport) {
        console.log(`Gesamte Zeilen in Excel: ${data.length}`);
      }

      // Parse lesson distribution records with validation
      const records: LessonDistributionRecord[] = [];
      const validationErrors: string[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Skip empty rows
        if (!row || row.length < 4) continue;
        
        const className = row[0]?.toString().trim();
        const subjectShort = row[1]?.toString().trim();
        const hoursPerWeek = parseFloat(row[2]);
        const teacherShort = row[3]?.toString().trim();
        const studentCount = parseInt(row[7]) || 30;
        
        // Validate required fields
        if (!className || !subjectShort || isNaN(hoursPerWeek) || !teacherShort) {
          result.warnings.push(`Zeile ${i + 1}: Unvollständige Daten übersprungen (${className}, ${subjectShort}, ${teacherShort})`);
          continue;
        }

        // CRITICAL: Validate if teacher is qualified for this subject
        const teacherSubjects = teacherSubjectsMap[teacherShort];
        if (!teacherSubjects) {
          validationErrors.push(`Zeile ${i + 1}: Lehrer ${teacherShort} nicht in Lehrerdaten gefunden`);
          continue;
        }

        // STRICT VALIDATION: Check if subject matches teacher's qualifications
        // Only allow EXACT matches or very specific mappings to prevent false positives
        const subjectMatches = teacherSubjects.some(ts => {
          // 1. Direct exact match
          if (ts === subjectShort) return true;
          
          // 2. Case-insensitive exact match  
          if (ts.toLowerCase() === subjectShort.toLowerCase()) return true;
          
          // 3. Only very specific, documented mappings to prevent errors
          const strictMappings: { [subjectRequested: string]: string[] } = {
            // If Excel asks for 'D', teacher can have 'D' or 'Deutsch' 
            'D': ['D', 'Deutsch'],
            'E': ['E', 'Englisch', 'English'],
            'M': ['M', 'Mathe', 'Mathematik'],
            // If Excel asks for 'Fs', teacher must have 'Fs', 'F' or 'Französisch' 
            'Fs': ['Fs', 'F', 'Französisch'],
            'GE': ['GE', 'Ge', 'Geschichte'],
            'EK': ['EK', 'Ek', 'Erdkunde'],
            // These subjects need exact matches to prevent confusion
            'PK': ['PK', 'Pk', 'Politik'],
            'SW': ['SW', 'Sozialwissenschaften'],
            'SP': ['SP', 'Sp', 'Sport'], 
            'BI': ['BI', 'Bi', 'Biologie'],
            'CH': ['CH', 'Ch', 'Chemie'],
            'PH': ['PH', 'Ph', 'Physik'],
            'KU': ['KU', 'Ku', 'Kunst'],
            'MU': ['MU', 'Mu', 'Musik'],
            'IF': ['IF', 'If', 'Informatik', 'IKG', 'Ikg'],
            // IKG in Excel should map to Informatik qualifications
            'IKG': ['IKG', 'Ikg', 'IF', 'If', 'Informatik'],
            'TC': ['TC', 'Tc', 'Technik'],
            'HW': ['HW', 'Hauswirtschaft'],
            'KR': ['KR', 'Kr', 'katholische Religion'],
            'ER': ['ER', 'Er', 'evangelische Religion'],
            'PP': ['PP', 'Pp', 'Praktische Philosophie']
          };
          
          // Check if the requested subject has allowed teacher qualifications
          const allowedTeacherSubjects = strictMappings[subjectShort];
          if (allowedTeacherSubjects) {
            return allowedTeacherSubjects.includes(ts);
          }
          
          return false;
        });

        if (!subjectMatches) {
          validationErrors.push(`Zeile ${i + 1}: ${teacherShort} ist nicht qualifiziert für ${subjectShort}. Qualifikationen: [${teacherSubjects.join(', ')}]`);
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

      if (debugImport) {
        console.log(`Gültige Datensätze nach Validierung: ${records.length}`);
        console.log(`Validierungsfehler: ${validationErrors.length}`);
      }
      
      // Add validation errors as warnings
      result.warnings.push(...validationErrors);

      if (records.length === 0) {
        result.errors.push('Keine gültigen Datensätze gefunden, die mit den Lehrerdaten übereinstimmen');
        return result;
      }

      // Continue with normal import process for valid records...
      // Extract unique entities
      const uniqueTeachers = new Set(records.map(r => r.teacherShort));
      const uniqueSubjects = new Set(records.map(r => r.subjectShort));
      const uniqueClasses = new Map<string, { grade: number, studentCount: number }>();
      
      // Group classes and determine student counts
      records.forEach(r => {
        const grade = parseInt(r.className.match(/(\d+)/)?.[1] || '5');
        if (!uniqueClasses.has(r.className)) {
          uniqueClasses.set(r.className, { grade, studentCount: r.studentCount });
        }
      });

      // Get existing data from database
      const [existingSubjects, existingClasses] = await Promise.all([
        this.storage.getSubjects(),
        this.storage.getClassesBySchoolYear(schoolYearId)
      ]);

      const existingSubjectShorts = new Set(existingSubjects.map(s => s.shortName));
      const existingClassNames = new Set(existingClasses.map(c => c.name));

      // Create missing subjects with NRW mapping
      const nrwSubjectMapping: { [key: string]: string } = {
        'D': 'Deutsch',
        'E': 'Englisch', 
        'M': 'Mathematik',
        'GE': 'Geschichte',
        'EK': 'Erdkunde',
        'PK': 'Politik',
        'BI': 'Biologie',
        'CH': 'Chemie',
        'PH': 'Physik',
        'SP': 'Sport',
        'KU': 'Kunst',
        'MU': 'Musik',
        'IF': 'Informatik',
        'TC': 'Technik',
        'HW': 'Hauswirtschaft',
        'Fs': 'Französisch',
        'SW': 'Sozialwissenschaften',
        'KR': 'Katholische Religionslehre',
        'ER': 'Evangelische Religionslehre',
        'PP': 'Praktische Philosophie',
        'IKG': 'Islamkunde',
        'WP': 'Wahlpflichtbereich'
      };

      // BULK INSERT: Collect missing subjects and create in parallel
      const subjectsToCreate: InsertSubject[] = [];
      for (const subjectShort of Array.from(uniqueSubjects)) {
        if (!existingSubjectShorts.has(subjectShort)) {
          subjectsToCreate.push({
            name: nrwSubjectMapping[subjectShort] || subjectShort,
            shortName: subjectShort,
            category: this.getSubjectCategory(subjectShort),
            hoursPerWeek: {},
            parallelGroup: this.getParallelGroup(subjectShort)
          });
        }
      }
      
      // Create all subjects in parallel
      if (subjectsToCreate.length > 0) {
        await Promise.all(
          subjectsToCreate.map(subject => this.storage.createSubject(subject))
        );
        result.imported.subjects = subjectsToCreate.length;
      }

      // BULK INSERT: Collect missing classes and create in parallel
      const classesToCreate: InsertClass[] = [];
      for (const [className, classInfo] of Array.from(uniqueClasses.entries())) {
        if (!existingClassNames.has(className)) {
          classesToCreate.push({
            name: className,
            type: "klasse",
            grade: classInfo.grade,
            studentCount: classInfo.studentCount,
            schoolYearId: schoolYearId,
            subjectHours: {},
            targetHoursSemester1: null,
            targetHoursSemester2: null
          });
        }
      }
      
      // Create all classes in parallel
      if (classesToCreate.length > 0) {
        await Promise.all(
          classesToCreate.map(classData => this.storage.createClass(classData))
        );
        result.imported.classes = classesToCreate.length;
      }

      // BULK DELETE: Clear existing assignments for this school year before importing new ones
      const existingAssignments = await this.storage.getAssignmentsBySchoolYear(schoolYearId);
      if (existingAssignments.length > 0) {
        await Promise.all(
          existingAssignments.map(assignment => this.storage.deleteAssignment(assignment.id))
        );
      }

      // PERFORMANCE OPTIMIZATION: Load all data once and create lookup maps
      const [updatedTeachers, updatedSubjects, updatedClasses] = await Promise.all([
        this.storage.getTeachers(),
        this.storage.getSubjects(),
        this.storage.getClassesBySchoolYear(schoolYearId)
      ]);

      // Create O(1) lookup maps
      const teacherMap = new Map(updatedTeachers.map(t => [t.shortName, t]));
      const subjectMap = new Map(updatedSubjects.map(s => [s.shortName, s]));
      const classMap = new Map(updatedClasses.map(c => [c.name, c]));
      
      // Create set to prevent duplicate assignments from Excel data
      const createdAssignments = new Set<string>();

      // BULK INSERT: Collect assignments to create (only for validated records)
      const assignmentsToCreate: InsertAssignment[] = [];
      
      for (const record of records) {
        const teacher = teacherMap.get(record.teacherShort);
        const subject = subjectMap.get(record.subjectShort);
        const classObj = classMap.get(record.className);

        if (!teacher || !subject || !classObj) {
          result.warnings.push(`Zuordnung übersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className} (fehlende Entität)`);
          continue;
        }

        // O(1) check to prevent duplicate assignments from Excel data
        const assignmentKey = `${teacher.id}-${subject.id}-${classObj.id}`;
        if (createdAssignments.has(assignmentKey)) {
          result.warnings.push(`Duplikat übersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className}`);
          continue;
        }

        assignmentsToCreate.push({
          teacherId: teacher.id,
          subjectId: subject.id,
          classId: classObj.id,
          schoolYearId: schoolYearId,
          hoursPerWeek: record.hoursPerWeek.toString(),
          semester: "1" // Default to first semester
        });
        createdAssignments.add(assignmentKey);
      }
      
      // Create all assignments in parallel
      if (assignmentsToCreate.length > 0) {
        await Promise.all(
          assignmentsToCreate.map(assignment => this.storage.createAssignment(assignment))
        );
        result.imported.assignments = assignmentsToCreate.length;
      }

      result.success = true;
      if (debugImport) {
        console.log('=== VALIDIERTER IMPORT ERFOLGREICH ABGESCHLOSSEN ===');
        console.log('Import-Ergebnis:', result.imported);
        console.log(`Validierungsfehler: ${validationErrors.length}`);
      }
      
    } catch (error) {
      result.errors.push(`Import-Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      console.error('Validierter Import-Fehler:', error);
    }

    return result;
  }
}