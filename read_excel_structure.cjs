const XLSX = require('xlsx');
const fs = require('fs');

try {
  // Excel-Datei lesen
  const workbook = XLSX.readFile('attached_assets/planstellen1_1757773919161.xlsx');
  
  console.log('=== EXCEL-DATEI ANALYSE ===');
  console.log('Worksheets gefunden:', workbook.SheetNames);
  
  workbook.SheetNames.forEach((sheetName, index) => {
    console.log(`\n=== WORKSHEET ${index + 1}: ${sheetName} ===`);
    
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    
    console.log(`Bereich: ${XLSX.utils.encode_range(range)}`);
    
    // Alle Zellen mit Inhalt durchgehen
    const cellData = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellAddress];
        
        if (cell && (cell.v || cell.f)) {
          const cellInfo = {
            address: cellAddress,
            value: cell.v,
            formula: cell.f,
            type: cell.t,
            row: row + 1,
            col: String.fromCharCode(65 + col)
          };
          
          cellData.push(cellInfo);
        }
      }
    }
    
    // Strukturierte Ausgabe
    console.log(`\nGesamt ${cellData.length} Zellen mit Inhalt gefunden.`);
    
    // Erste 30 Zeilen anzeigen für Übersicht
    console.log('\n=== STRUKTUR (erste 30 Zellen) ===');
    cellData.slice(0, 30).forEach(cell => {
      console.log(`${cell.address} (Zeile ${cell.row}): "${cell.value}"${cell.formula ? ` [FORMEL: ${cell.formula}]` : ''}`);
    });
    
    // Zellen mit Formeln extra hervorheben
    const formulaCells = cellData.filter(cell => cell.formula);
    if (formulaCells.length > 0) {
      console.log('\n=== ALLE FORMELN ===');
      formulaCells.forEach(cell => {
        console.log(`${cell.address} (Zeile ${cell.row}): "${cell.value}" [FORMEL: ${cell.formula}]`);
      });
    }
    
    // Nach Zeilen gruppiert anzeigen für bessere Übersicht
    console.log('\n=== ZEILENWEISE STRUKTUR ===');
    const rowGroups = {};
    cellData.forEach(cell => {
      if (!rowGroups[cell.row]) rowGroups[cell.row] = [];
      rowGroups[cell.row].push(cell);
    });
    
    Object.keys(rowGroups).slice(0, 20).forEach(row => {
      const cells = rowGroups[row];
      const rowText = cells.map(cell => `${cell.col}: "${cell.value}"`).join(' | ');
      console.log(`Zeile ${row}: ${rowText}`);
    });
    
    // Als JSON für weitere Verarbeitung speichern
    const outputFile = `excel_data_${sheetName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    fs.writeFileSync(outputFile, JSON.stringify({
      sheetName,
      range: XLSX.utils.encode_range(range),
      cells: cellData,
      formulas: formulaCells
    }, null, 2));
    
    console.log(`\nDaten gespeichert in: ${outputFile}`);
  });
  
} catch (error) {
  console.error('Fehler beim Lesen der Excel-Datei:', error);
}