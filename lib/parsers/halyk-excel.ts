import * as XLSX from 'xlsx'

/**
 * Parse Halyk Bank (Народный банк) Excel statement.
 * Supports the standard export format with columns:
 * Дата, Назначение/Описание, Контрагент, БИН, Дебет, Кредит
 */
export function parseHalykExcel(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (rows.length < 2) return []

  // Find header row — first row containing 'дата' and ('дебет' or 'кредит')
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((v: any) => String(v).toLowerCase().trim())
    const hasDate = cells.some(c => c.includes('дата'))
    const hasMoney = cells.some(c => c.includes('дебет') || c.includes('кредит') || c.includes('debit') || c.includes('credit'))
    if (hasDate && hasMoney) { headerIdx = i; break }
  }
  if (headerIdx === -1) return []

  const headers = rows[headerIdx].map((v: any) => String(v).toLowerCase().trim())

  function col(...keywords: string[]): number {
    return headers.findIndex(h => keywords.some(k => h.includes(k)))
  }

  // Column indices — handle various naming conventions
  const colDate    = col('дата опер', 'дата пров', 'дата вал', 'дата')
  const colDebit   = col('дебет', 'debit', 'расход', 'списан')   // expense
  const colCredit  = col('кредит', 'credit', 'приход', 'зачислен') // income
  const colDesc    = col('назначение', 'описание', 'description', 'наимен операц')
  const colCpty    = col('контрагент', 'наименование контр', 'плательщик', 'получатель')

  if (colDate === -1 || (colDebit === -1 && colCredit === -1)) return []

  const transactions: any[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]

    // Parse date — Excel serial number or string DD.MM.YYYY / YYYY-MM-DD
    let entryDate = ''
    const rawDate = row[colDate]
    if (!rawDate) continue

    if (typeof rawDate === 'number') {
      // Excel serial date
      const d = XLSX.SSF.parse_date_code(rawDate)
      if (!d) continue
      entryDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    } else {
      const s = String(rawDate).trim()
      // DD.MM.YYYY
      const m1 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
      if (m1) entryDate = `${m1[3]}-${m1[2]}-${m1[1]}`
      // YYYY-MM-DD
      else if (/^\d{4}-\d{2}-\d{2}/.test(s)) entryDate = s.slice(0, 10)
      // DD/MM/YYYY
      else {
        const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
        if (m2) entryDate = `${m2[3]}-${m2[2]}-${m2[1]}`
      }
    }
    if (!entryDate) continue

    // Parse amounts
    function parseAmt(v: any): number {
      if (v === '' || v === null || v === undefined) return 0
      if (typeof v === 'number') return Math.abs(v)
      const s = String(v).replace(/\s/g, '').replace(',', '.')
      return Math.abs(parseFloat(s) || 0)
    }

    const debitAmt  = colDebit  >= 0 ? parseAmt(row[colDebit])  : 0
    const creditAmt = colCredit >= 0 ? parseAmt(row[colCredit]) : 0

    if (debitAmt === 0 && creditAmt === 0) continue

    const description  = colDesc >= 0 ? String(row[colDesc] ?? '').trim().substring(0, 150) : ''
    const counterparty = colCpty >= 0 ? String(row[colCpty] ?? '').trim().substring(0, 100) : ''

    // Auto-category
    const text = (description + ' ' + counterparty).toLowerCase()
    let category = 'other'
    if (text.includes('охран') || text.includes('абонент') || text.includes('пульт')) category = 'pulto'
    else if (text.includes('зарплат') || text.includes(' зп ') || text.includes('снятие нал')) category = 'zp'
    else if (text.includes('комисси') || text.includes('bank fee') || text.includes('обслужив')) category = 'komissia'
    else if (text.includes('налог') && !text.includes('охран')) category = 'nalog'
    else if (text.includes('монтаж') || text.includes('установк') || text.includes('подключ')) category = 'montazh'

    if (debitAmt > 0) {
      transactions.push({
        entry_date: entryDate, amount: debitAmt, bank: 'narodniy',
        type: 'expense', category, description, counterparty,
      })
    }
    if (creditAmt > 0) {
      transactions.push({
        entry_date: entryDate, amount: creditAmt, bank: 'narodniy',
        type: 'income', category: creditAmt > 0 && category === 'other' ? 'pulto' : category,
        description, counterparty,
      })
    }
  }

  return transactions
}
