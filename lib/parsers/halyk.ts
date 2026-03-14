export function parseHalyk(text: string) {
  // Parsing logic specifically for Halyk text format
  const rows = text.split('\n');
  const transactions = [];

  let isReadingTx = false;
  let currentTx: any = null;

  // Halyk format is complex, looks like:
  // БИН XXXXXX
  // Референс XXXX description...
  // Внешний референс: XXX
  // AMOUNT  REF_ID  DATE

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();

    // Looking for a line that starts with БИН/ИИН
    if (row.startsWith("БИН") || row.startsWith("ИИН")) {
        // We found a new counterparty block (usually preceded by counterparty name)
        currentTx = {
            counterparty: rows[i-1] ? rows[i-1].trim() : "Неизвестно",
            description: "",
            amount: 0,
            date: "",
            type: "expense" // Default, we will adjust
        };
        isReadingTx = true;
        continue;
    }

    if (isReadingTx) {
        if (row.startsWith("Референс")) {
            currentTx.description += " " + row;
            // Collect next few lines for description until "Внешний референс"
            let j = i + 1;
            while(j < rows.length && !rows[j].trim().startsWith("Внешний референс") && !rows[j].match(/^\d+[\s\d,]+\s+\w+\s+\d{2}\.\d{2}\.\d{4}$/)) {
                currentTx.description += " " + rows[j].trim();
                j++;
            }
        }

        // Looking for the line with amount and date at the end of the block
        // Example: 22 500,00 152 29.08.2025
        // Example: 1 000,00 003683826562 29.08.2025
        const endRowMatch = row.match(/^([\d\s]+,\d{2})\s+(\w+)\s+(\d{2}\.\d{2}\.\d{4})$/);
        
        // Sometimes it looks like:
        // AW1967779358 22.08.2025 (amount was on previous line)
        const alternateEndRowMatch = row.match(/^([a-zA-Z0-9]+)\s+(\d{2}\.\d{2}\.\d{4})$/);

        if (endRowMatch) {
            currentTx.amount = parseFloat(endRowMatch[1].replace(/\s/g, '').replace(',', '.'));
            currentTx.date = endRowMatch[3].split('.').reverse().join('-');
            
            // Determine Income/Expense based on description for Halyk
            if (currentTx.description.toLowerCase().includes("пополнение") || 
                currentTx.description.toLowerCase().includes("за услуги охраны")) {
                 currentTx.type = 'income';
            } else {
                 currentTx.type = 'expense';
            }

            // Categories
            if (currentTx.counterparty.includes("PetroRetail")) {
                currentTx.category = 'other'; // fuel
            } else if (currentTx.description.includes("охраны")) {
                currentTx.category = 'other'; // income category
            } else {
                currentTx.category = 'other';
            }

            // Clean up description
            currentTx.description = currentTx.description.substring(0, 150).trim();

            transactions.push({
               entry_date: currentTx.date,
               amount: currentTx.amount,
               bank: 'narodniy',
               type: currentTx.type,
               category: currentTx.category,
               description: currentTx.description,
               counterparty: currentTx.counterparty
            });
            isReadingTx = false;
        } else if (alternateEndRowMatch) {
            
            // Amount might be hidden in the description string or somewhere else. 
            // In the example: 140 000,00 Референс 3600697368 Пополнение... 
            const amtMatch = currentTx.description.match(/^([\d\s]+,\d{2})\s+Референс/);
            if(amtMatch) {
                 currentTx.amount = parseFloat(amtMatch[1].replace(/\s/g, '').replace(',', '.'));
                 currentTx.description = currentTx.description.replace(amtMatch[1], '').trim();
            } else {
                 currentTx.amount = 0; // Fallback
            }

            currentTx.date = alternateEndRowMatch[2].split('.').reverse().join('-');
            currentTx.type = 'income'; // Usually topups have this alternate ending in the example
            currentTx.category = 'other';
            
            transactions.push({
               entry_date: currentTx.date,
               amount: currentTx.amount,
               bank: 'narodniy',
               type: currentTx.type,
               category: currentTx.category,
               description: currentTx.description.substring(0, 150).trim(),
               counterparty: currentTx.counterparty
            });
            isReadingTx = false;
        }
    }
  }

  return transactions;
}
