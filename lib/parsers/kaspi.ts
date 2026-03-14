export function parseKaspi(text: string) {
  // Parsing logic specifically for the Kaspi text format
  const rows = text.split('\n');
  const transactions = [];
  
  // Kaspi format looks like: 
  // 87928632 27.08.2025
  // 22:17:20 12 000 АО "KASPI BANK" ... 190 Продажи с Kaspi.kz за ...
  
  let i = 0;
  while (i < rows.length) {
    const row = rows[i].trim();
    // Look for lines that start with a long number followed by a date
    const dateMatch = row.match(/^\d+\s+(\d{2}\.\d{2}\.\d{4})$/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const nextRow = rows[i+1] ? rows[i+1].trim() : '';
      
      // Match time, amount, bank name
      // Example: 22:17:20 12 000 АО "KASPI BANK" БИН/ИИН
      // Or: 22:17:20 114 ТОО Kaspi Pay БИН/ИИН
      const detailsMatch = nextRow.match(/^\d{2}:\d{2}:\d{2}\s+([\d\s,]+)\s+(.+?)\s+БИН/);
      
      if (detailsMatch) {
         const amountStr = detailsMatch[1].replace(/\s/g, '').replace(',', '.');
         const amount = parseFloat(amountStr);
         const counterparty = detailsMatch[2];
         
         // Try to find description in the current and next few lines
         let desc = nextRow;
         for(let j=1; j<=3; j++) {
            if (rows[i+1+j] && !rows[i+1+j].match(/^\d+\s+\d{2}\.\d{2}\.\d{4}$/) && !rows[i+1+j].match(/^-- \d of \d --/)) {
               desc += " " + rows[i+1+j].trim();
            } else {
               break;
            }
         }
         
         // Kaspi logic (Simple)
         let type = 'income';
         let category = 'other';
         
         if (desc.includes('Kaspi Pay') || desc.includes('Снятия наличных') || desc.includes('Комиссия')) {
            type = 'expense';
         }
         
         if (desc.includes('Продажи с Kaspi.kz') || desc.includes('охраны')) {
            type = 'income';
         }
         
         if (desc.includes('Снятия наличных')) {
             category = 'zp'; // often withdrawal is for salary or cash
         } else if (desc.includes('Kaspi Pay')) {
             category = 'other'; // commission
         }

         transactions.push({
           entry_date: dateStr.split('.').reverse().join('-'), // YYYY-MM-DD
           amount: amount,
           bank: 'kaspi',
           type: type,
           category: category,
           description: desc.substring(0, 150), // Truncate long descriptions
           counterparty: counterparty
         });
      }
    }
    i++;
  }
  return transactions;
}
