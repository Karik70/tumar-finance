export function parseKaspi(text: string) {
  const transactions: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let i = 0;
  while (i < lines.length) {
    // Doc# is 7-9 digits on its own line
    if (!/^\d{7,9}$/.test(lines[i])) { i++; continue; }

    // Must be followed by a date DD.MM.YYYY
    if (i + 1 >= lines.length || !/^\d{2}\.\d{2}\.\d{4}$/.test(lines[i + 1])) { i++; continue; }

    const date = lines[i + 1].split('.').reverse().join('-');
    let j = i + 2;

    // Skip time HH:MM:SS if present
    if (j < lines.length && /^\d{2}:\d{2}:\d{2}$/.test(lines[j])) j++;

    // Amount (digits, optional spaces as thousands separator, optional comma decimal)
    if (j >= lines.length) { i++; continue; }
    const amtRaw = lines[j].replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(amtRaw)) { i++; continue; }
    const amount = parseFloat(amtRaw);
    j++;

    // Counterparty + БИН/ИИН (strip the BIN part)
    let counterparty = '';
    if (j < lines.length) {
      counterparty = lines[j]
        .replace(/\s*БИН\/ИИН\s*\d+/, '')
        .replace(/\s*БИН\s*\d+/, '')
        .trim();
      j++;
    }

    // Skip IIK (starts with KZ)
    if (j < lines.length && /^KZ/.test(lines[j])) j++;

    // Skip BIK (e.g. CASPKZKA)
    if (j < lines.length && /^[A-Z]{4}KZ/.test(lines[j])) j++;

    // KNP — 2-3 digit code
    let knp = '';
    if (j < lines.length && /^\d{2,3}$/.test(lines[j])) {
      knp = lines[j];
      j++;
    }

    // Description — collect lines until next doc# anchor
    const descParts: string[] = [];
    while (j < lines.length && !/^\d{7,9}$/.test(lines[j])) {
      if (descParts.length >= 4) break;
      descParts.push(lines[j]);
      j++;
    }
    const description = descParts.join(' ').substring(0, 150);

    // Determine type and category from KNP
    let type: 'income' | 'expense';
    let category: string;

    switch (knp) {
      case '190':
        type = 'income';
        category = 'pulto'; // Kaspi.kz sales proceeds
        break;
      case '341':
        type = 'expense';
        category = 'zp'; // Cash withdrawal (typically salary)
        break;
      case '851':
        type = 'expense';
        category = 'komissia'; // Kaspi Pay service commission
        break;
      default:
        // Fallback: use description keywords
        if (description.toLowerCase().includes('продажи') || description.toLowerCase().includes('охран')) {
          type = 'income';
          category = 'pulto';
        } else if (description.toLowerCase().includes('комисс') || description.toLowerCase().includes('kaspi pay')) {
          type = 'expense';
          category = 'komissia';
        } else {
          type = 'expense';
          category = 'other';
        }
    }

    if (amount > 0) {
      transactions.push({
        entry_date: date,
        amount,
        bank: 'kaspi',
        type,
        category,
        description,
        counterparty,
      });
    }

    i = j;
  }

  return transactions;
}
