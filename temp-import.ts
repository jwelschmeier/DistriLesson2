import { LessonDistributionImporter } from './server/lesson-distribution-importer';
import { storage } from './server/storage';

async function runValidatedImport() {
  try {
    console.log('=== DIREKTER VALIDIERTER IMPORT ===');
    
    // Get current school year
    const schoolYears = await storage.getSchoolYears();
    const currentSchoolYear = schoolYears.find(sy => sy.isCurrent) || schoolYears[0];
    
    if (!currentSchoolYear) {
      console.error('Kein Schuljahr gefunden');
      return;
    }
    
    console.log('Aktuelles Schuljahr:', currentSchoolYear.name);
    
    // Import with validation
    const importer = new LessonDistributionImporter(storage);
    const filePath = './attached_assets/Unterrichtsverteilung_je_Klasse_detailliert_1757607613065.xlsx';
    
    console.log('Starte validierten Import:', filePath);
    const result = await importer.importFromExcelValidated(filePath, currentSchoolYear.id);
    
    console.log('=== IMPORT-ERGEBNIS ===');
    console.log('Erfolgreich:', result.success);
    console.log('Importiert:', result.imported);
    console.log('Warnungen:', result.warnings.length);
    console.log('Fehler:', result.errors.length);
    
    if (result.warnings.length > 0) {
      console.log('\nWarnungen (erste 20):');
      result.warnings.slice(0, 20).forEach((w, i) => console.log(`${i+1}. ${w}`));
    }
    
    if (result.errors.length > 0) {
      console.log('\nFehler:');
      result.errors.forEach((e, i) => console.log(`${i+1}. ${e}`));
    }
    
  } catch (error) {
    console.error('Fehler beim Import:', error);
  }
  
  process.exit(0);
}

runValidatedImport();