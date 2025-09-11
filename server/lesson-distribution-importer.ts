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

      console.log(`Gefundene Datensätze: ${records.length}`);

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

      // Create missing teachers
      for (const teacherShort of Array.from(uniqueTeachers)) {
        if (!existingTeacherShorts.has(teacherShort)) {
          const teacher: InsertTeacher = {
            firstName: teacherShort,
            lastName: '(Importiert)',
            shortName: teacherShort,
            email: `${teacherShort.toLowerCase()}@schule.de`,
            subjects: [],
            maxHours: '25',
            currentHours: '0',
            qualifications: [],
            isActive: true
          };
          
          await this.storage.createTeacher(teacher);
          result.imported.teachers++;
        }
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

      for (const subjectShort of Array.from(uniqueSubjects)) {
        if (!existingSubjectShorts.has(subjectShort)) {
          const subject: InsertSubject = {
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

      // Create missing classes
      for (const [className, classInfo] of Array.from(uniqueClasses.entries())) {
        if (!existingClassNames.has(className)) {
          const classData: InsertClass = {
            name: className,
            grade: classInfo.grade,
            studentCount: classInfo.studentCount,
            schoolYearId: schoolYearId,
            subjectHours: {},
            targetHoursSemester1: null,
            targetHoursSemester2: null
          };
          
          await this.storage.createClass(classData);
          result.imported.classes++;
        }
      }

      // Refresh data after creating entities
      const [updatedTeachers, updatedSubjects, updatedClasses] = await Promise.all([
        this.storage.getTeachers(),
        this.storage.getSubjects(),
        this.storage.getClassesBySchoolYear(schoolYearId)
      ]);

      // Create teacher-subject-class assignments
      for (const record of records) {
        const teacher = updatedTeachers.find(t => t.shortName === record.teacherShort);
        const subject = updatedSubjects.find(s => s.shortName === record.subjectShort);
        const classObj = updatedClasses.find(c => c.name === record.className);

        if (!teacher || !subject || !classObj) {
          result.warnings.push(`Zuordnung übersprungen: ${record.teacherShort} -> ${record.subjectShort} in ${record.className} (fehlende Entität)`);
          continue;
        }

        // Check if assignment already exists
        const existingAssignments = await this.storage.getAssignmentsBySchoolYear(schoolYearId);
        const assignmentExists = existingAssignments.some(a => 
          a.teacherId === teacher.id && 
          a.subjectId === subject.id && 
          a.classId === classObj.id
        );

        if (!assignmentExists) {
          const assignment: InsertAssignment = {
            teacherId: teacher.id,
            subjectId: subject.id,
            classId: classObj.id,
            schoolYearId: schoolYearId,
            hoursPerWeek: record.hoursPerWeek,
            semester: "1" // Default to first semester
          };
          
          await this.storage.createAssignment(assignment);
          result.imported.assignments++;
        }
      }

      result.success = true;
      console.log('Import erfolgreich abgeschlossen:', result.imported);
      
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
}