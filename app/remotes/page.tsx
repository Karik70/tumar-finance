'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Papa from 'papaparse'

const fmt = (n: number) => n.toLocaleString('ru-RU')
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

type Client = {
  id: string
  pult_number: string
  name: string
  address: string | null
  phone: string | null
  monthly_rate: number
  is_active: boolean
}

type Payment = {
  id: string
  client_id: string
  payment_month: string
  is_paid: boolean
  payment_date: string | null
  notes: string | null
}

export default function RemotesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterUnpaid, setFilterUnpaid] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [form, setForm] = useState({ pult_number: '', name: '', address: '', phone: '', monthly_rate: '' })

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthLabel = `${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`

  useEffect(() => {
    const s = createClient()
    s.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      loadAll(s)
    })
  }, [])

  async function loadAll(s: any) {
    setLoading(true)
    const [cRes, pRes] = await Promise.all([
      s.from('clients').select('*').eq('is_active', true).order('pult_number'),
      s.from('pult_payments').select('*').eq('payment_month', currentMonth),
    ])
    setClients(cRes.data || [])
    setPayments(pRes.data || [])
    setLoading(false)
  }

  function getPayment(clientId: string) {
    return payments.find(p => p.client_id === clientId)
  }

  function isPaid(clientId: string) {
    return getPayment(clientId)?.is_paid || false
  }

  async function togglePaid(client: Client) {
    setSaving(client.id)
    const s = createClient()
    const existing = getPayment(client.id)
    if (existing) {
      const newPaid = !existing.is_paid
      const { data, error } = await s
        .from('pult_payments')
        .update({ is_paid: newPaid, payment_date: newPaid ? new Date().toISOString().slice(0, 10) : null })
        .eq('id', existing.id)
        .select()
        .single()
      if (!error && data) setPayments(prev => prev.map(p => p.id === existing.id ? data : p))
    } else {
      const { data, error } = await s
        .from('pult_payments')
        .insert({ client_id: client.id, payment_month: currentMonth, is_paid: true, payment_date: new Date().toISOString().slice(0, 10) })
        .select()
        .single()
      if (!error && data) setPayments(prev => [...prev, data])
    }
    setSaving(null)
  }

  async function addClient() {
    if (!form.pult_number.trim() || !form.name.trim()) return
    const s = createClient()
    const { data, error } = await s.from('clients').insert({
      pult_number: form.pult_number.trim(),
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      monthly_rate: parseFloat(form.monthly_rate) || 0,
      is_active: true,
    }).select().single()
    if (!error && data) {
      setClients(prev => [...prev, data].sort((a, b) => a.pult_number.localeCompare(b.pult_number, undefined, { numeric: true })))
      setForm({ pult_number: '', name: '', address: '', phone: '', monthly_rate: '' })
      setShowAdd(false)
    }
  }

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Читаю файл...')
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as string[][]
        const s = createClient()
        let imported = 0, skipped = 0
        for (const row of rows) {
          const [pult_number, name, address, phone, monthly_rate] = row.map(c => (c ?? '').trim())
          if (!pult_number || !name) { skipped++; continue }
          const { error } = await s.from('clients').upsert({
            pult_number,
            name,
            address: address || null,
            phone: phone || null,
            monthly_rate: parseFloat((monthly_rate || '0').replace(/[^\d.]/g, '')) || 0,
            is_active: true,
          }, { onConflict: 'pult_number' })
          if (!error) imported++
          else skipped++
        }
        setImportStatus(`Импортировано: ${imported}, пропущено: ${skipped}`)
        await loadAll(s)
        setTimeout(() => setImportStatus(null), 5000)
      },
    })
    e.target.value = ''
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !search || c.pult_number.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q)
    const matchFilter = !filterUnpaid || !isPaid(c.id)
    return matchSearch && matchFilter
  })

  const unpaidClients = clients.filter(c => !isPaid(c.id))
  const unpaidCount = unpaidClients.length
  const totalExpected = clients.reduce((s, c) => s + Number(c.monthly_rate), 0)
  const totalPaid = clients.filter(c => isPaid(c.id)).reduce((s, c) => s + Number(c.monthly_rate), 0)
  const totalDebt = unpaidClients.reduce((s, c) => s + Number(c.monthly_rate), 0)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text2)' }}>
      Загрузка...
    </div>
  )

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar userEmail={user?.email} />
      <main className="app-main" style={{ flex: 1, padding: '28px 32px', minWidth: 0 }}>

        {/* Header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>База пультов</h1>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>{monthLabel} — учёт оплат</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
            >
              📥 Импорт CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />
            <a
              href="/remotes/print"
              target="_blank"
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              🖨️ Печать неоплатников{unpaidCount > 0 ? ` (${unpaidCount})` : ''}
            </a>
            <button
              onClick={() => setShowAdd(!showAdd)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
            >
              + Добавить пульт
            </button>
          </div>
        </div>

        {/* Import status */}
        {importStatus && (
          <div style={{ background: 'var(--blue-bg)', border: '1px solid rgba(88,166,255,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--blue)' }}>
            {importStatus}
          </div>
        )}

        {/* KPI cards */}
        <div className="grid-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { l: 'Всего пультов', v: String(clients.length), c: 'var(--blue)', b: 'var(--blue-bg)', br: 'rgba(88,166,255,.25)' },
            { l: 'Оплатили', v: String(clients.length - unpaidCount), c: 'var(--green)', b: 'var(--green-bg)', br: 'rgba(63,185,80,.25)' },
            { l: 'Не оплатили', v: String(unpaidCount), c: 'var(--red)', b: 'var(--red-bg)', br: 'rgba(248,81,73,.25)' },
            { l: 'Поступило', v: fmt(totalPaid) + ' ₸', c: 'var(--green)', b: 'var(--green-bg)', br: 'rgba(63,185,80,.25)' },
            { l: 'Долг', v: fmt(totalDebt) + ' ₸', c: 'var(--red)', b: 'var(--red-bg)', br: 'rgba(248,81,73,.25)' },
            { l: 'Ожидается итого', v: fmt(totalExpected) + ' ₸', c: 'var(--text)', b: 'var(--bg2)', br: 'var(--border)' },
          ].map(({ l, v, c, b, br }) => (
            <div key={l} style={{ background: b, border: `1px solid ${br}`, borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Add client form */}
        {showAdd && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>Новый пульт</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
              {([
                { key: 'pult_number', label: 'Номер пульта *', type: 'text' },
                { key: 'name', label: 'Имя / объект *', type: 'text' },
                { key: 'address', label: 'Адрес', type: 'text' },
                { key: 'phone', label: 'Телефон', type: 'text' },
                { key: 'monthly_rate', label: 'Сумма/мес (₸)', type: 'number' },
              ] as const).map(({ key, label, type }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addClient} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>Сохранить</button>
              <button onClick={() => setShowAdd(false)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}>Отмена</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Поиск по пульту, имени, адресу..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, minWidth: 240 }}
          />
          <button
            onClick={() => setFilterUnpaid(!filterUnpaid)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid', borderColor: filterUnpaid ? 'var(--red)' : 'var(--border2)', background: filterUnpaid ? 'var(--red-bg)' : 'transparent', color: filterUnpaid ? 'var(--red)' : 'var(--text2)', fontSize: 13, cursor: 'pointer' }}
          >
            {filterUnpaid ? '✓ Только неоплатники' : 'Только неоплатники'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{filtered.length} из {clients.length}</span>
        </div>

        {/* Clients table */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Пульт №', 'Клиент / Объект', 'Адрес', 'Телефон', 'Сумма/мес', `Оплата — ${monthLabel}`].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap', background: 'var(--bg2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: 'var(--text3)' }}>Нет данных</td></tr>
                )}
                {filtered.map(c => {
                  const paid = isPaid(c.id)
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: paid ? 'transparent' : 'rgba(248,81,73,.04)' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap', color: 'var(--blue)' }}>{c.pult_number}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address || '—'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '9px 14px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text2)' }}>
                        {c.monthly_rate > 0 ? fmt(Number(c.monthly_rate)) + ' ₸' : '—'}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <button
                          onClick={() => togglePaid(c)}
                          disabled={saving === c.id}
                          style={{
                            padding: '5px 14px', borderRadius: 6, border: 'none',
                            background: paid ? 'var(--green-bg)' : 'var(--red-bg)',
                            color: paid ? 'var(--green)' : 'var(--red)',
                            fontSize: 12, cursor: saving === c.id ? 'wait' : 'pointer', fontWeight: 500,
                            opacity: saving === c.id ? 0.5 : 1, whiteSpace: 'nowrap',
                          }}
                        >
                          {saving === c.id ? '...' : paid ? '✓ Оплачено' : '✗ Не оплачено'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* CSV hint */}
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text3)' }}>
          Формат CSV для импорта (без заголовка):&nbsp;
          <code style={{ background: 'var(--bg2)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
            номер_пульта, имя/объект, адрес, телефон, сумма_в_месяц
          </code>
        </div>

      </main>
    </div>
  )
}
