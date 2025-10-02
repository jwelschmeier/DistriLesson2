import { readFile } from 'fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = process.argv[2];
const data = new Uint8Array(await readFile(pdfPath));

const loadingTask = getDocument({ data });
const pdf = await loadingTask.promise;

let fullText = '';

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const textContent = await page.getTextContent();
  const pageText = textContent.items.map(item => item.str).join(' ');
  fullText += pageText + '\n';
}

console.log(fullText);
