const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function extractText(filePath) {
  let parser;
  try {
    const dataBuffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    const outPath = filePath.replace('.pdf', '.txt');
    fs.writeFileSync(outPath, result.text);
    console.log(`Saved text to ${outPath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}

async function main() {
  await extractText('C:\\Users\\karik\\Desktop\\Выписка по счету 01.08.2025-31.08.2025.pdf');
  await extractText('C:\\Users\\karik\\Desktop\\Выписка_по_счету_KZ43722S000047296074_260313_161606.pdf');
}

main();
