import fs from 'fs';
import pdf from 'pdf-parse';

async function extractText(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    console.log(`\n\n--- EXTRACTED TEXT FROM: ${filePath} ---\n`);
    // Print first 2000 characters to see the structure
    console.log(data.text.substring(0, 5000));
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

async function main() {
  await extractText('C:\\Users\\karik\\Desktop\\Выписка по счету 01.08.2025-31.08.2025.pdf');
  await extractText('C:\\Users\\karik\\Desktop\\Выписка_по_счету_KZ43722S000047296074_260313_161606.pdf');
}

main();
