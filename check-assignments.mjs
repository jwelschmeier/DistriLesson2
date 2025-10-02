import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// PDF Assignments (parsed from PDF)
const pdfAssignments = [
  // BEU
  { teacher: 'BEU', subject: 'E', class: '05C', semester: '1', hours: 4 },
  { teacher: 'BEU', subject: 'E-FÖ', class: '05C', semester: '1', hours: 1 },
  { teacher: 'BEU', subject: 'EK', class: '07A', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '07B', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '07D', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '09C', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'E', class: '09D', semester: '1', hours: 4 },
  { teacher: 'BEU', subject: 'EK', class: '09D', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'GE', class: '09D', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'E', class: '10A', semester: '1', hours: 4 },
  { teacher: 'BEU', subject: 'EK', class: '10A', semester: '1', hours: 2 },
  { teacher: 'BEU', subject: 'PK', class: '05A', semester: '2', hours: 1 },
  { teacher: 'BEU', subject: 'E', class: '05C', semester: '2', hours: 4 },
  { teacher: 'BEU', subject: 'E-FÖ', class: '05C', semester: '2', hours: 1 },
  { teacher: 'BEU', subject: 'EK', class: '05C', semester: '2', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '07A', semester: '2', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '07B', semester: '2', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '07D', semester: '2', hours: 2 },
  { teacher: 'BEU', subject: 'EK', class: '09C', semester: '2', hours: 2 },
  { teacher: 'BEU', subject: 'E', class: '09D', semester: '2', hours: 4 },
  { teacher: 'BEU', subject: 'GE', class: '09D', semester: '2', hours: 2 },
  { teacher: 'BEU', subject: 'E', class: '10A', semester: '2', hours: 4 },
  { teacher: 'BEU', subject: 'EK', class: '10A', semester: '2', hours: 2 },
  
  // BHM
  { teacher: 'BHM', subject: 'BIO', class: '09D', semester: '2', hours: 2 },
  
  // BOE
  { teacher: 'BOE', subject: 'D', class: '05B', semester: '1', hours: 4 },
  { teacher: 'BOE', subject: 'D-FÖ', class: '05B', semester: '1', hours: 1 },
  { teacher: 'BOE', subject: 'FS', class: '07FS', semester: '1', hours: 3 },
  { teacher: 'BOE', subject: 'D', class: '05B', semester: '2', hours: 4 },
  { teacher: 'BOE', subject: 'D-FÖ', class: '05B', semester: '2', hours: 1 },
  { teacher: 'BOE', subject: 'FS', class: '07FS', semester: '2', hours: 3 },
  
  // DIE
  { teacher: 'DIE', subject: 'KU', class: '05A', semester: '1', hours: 2 },
  { teacher: 'DIE', subject: 'KU', class: '05D', semester: '1', hours: 2 },
  { teacher: 'DIE', subject: 'M-FÖ', class: '06A', semester: '1', hours: 1 },
  { teacher: 'DIE', subject: 'M', class: '06A', semester: '1', hours: 4 },
  { teacher: 'DIE', subject: 'TC', class: '07TK', semester: '1', hours: 3 },
  { teacher: 'DIE', subject: 'KU', class: '09A', semester: '1', hours: 2 },
  { teacher: 'DIE', subject: 'M', class: '10A', semester: '1', hours: 4 },
  { teacher: 'DIE', subject: 'KU', class: '10B', semester: '1', hours: 2 },
  { teacher: 'DIE', subject: 'KU', class: '05A', semester: '2', hours: 2 },
  { teacher: 'DIE', subject: 'KU', class: '05D', semester: '2', hours: 2 },
  { teacher: 'DIE', subject: 'M-FÖ', class: '06A', semester: '2', hours: 1 },
  { teacher: 'DIE', subject: 'M', class: '06A', semester: '2', hours: 4 },
  { teacher: 'DIE', subject: 'TC', class: '07TK', semester: '2', hours: 3 },
  { teacher: 'DIE', subject: 'KU', class: '09A', semester: '2', hours: 2 },
  { teacher: 'DIE', subject: 'M', class: '10A', semester: '2', hours: 4 },
  { teacher: 'DIE', subject: 'KU', class: '10C', semester: '2', hours: 2 },
  
  // DIR
  { teacher: 'DIR', subject: 'IF', class: '06A', semester: '1', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06B', semester: '1', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06C', semester: '1', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06D', semester: '1', hours: 1 },
  { teacher: 'DIR', subject: 'M', class: '07A', semester: '1', hours: 4 },
  { teacher: 'DIR', subject: 'PH', class: '07A', semester: '1', hours: 2 },
  { teacher: 'DIR', subject: 'PH', class: '07B', semester: '1', hours: 2 },
  { teacher: 'DIR', subject: 'PH', class: '07D', semester: '1', hours: 2 },
  { teacher: 'DIR', subject: 'PH', class: '07E', semester: '1', hours: 2 },
  { teacher: 'DIR', subject: 'M', class: '08B', semester: '1', hours: 4 },
  { teacher: 'DIR', subject: 'PH', class: '08D', semester: '1', hours: 2 },
  { teacher: 'DIR', subject: 'IF', class: '08INF', semester: '1', hours: 4 },
  { teacher: 'DIR', subject: 'M-FÖ', class: '10A', semester: '1', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06A', semester: '2', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06B', semester: '2', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06C', semester: '2', hours: 1 },
  { teacher: 'DIR', subject: 'IF', class: '06D', semester: '2', hours: 1 },
  { teacher: 'DIR', subject: 'M', class: '07A', semester: '2', hours: 4 },
  { teacher: 'DIR', subject: 'PH', class: '07A', semester: '2', hours: 2 },
  { teacher: 'DIR', subject: 'PH', class: '07B', semester: '2', hours: 2 },
  { teacher: 'DIR', subject: 'PH', class: '07D', semester: '2', hours: 2 },
  { teacher: 'DIR', subject: 'PH', class: '07E', semester: '2', hours: 2 },
  { teacher: 'DIR', subject: 'M', class: '08B', semester: '2', hours: 4 },
  { teacher: 'DIR', subject: 'PH', class: '08D', semester: '2', hours: 2 },
  { teacher: 'DIR', subject: 'IF', class: '08INF', semester: '2', hours: 4 },
  { teacher: 'DIR', subject: 'M-FÖ', class: '10A', semester: '2', hours: 1 },
];

async function checkAssignments() {
  console.log('Loading database data...\n');
  
  // Get all teachers, subjects, classes, and assignments
  const teachersResult = await pool.query('SELECT id, short_name FROM teachers');
  const subjectsResult = await pool.query('SELECT id, short_name FROM subjects');
  const classesResult = await pool.query('SELECT id, name FROM classes');
  const assignmentsResult = await pool.query(`
    SELECT a.id, t.short_name as teacher, s.short_name as subject, 
           c.name as class, a.semester, a.hours_per_week::text as hours
    FROM assignments a
    JOIN teachers t ON a.teacher_id = t.id
    JOIN subjects s ON a.subject_id = s.id
    JOIN classes c ON a.class_id = c.id
  `);
  
  const teachers = Object.fromEntries(teachersResult.rows.map(r => [r.short_name, r.id]));
  const subjects = Object.fromEntries(subjectsResult.rows.map(r => [r.short_name, r.id]));
  const classes = Object.fromEntries(classesResult.rows.map(r => [r.name.toUpperCase(), r.id]));
  const dbAssignments = assignmentsResult.rows;
  
  console.log(`Teachers: ${Object.keys(teachers).length}, Subjects: ${Object.keys(subjects).length}, Classes: ${Object.keys(classes).length}`);
  console.log(`Database assignments: ${dbAssignments.length}\n`);
  
  const missing = [];
  const existing = [];
  const mismatches = [];
  
  for (const pdfAssignment of pdfAssignments) {
    const teacherId = teachers[pdfAssignment.teacher];
    const subjectId = subjects[pdfAssignment.subject];
    const classId = classes[pdfAssignment.class];
    
    if (!teacherId) {
      missing.push({ ...pdfAssignment, reason: `Teacher ${pdfAssignment.teacher} not found` });
      continue;
    }
    if (!subjectId) {
      missing.push({ ...pdfAssignment, reason: `Subject ${pdfAssignment.subject} not found` });
      continue;
    }
    if (!classId) {
      missing.push({ ...pdfAssignment, reason: `Class ${pdfAssignment.class} not found` });
      continue;
    }
    
    const dbAssignment = dbAssignments.find(a => 
      a.teacher === pdfAssignment.teacher &&
      a.subject === pdfAssignment.subject &&
      a.class.toUpperCase() === pdfAssignment.class &&
      a.semester === pdfAssignment.semester
    );
    
    if (!dbAssignment) {
      missing.push(pdfAssignment);
    } else {
      const dbHours = parseFloat(dbAssignment.hours);
      if (dbHours !== pdfAssignment.hours) {
        mismatches.push({
          ...pdfAssignment,
          dbHours,
          pdfHours: pdfAssignment.hours
        });
      } else {
        existing.push(pdfAssignment);
      }
    }
  }
  
  console.log(`\n===== ZUSAMMENFASSUNG =====`);
  console.log(`PDF Zuweisungen: ${pdfAssignments.length}`);
  console.log(`✅ Bereits vorhanden (korrekt): ${existing.length}`);
  console.log(`⚠️  Stundenabweichung: ${mismatches.length}`);
  console.log(`❌ Fehlend: ${missing.length}\n`);
  
  if (mismatches.length > 0) {
    console.log(`\n===== STUNDENABWEICHUNGEN =====`);
    mismatches.forEach(m => {
      console.log(`${m.teacher} - ${m.subject} in ${m.class} (${m.semester}. HJ): DB=${m.dbHours}h, PDF=${m.pdfHours}h`);
    });
  }
  
  if (missing.length > 0) {
    console.log(`\n===== FEHLENDE ZUWEISUNGEN =====`);
    missing.forEach(m => {
      if (m.reason) {
        console.log(`❌ ${m.teacher} - ${m.subject} in ${m.class} (${m.semester}. HJ): ${m.reason}`);
      } else {
        console.log(`${m.teacher} - ${m.subject} in ${m.class} (${m.semester}. HJ): ${m.hours}h`);
      }
    });
  }
  
  await pool.end();
}

checkAssignments().catch(console.error);
