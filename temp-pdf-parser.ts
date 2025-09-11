import { readFileSync } from 'fs';

interface TimeSlot {
  time: string;
  assignments: Assignment[];
}

interface Assignment {
  teacher: string;
  class?: string;
  subject?: string;
  room?: string;
  notes?: string;
}

interface TeacherSchedule {
  teacher: string;
  schedule: TimeSlot[];
}

function parsePDFSchedule() {
  const pdfContent = readFileSync('./attached_assets/Franz-Stock-Realschule_1757609023907.pdf', 'utf-8');
  const lines = pdfContent.split('\n');
  
  const timeSlots = ['07:40', '08:30', '09:35', '10:25', '11:25', '12:15', '13:45', '14:35'];
  const teachers: string[] = [];
  const rooms = new Set<string>();
  const classes = new Set<string>();
  const subjects = new Set<string>();
  const validAssignments: Assignment[] = [];
  
  console.log('=== VORSICHTIGER PDF-PARSER ===');
  
  let currentTeacher = '';
  let inScheduleSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    
    // Identifiziere Lehrer-Abschnitte
    if (line.match(/^\s*[A-Z]{3}\s*$/) && line.length <= 10) {
      const teacherCode = line.trim();
      if (teacherCode.length === 3 && teacherCode.match(/^[A-Z]{3}$/)) {
        currentTeacher = teacherCode;
        teachers.push(teacherCode);
        inScheduleSection = true;
        continue;
      }
    }
    
    // Skip bis zur Stundenplan-Tabelle
    if (line.includes('Montag') && line.includes('Dienstag') && currentTeacher) {
      inScheduleSection = true;
      continue;
    }
    
    if (!inScheduleSection || !currentTeacher) continue;
    
    // Zeitslot-Erkennung
    for (const timeSlot of timeSlots) {
      if (line.startsWith(timeSlot)) {
        // Parse die Zeile nach dem Zeitslot
        const restOfLine = line.substring(timeSlot.length).trim();
        const parts = restOfLine.split(/\\s+/);
        
        // Extrahiere Räume (Format: Zahl.Zahl oder Buchstabe.Zahl)
        for (const part of parts) {
          if (part.match(/^[A-Z0-9][\\.][0-9]{2}$/)) {
            rooms.add(part);
          }
          if (part.match(/^[12]\\.\\d{2}$/)) {
            rooms.add(part);
          }
          if (part.match(/^[A-Z]\\.[0-9]{2}$/)) {
            rooms.add(part);
          }
        }
        
        // Extrahiere Klassen (Format: 5a, 6b, 7c, etc.)
        for (const part of parts) {
          if (part.match(/^[5-9][a-e]$/) || part.match(/^10[a-d]$/)) {
            classes.add(part);
          }
        }
        
        // Extrahiere standard Fächer (nur die, die wir sicher kennen)
        const knownSubjects = ['D', 'E', 'M', 'PH', 'CH', 'BI', 'GE', 'EK', 'PK', 'SW', 'SP', 'KU', 'MU', 'IF', 'TC', 'HW', 'KR', 'ER', 'PP', 'FS'];
        for (const part of parts) {
          if (knownSubjects.includes(part)) {
            subjects.add(part);
          }
        }
        break;
      }
    }
    
    // Stop wenn wir zum nächsten Lehrer kommen
    if (line.includes('zurück nach oben')) {
      inScheduleSection = false;
      currentTeacher = '';
    }
  }
  
  console.log(`Gefundene Lehrer: ${teachers.length}`);
  console.log(`Eindeutige Räume: ${rooms.size}`);
  console.log(`Eindeutige Klassen: ${classes.size}`);  
  console.log(`Bekannte Fächer: ${subjects.size}`);
  
  console.log('\\n=== EINDEUTIGE RÄUME ===');
  Array.from(rooms).sort().forEach(room => console.log(`  ${room}`));
  
  console.log('\\n=== EINDEUTIGE KLASSEN ===');
  Array.from(classes).sort().forEach(cls => console.log(`  ${cls}`));
  
  console.log('\\n=== ERKANNTE FÄCHER ===');
  Array.from(subjects).sort().forEach(subj => console.log(`  ${subj}`));
  
  return {
    teachers: Array.from(teachers),
    rooms: Array.from(rooms),
    classes: Array.from(classes),
    subjects: Array.from(subjects)
  };
}

// Führe Parser aus
try {
  const result = parsePDFSchedule();
  console.log('\\n=== PARSER ABGESCHLOSSEN ===');
  console.log('Nur eindeutig erkennbare Daten wurden extrahiert.');
} catch (error) {
  console.error('Fehler beim PDF-Parsing:', error);
}

process.exit(0);