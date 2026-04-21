'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureUserExists } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const fmt = (n: number) => n.toLocaleString('ru-RU')

type Guard = {
  surname: string; first_name: string; patronymic: string;
  is_official: boolean; days_worked: number; shifts_worked: number;
  salary: number; rate: number;
}

type GuardPost = {
  id: string; callsign: string; name: string; address: string;
  rate: number; contract_amount: number; external_id: string;
  is_internal: boolean;
  total_salary?: number; official_salary?: number; unofficial_salary?: number;
  guard_count?: number; official_count?: number; unofficial_count?: number;
  profit?: number;
  guards?: Guard[];
}

type SyncLog = {
  id: string; month: string; total_guards: number; official_count: number;
  unofficial_count: number; total_salary: number; official_salary: number;
  unofficial_salary: number; tax_estimate: number; synced_at: string;
}

export default function TimesheetPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [month, setMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })

  // Data
  const [guardPosts, setGuardPosts] = useState<GuardPost[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [expandedPost, setExpandedPost] = useState<string | null>(null)
  const [guardsByPost, setGuardsByPost] = useState<Record<string, Guard[]>>({})
  const [editingContract, setEditingContract] = useState<string | null>(null)
  const [contractValue, setContractValue] = useState('')

  // Sync settings
  const [dashboardUrl, setDashboardUrl] = useState('')
  const [integrationKey, setIntegrationKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const s = createClient()
    s.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push('/login'); return }
      await ensureUserExists(s, data.user)
      setUser(data.user)
      setDashboardUrl(localStorage.getItem('tumar_dashboard_url') || '')
      setIntegrationKey(localStorage.getItem('tumar_integration_key') || '')
      loadData(s)
    })
  }, [])

  useEffect(() => {
    if (user) { const s = createClient(); loadData(s) }
  }, [month])

  async function loadData(s: any) {
    setLoading(true)
    const [postsRes, logsRes] = await Promise.all([
      s.from('guard_posts').select('*').eq('is_active', true).order('callsign'),
      s.from('timesheet_sync_log').select('*').order('synced_at', { ascending: false }).limit(10),
    ])

    const posts: GuardPost[] = postsRes.data || []

    const { data: tsData } = await s
      .from('timesheet_entries')
      .select('guard_post_id, salary, is_official')
      .eq('month', month)

    const postTotals: Record<string, any> = {}
    ;(tsData || []).forEach((e: any) => {
      if (!postTotals[e.guard_post_id]) {
        postTotals[e.guard_post_id] = { total: 0, official: 0, unofficial: 0, count: 0, offCount: 0, unCount: 0 }
      }
      const t = postTotals[e.guard_post_id]
      t.total += Number(e.salary)
      t.count++
      if (e.is_official) { t.official += Number(e.salary); t.offCount++ }
      else { t.unofficial += Number(e.salary); t.unCount++ }
    })

    const enriched = posts.map(p => ({
      ...p,
      is_internal: p.is_internal || false,
      total_salary: postTotals[p.id]?.total || 0,
      official_salary: postTotals[p.id]?.official || 0,
      unofficial_salary: postTotals[p.id]?.unofficial || 0,
      guard_count: postTotals[p.id]?.count || 0,
      official_count: postTotals[p.id]?.offCount || 0,
      unofficial_count: postTotals[p.id]?.unCount || 0,
      profit: (Number(p.contract_amount) || 0) - (postTotals[p.id]?.total || 0),
    }))

    setGuardPosts(enriched)
    setSyncLogs(logsRes.data || [])
    setLoading(false)
  }

  async function loadGuardsForPost(postId: string) {
    const s = createClient()
    const { data } = await s
      .from('timesheet_entries')
      .select('*, guards(surname, first_name, patronymic, is_official, iin)')
      .eq('guard_post_id', postId)
      .eq('month', month)
      .order('salary', { ascending: false })

    const guards = (data || []).map((e: any) => ({
      surname: e.guards?.surname || '',
      first_name: e.guards?.first_name || '',
      patronymic: e.guards?.patronymic || '',
      is_official: e.guards?.is_official || false,
      days_worked: e.days_worked,
      shifts_worked: e.shifts_worked,
      salary: e.salary,
      rate: e.rate,
    }))

    setGuardsByPost(prev => ({ ...prev, [postId]: guards }))
  }

  async function togglePost(postId: string) {
    if (expandedPost === postId) {
      setExpandedPost(null)
    } else {
      setExpandedPost(postId)
      if (!guardsByPost[postId]) await loadGuardsForPost(postId)
    }
  }

  async function toggleInternal(postId: string, currentValue: boolean) {
    const s = createClient()
    await s.from('guard_posts').update({ is_internal: !currentValue }).eq('id', postId)
    setGuardPosts(prev => prev.map(p => p.id === postId ? { ...p, is_internal: !currentValue } : p))
  }

  async function syncFromDashboard() {
    if (!dashboardUrl || !integrationKey) {
      setMsg('Укажите URL и ключ интеграции в настройках')
      setShowSettings(true)
      return
    }

    setSyncing(true); setMsg('')
    try {
      const s = createClient()
      const { data: sessionData } = await s.auth.getSession()
      if (!sessionData.session) throw new Error('Сессия истекла. Войдите заново.')

      const syncRes = await fetch('/api/sync-timesheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          dashboardUrl: dashboardUrl.replace(/\/+$/, ''),
          integrationKey,
          month,
        }),
      })
      const result = await syncRes.json()
      if (!syncRes.ok) {
        const details = result.details ? `\n${result.details.join('\n')}` : ''
        throw new Error(`${result.error || `Sync API: ${syncRes.status}`}${details}`)
      }

      const warns = result.warnings ? ` (предупреждений: ${result.warnings.length})` : ''
      setMsg(`Синхронизировано: ${result.totalEntries} записей, ${result.postsLinked} постов${warns}`)
      loadData(s)
    } catch (err: any) {
      setMsg(`Ошибка: ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setMsg(''), 8000)
  }

  async function saveContract(postId: string) {
    const s = createClient()
    await s.from('guard_posts').update({ contract_amount: parseFloat(contractValue) || 0 }).eq('id', postId)
    setEditingContract(null)
    loadData(s)
  }

  function saveSettings() {
    localStorage.setItem('tumar_dashboard_url', dashboardUrl)
    localStorage.setItem('tumar_integration_key', integrationKey)
    setShowSettings(false)
    setMsg('Настройки сохранены')
    setTimeout(() => setMsg(''), 3000)
  }

  // Split into client objects and internal departments
  const clientPosts = guardPosts.filter(p => !p.is_internal)
  const internalPosts = guardPosts.filter(p => p.is_internal)

  // Totals — all
  const totalSalary = guardPosts.reduce((s, p) => s + (p.total_salary || 0), 0)
  const officialSalary = guardPosts.reduce((s, p) => s + (p.official_salary || 0), 0)
  const unofficialSalary = guardPosts.reduce((s, p) => s + (p.unofficial_salary || 0), 0)
  const totalGuards = guardPosts.reduce((s, p) => s + (p.guard_count || 0), 0)
  const taxEstimate = Math.round(officialSalary * 0.12)

  // Totals — client objects only
  const clientSalary = clientPosts.reduce((s, p) => s + (p.total_salary || 0), 0)
  const clientContract = clientPosts.reduce((s, p) => s + (Number(p.contract_amount) || 0), 0)
  const clientProfit = clientContract - clientSalary

  // Totals — internal
  const internalSalary = internalPosts.reduce((s, p) => s + (p.total_salary || 0), 0)

  const lastSync = syncLogs[0]

  const monthLabel = (() => {
    const d = new Date(month)
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
  })()

  // Reusable row renderer
  function renderPostRow(gp: GuardPost, showContract: boolean) {
    return (
      <>
        <tr key={gp.id} onClick={() => togglePost(gp.id)}
          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <td style={td}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{gp.callsign || gp.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{gp.address}</div>
              </div>
            </div>
          </td>
          <td style={{ ...td, textAlign: 'center', width: 40 }}>
            <button
              onClick={e => { e.stopPropagation(); toggleInternal(gp.id, gp.is_internal) }}
              style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: 'none',
                background: gp.is_internal ? '#dbeafe' : '#dcfce7',
                color: gp.is_internal ? '#1d4ed8' : '#166534',
              }}
              title={gp.is_internal ? 'Нажмите чтобы сделать объектом' : 'Нажмите чтобы сделать внутренним'}
            >
              {gp.is_internal ? 'отдел' : 'объект'}
            </button>
          </td>
          <td style={{ ...td, textAlign: 'center' }}>
            {gp.guard_count || 0}
            <span style={{ fontSize: 11, color: 'var(--text2)', display: 'block' }}>
              {gp.official_count}оф / {gp.unofficial_count}не
            </span>
          </td>
          <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{fmt(gp.official_salary || 0)}</td>
          <td style={{ ...td, textAlign: 'right', color: '#f59e0b' }}>{fmt(gp.unofficial_salary || 0)}</td>
          <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(gp.total_salary || 0)}</td>
          {showContract && (
            <>
              <td style={{ ...td, textAlign: 'right' }}>
                {editingContract === gp.id ? (
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <input value={contractValue} onChange={e => setContractValue(e.target.value)}
                      type="number" style={{ width: 100, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                      autoFocus onKeyDown={e => e.key === 'Enter' && saveContract(gp.id)} />
                    <button onClick={() => saveContract(gp.id)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, cursor: 'pointer' }}>OK</button>
                  </div>
                ) : (
                  <span onClick={e => { e.stopPropagation(); setEditingContract(gp.id); setContractValue(String(gp.contract_amount || '')) }}
                    style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text2)' }}
                    title="Кликните для редактирования">
                    {Number(gp.contract_amount) > 0 ? fmt(Number(gp.contract_amount)) : 'указать'}
                  </span>
                )}
              </td>
              <td style={{
                ...td, textAlign: 'right', fontWeight: 700,
                color: Number(gp.contract_amount) === 0 ? 'var(--text2)' : ((gp.profit || 0) >= 0 ? '#16a34a' : '#dc2626')
              }}>
                {Number(gp.contract_amount) > 0 ? (
                  <>{(gp.profit || 0) >= 0 ? '+' : ''}{fmt(gp.profit || 0)}</>
                ) : '--'}
              </td>
            </>
          )}
        </tr>

        {/* Expanded: guard details */}
        {expandedPost === gp.id && (
          <tr key={gp.id + '-detail'}>
            <td colSpan={showContract ? 8 : 6} style={{ padding: '0 18px 12px', background: 'var(--bg)' }}>
              {guardsByPost[gp.id] ? (
                <table style={{ width: '100%', fontSize: 12, marginTop: 8 }}>
                  <thead>
                    <tr style={{ color: 'var(--text2)' }}>
                      <th style={{ ...th, fontSize: 12 }}>ФИО</th>
                      <th style={{ ...th, fontSize: 12 }}>Статус</th>
                      <th style={{ ...th, fontSize: 12 }}>Смен</th>
                      <th style={{ ...th, fontSize: 12 }}>Дней</th>
                      <th style={{ ...th, fontSize: 12 }}>Ставка</th>
                      <th style={{ ...th, fontSize: 12 }}>ЗП</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardsByPost[gp.id].map((g, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{g.surname} {g.first_name} {g.patronymic}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                            background: g.is_official ? '#dcfce7' : '#fef3c7',
                            color: g.is_official ? '#166534' : '#92400e',
                          }}>
                            {g.is_official ? 'офиц' : 'неофиц'}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{g.shifts_worked}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{g.days_worked}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(g.rate)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(g.salary)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text2)' }}>Загрузка...</div>
              )}
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar userEmail={user?.email} />
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Табель и ФОТ</h1>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
              Синхронизация с TumarDashboard | Рентабельность постов
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={month.slice(0, 7)}
              onChange={e => setMonth(e.target.value + '-01')}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
            <button onClick={() => setShowSettings(!showSettings)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 18 }}
              title="Настройки">
              {''}
            </button>
            <button onClick={syncFromDashboard} disabled={syncing}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: syncing ? '#666' : '#2563eb', color: '#fff', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 }}>
              {syncing ? 'Синхронизация...' : 'Синхронизировать'}
            </button>
          </div>
        </div>

        {msg && <div style={{ padding: '10px 16px', borderRadius: 8, background: msg.includes('Ошибка') ? '#fef2f2' : '#f0fdf4', color: msg.includes('Ошибка') ? '#dc2626' : '#16a34a', marginBottom: 16, fontSize: 14, whiteSpace: 'pre-line' }}>{msg}</div>}

        {/* Settings panel */}
        {showSettings && (
          <div style={{ padding: 20, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Настройки интеграции</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>URL TumarDashboard</label>
                <input value={dashboardUrl} onChange={e => setDashboardUrl(e.target.value)}
                  placeholder="https://your-dashboard.vercel.app"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, display: 'block' }}>Ключ интеграции</label>
                <input value={integrationKey} onChange={e => setIntegrationKey(e.target.value)}
                  type="password" placeholder="secret-key-here"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14 }} />
              </div>
            </div>
            <button onClick={saveSettings}
              style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Сохранить
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <SummaryCard label="Весь ФОТ" value={fmt(totalSalary)} sub={`${totalGuards} сотрудников`} color="#2563eb" />
          <SummaryCard label="ФОТ объектов" value={fmt(clientSalary)} sub={`${clientPosts.length} объектов`} color="#8b5cf6" />
          <SummaryCard label="ФОТ отделов" value={fmt(internalSalary)} sub={`${internalPosts.length} отделов`} color="#6366f1" />
          <SummaryCard label="Официальные" value={fmt(officialSalary)} sub={`+ налоги ~${fmt(taxEstimate)}`} color="#16a34a" />
          <SummaryCard label="Неофициальные" value={fmt(unofficialSalary)} sub="наличными" color="#f59e0b" />
          <SummaryCard label="Доход (контракты)" value={fmt(clientContract)} sub={clientContract === 0 ? 'заполните контракты' : ''} color="#8b5cf6" />
          <SummaryCard label="Прибыль объектов" value={fmt(clientProfit)}
            sub={clientContract > 0 ? (clientProfit >= 0 ? 'объекты окупаются' : 'УБЫТОК!') : ''}
            color={clientProfit >= 0 ? '#16a34a' : '#dc2626'} />
        </div>

        {/* Cash accountability alert */}
        {unofficialSalary > 0 && (
          <div style={{ padding: '14px 18px', borderRadius: 10, background: '#fef3c7', border: '1px solid #f59e0b', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
              Внимание: {fmt(unofficialSalary)} тг уходит наличными на неофициальные ЗП
            </div>
            <div style={{ fontSize: 13, color: '#92400e' }}>
              Эти деньги не видны в 1С и банковской отчётности. Убедитесь что снятие наличных покрывает эту сумму.
            </div>
          </div>
        )}

        {/* ============ SECTION 1: CLIENT OBJECTS ============ */}
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg2)', marginBottom: 24 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              Охранные объекты — {monthLabel}
            </h2>
            {lastSync && (
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                Синхр.: {new Date(lastSync.synced_at).toLocaleString('ru-RU')}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Загрузка...</div>
          ) : clientPosts.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              {guardPosts.length === 0 ? 'Нет данных. Нажмите "Синхронизировать".' : 'Все посты отмечены как внутренние отделы.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={th}>Пост</th>
                  <th style={{ ...th, textAlign: 'center' }}>Тип</th>
                  <th style={th}>Охр-ков</th>
                  <th style={th}>ЗП офиц.</th>
                  <th style={th}>ЗП неофиц.</th>
                  <th style={th}>Итого ЗП</th>
                  <th style={th}>Контракт</th>
                  <th style={th}>Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {clientPosts.map(gp => renderPostRow(gp, true))}

                {/* Totals row */}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700, background: 'var(--bg)' }}>
                  <td style={td}>ИТОГО объекты</td>
                  <td style={td}></td>
                  <td style={{ ...td, textAlign: 'center' }}>{clientPosts.reduce((s, p) => s + (p.guard_count || 0), 0)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{fmt(clientPosts.reduce((s, p) => s + (p.official_salary || 0), 0))}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#f59e0b' }}>{fmt(clientPosts.reduce((s, p) => s + (p.unofficial_salary || 0), 0))}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmt(clientSalary)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmt(clientContract)}</td>
                  <td style={{
                    ...td, textAlign: 'right',
                    color: clientContract === 0 ? 'var(--text2)' : (clientProfit >= 0 ? '#16a34a' : '#dc2626')
                  }}>
                    {clientContract > 0 ? `${clientProfit >= 0 ? '+' : ''}${fmt(clientProfit)}` : '--'}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* ============ SECTION 2: INTERNAL DEPARTMENTS ============ */}
        {(internalPosts.length > 0 || (!loading && guardPosts.length > 0)) && (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg2)', marginBottom: 24 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                Внутренние отделы (накладные расходы) — {monthLabel}
              </h2>
            </div>

            {internalPosts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                Нажмите «объект» рядом с постом чтобы перевести его во «внутренние отделы» (дежурная часть, техотдел и т.д.)
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={th}>Отдел</th>
                    <th style={{ ...th, textAlign: 'center' }}>Тип</th>
                    <th style={th}>Сотр-ков</th>
                    <th style={th}>ЗП офиц.</th>
                    <th style={th}>ЗП неофиц.</th>
                    <th style={th}>Итого ЗП</th>
                  </tr>
                </thead>
                <tbody>
                  {internalPosts.map(gp => renderPostRow(gp, false))}

                  {/* Totals row */}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700, background: 'var(--bg)' }}>
                    <td style={td}>ИТОГО отделы</td>
                    <td style={td}></td>
                    <td style={{ ...td, textAlign: 'center' }}>{internalPosts.reduce((s, p) => s + (p.guard_count || 0), 0)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{fmt(internalPosts.reduce((s, p) => s + (p.official_salary || 0), 0))}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#f59e0b' }}>{fmt(internalPosts.reduce((s, p) => s + (p.unofficial_salary || 0), 0))}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(internalSalary)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ============ GRAND TOTAL ============ */}
        {!loading && guardPosts.length > 0 && (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg2)', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <tbody>
                <tr style={{ fontWeight: 700, background: 'var(--bg)' }}>
                  <td style={{ ...td, width: '40%' }}>ОБЩИЙ ФОТ (объекты + отделы)</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totalGuards} чел.</td>
                  <td style={{ ...td, textAlign: 'right', color: '#2563eb' }}>{fmt(totalSalary)} тг</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--text2)', fontSize: 12 }}>
                    объекты: {fmt(clientSalary)} + отделы: {fmt(internalSalary)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Sync history */}
        {syncLogs.length > 0 && (
          <div style={{ marginTop: 24, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>История синхронизаций</h2>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={th}>Дата синхр.</th>
                  <th style={th}>Месяц</th>
                  <th style={th}>Охранников</th>
                  <th style={th}>Офиц / Неоф</th>
                  <th style={th}>ФОТ итого</th>
                  <th style={th}>Налоги ~12%</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{new Date(log.synced_at).toLocaleString('ru-RU')}</td>
                    <td style={td}>{new Date(log.month).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{log.total_guards}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{log.official_count} / {log.unofficial_count}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(log.total_salary)}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{fmt(log.tax_estimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }
const td: React.CSSProperties = { padding: '10px 14px' }
