export function parseHalyk(text: string) {
  const transactions: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // DEBIT end line: amount (X XXX,XX) immediately followed by doc# digits and date
  // e.g. "22 500,0015229.08.2025" or "1 000,0000368382656229.08.2025"
  const debitEndRe = /^([\d][\d\s]*,\d{2})(\d*)(\d{2}\.\d{2}\.\d{4})$/;

  // CREDIT end line: alphanumeric doc# followed directly by date (no comma-amount prefix)
  // e.g. "7622.08.2025", "AW196777935822.08.2025", "ONB1D06E819.08.2025"
  const creditEndRe = /^([A-Za-z0-9]+)(\d{2}\.\d{2}\.\d{4})$/;

  type TxEnd = { idx: number; txType: 'debit' | 'credit'; amount?: number; date: string };
  const txEnds: TxEnd[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip lines with colons (metadata/labels) or very long lines
    if (line.includes(':') || line.length > 40) continue;

    const debitMatch = line.match(debitEndRe);
    if (debitMatch) {
      const amount = parseFloat(debitMatch[1].replace(/\s/g, '').replace(',', '.'));
      const date = debitMatch[3].split('.').reverse().join('-');
      txEnds.push({ idx: i, txType: 'debit', amount, date });
      continue;
    }

    const creditMatch = line.match(creditEndRe);
    if (creditMatch) {
      const date = creditMatch[2].split('.').reverse().join('-');
      txEnds.push({ idx: i, txType: 'credit', date });
    }
  }

  for (let t = 0; t < txEnds.length; t++) {
    const end = txEnds[t];
    const startIdx = t > 0 ? txEnds[t - 1].idx + 1 : 0;
    const blockLines = lines.slice(startIdx, end.idx + 1);

    let amount = end.amount ?? 0;
    const date = end.date;
    const type: 'income' | 'expense' = end.txType === 'debit' ? 'expense' : 'income';

    // For credit transactions: amount appears before "Референс" in the block
    if (end.txType === 'credit') {
      for (const line of blockLines) {
        // Pattern: "27 000,00Референс" or "27 000,00 Референс"
        const m = line.match(/^([\d][\d\s]*,\d{2})\s*Р[еэ]ференс/);
        if (m) {
          amount = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
          break;
        }
      }
    }

    // Find counterparty: lines immediately before "БИН XXXXXXXXX"
    let counterparty = '';
    for (let i = 0; i < blockLines.length; i++) {
      if (/^БИН \d{9,15}$/.test(blockLines[i])) {
        const nameParts: string[] = [];
        for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
          const l = blockLines[j];
          if (
            l.length < 2 ||
            /^\d+$/.test(l) ||
            l.includes(':') ||
            l.includes('Внешний') ||
            l.includes('Референс') ||
            l.includes('Обороты') ||
            l.includes('остаток') ||
            l.includes('период') ||
            l.startsWith('Дата') ||
            l.startsWith('ВЫПИСКА') ||
            l.startsWith('За период')
          ) break;
          nameParts.unshift(l);
        }
        counterparty = nameParts.join(' ').substring(0, 100);
        break;
      }
    }

    // Find description: first "Референс ..." line (not "Внешний референс")
    let description = '';
    for (const line of blockLines) {
      if (line.includes('Референс') && !line.includes('Внешний')) {
        // Remove leading amount if present (credit transactions)
        description = line.replace(/^[\d\s]+,\d{2}\s*/, '').trim();
        break;
      }
    }

    // Category from block content
    const blockText = blockLines.join(' ').toLowerCase();
    let category = 'other';
    if (blockText.includes('охран')) {
      category = type === 'income' ? 'pulto' : 'other';
    }
    if (blockText.includes('снятие') && blockText.includes('наличных')) category = 'zp';
    if (blockText.includes('зарплат') || blockText.includes(' зп ')) category = 'zp';
    if (blockText.includes('комисси') || blockText.includes('cmstake') || blockText.includes('onlinebank')) {
      category = 'komissia';
    }
    if (blockText.includes('налог') && !blockText.includes('охран')) category = 'nalog';

    if (amount > 0 && date) {
      transactions.push({
        entry_date: date,
        amount,
        bank: 'narodniy',
        type,
        category,
        description: description.substring(0, 150),
        counterparty,
      });
    }
  }

  return transactions;
}
