'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const fmt = (n: number) => n.toLocaleString('ru-RU')
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

type Client = {
  id: string
  pult_number: string
  name: string
  address: string | null
  phone: string | null
  monthly_rate: number
}

export default function PrintUnpaidPage() {
  const router = useRouter()
  const [unpaid, setUnpaid] = useState<Client[]>([])
  const [totalClients, setTotalClients] = useState(0)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthLabel = `${MONTHS_RU[now.getMonth()]} ${now.getFullYear()}`
  const printDate = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

  useEffect(() => {
    const s = createClient()
    s.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      loadData(s)
    })
  }, [])

  async function loadData(s: any) {
    const [cRes, pRes] = await Promise.all([
      s.from('clients').select('*').eq('is_active', true).order('pult_number'),
      s.from('pult_payments').select('client_id').eq('payment_month', currentMonth).eq('is_paid', true),
    ])
    const allClients: Client[] = cRes.data || []
    const paidIds = new Set((pRes.data || []).map((p: any) => p.client_id))
    setTotalClients(allClients.length)
    setUnpaid(allClients.filter(c => !paidIds.has(c.id)))
    setLoading(false)
  }

  const totalDebt = unpaid.reduce((s, c) => s + Number(c.monthly_rate), 0)

  if (loading) return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', color: '#000' }}>Загрузка...</div>
  )

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px 30px', maxWidth: 900, margin: '0 auto', color: '#000', background: '#fff', minHeight: '100vh' }}>

      {/* Toolbar — hidden on print */}
      <div className="no-print" style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 22px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          🖨️ Распечатать
        </button>
        <a
          href="/remotes"
          style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, textDecoration: 'none' }}
        >
          ← Назад к базе
        </a>
        <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>
          Не оплатили: {unpaid.length} из {totalClients}
        </span>
      </div>

      {/* Company header */}
      <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid #000' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
          ТОО «ТҰМАР КҮЗЕТ»
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>
          Список неоплатников за <u>{monthLabel}</u>
        </div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 6, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
          <span>Дата формирования: {printDate}</span>
          <span>Всего пультов: {totalClients}</span>
          <span>Не оплатили: {unpaid.length}</span>
          {totalDebt > 0 && <span>Сумма долга: {fmt(totalDebt)} ₸</span>}
        </div>
      </div>

      {unpaid.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: 16, color: '#4b5563' }}>
          Все клиенты оплатили за {monthLabel}
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 20 }}>
            <thead>
              <tr style={{ background: '#e5e7eb' }}>
                <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid #9ca3af', fontWeight: 700, width: 36 }}>№</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #9ca3af', fontWeight: 700, width: 80 }}>Пульт</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #9ca3af', fontWeight: 700 }}>Клиент / Объект</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #9ca3af', fontWeight: 700 }}>Адрес</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #9ca3af', fontWeight: 700, width: 120 }}>Телефон</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', border: '1px solid #9ca3af', fontWeight: 700, width: 100 }}>Сумма (₸)</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid #9ca3af', fontWeight: 700, width: 90 }}>Подпись</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db', textAlign: 'center', color: '#6b7280', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db', fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{c.pult_number}</td>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db', fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db', color: '#4b5563', fontSize: 11 }}>{c.address || '—'}</td>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db', color: '#4b5563', whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 600 }}>
                    {c.monthly_rate > 0 ? fmt(Number(c.monthly_rate)) : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', border: '1px solid #d1d5db' }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#e5e7eb' }}>
                <td colSpan={5} style={{ padding: '9px 10px', border: '1px solid #9ca3af', fontWeight: 700, textAlign: 'right', fontSize: 13 }}>
                  ИТОГО задолженность ({unpaid.length} клиентов):
                </td>
                <td style={{ padding: '9px 10px', border: '1px solid #9ca3af', textAlign: 'right', fontWeight: 700, fontSize: 15 }}>
                  {fmt(totalDebt)} ₸
                </td>
                <td style={{ padding: '9px 10px', border: '1px solid #9ca3af' }}>&nbsp;</td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures block */}
          <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 30, fontSize: 12 }}>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: 4, paddingBottom: 18 }}>&nbsp;</div>
              <div style={{ color: '#6b7280' }}>Составил</div>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: 4, paddingBottom: 18 }}>&nbsp;</div>
              <div style={{ color: '#6b7280' }}>Проверил</div>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: 4, paddingBottom: 18 }}>&nbsp;</div>
              <div style={{ color: '#6b7280' }}>Дата</div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 12mm 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}
