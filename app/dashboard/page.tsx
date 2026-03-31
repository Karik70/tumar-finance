'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import StatCard from '@/components/ui/StatCard'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts'

const fmt = (n:number) => n.toLocaleString('ru-RU')
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ income:0, expense:0, cash_expense:0, balance_bank:0, balance_kaspi:0, balance_cash:0, zp_remaining:0 })
  const [chartData, setChartData] = useState<any[]>([])
  const [recentEntries, setRecentEntries] = useState<any[]>([])
  const [lastSnap, setLastSnap] = useState<any>(null)
  const [timesheetFOT, setTimesheetFOT] = useState<any>(null)
  const [cashAccountability, setCashAccountability] = useState<{reported:number,fromTimesheet:number,unaccounted:number}|null>(null)

  useEffect(() => {
    const s = createClient()
    s.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUser(data.user)
      loadData(s)
    })
  }, [])

  async function loadData(s: any) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
    const monthEnd = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10)

    const [bankRes, cashRes, snapRes, recentBank, recentCash] = await Promise.all([
      s.from('bank_entries').select('*').gte('entry_date', monthStart).lte('entry_date', monthEnd),
      s.from('cash_entries').select('*').gte('entry_date', monthStart).lte('entry_date', monthEnd),
      s.from('weekly_snapshots').select('*').order('snap_date',{ascending:false}).limit(1),
      s.from('bank_entries').select('*').order('entry_date',{ascending:false}).limit(10),
      s.from('cash_entries').select('*').order('entry_date',{ascending:false}).limit(5),
    ])

    const bank = bankRes.data || []
    const cash = cashRes.data || []
    const snap = snapRes.data?.[0] || null
    setLastSnap(snap)

    const income = bank.filter((r:any)=>r.type==='income').reduce((s:number,r:any)=>s+Number(r.amount),0)
    const expense = bank.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+Number(r.amount),0)
    const cash_expense = cash.filter((r:any)=>r.type==='expense').reduce((s:number,r:any)=>s+Number(r.amount),0)

    setStats({
      income, expense, cash_expense,
      balance_bank: snap?.balance_narodniy || 0,
      balance_kaspi: snap?.balance_kaspi || 0,
      balance_cash: snap?.balance_cash || 0,
      zp_remaining: snap?.zp_remaining || 0,
    })

    // Chart: last 6 months
    const months6: any[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1)
      months6.push({ month: MONTHS[d.getMonth()], income:0, expense:0 })
    }
    bank.forEach((r:any) => {
      const m = new Date(r.entry_date).getMonth()
      const label = MONTHS[m]
      const idx = months6.findIndex(x=>x.month===label)
      if (idx>=0) {
        if (r.type==='income') months6[idx].income += Number(r.amount)
        else months6[idx].expense += Number(r.amount)
      }
    })
    setChartData(months6)

    const recent = [
      ...(recentBank.data||[]).map((r:any)=>({...r, source: r.bank==='narodniy'?'Нар. банк':'Каспи'})),
      ...(recentCash.data||[]).map((r:any)=>({...r, source:'Наличные'}))
    ].sort((a,b)=>new Date(b.entry_date).getTime()-new Date(a.entry_date).getTime()).slice(0,12)

    // Load timesheet FOT for current month
    const { data: tsData } = await s
      .from('timesheet_sync_log')
      .select('*')
      .eq('month', monthStart)
      .order('synced_at', { ascending: false })
      .limit(1)
    setTimesheetFOT(tsData?.[0] || null)

    // Calculate cash accountability
    if (tsData?.[0]) {
      const cashExpenses = cash.filter((r:any) => r.type === 'expense').reduce((sum:number, r:any) => sum + Number(r.amount), 0)
      const unofficialSalary = Number(tsData[0].unofficial_salary) || 0
      setCashAccountability({
        reported: cashExpenses,
        fromTimesheet: unofficialSalary,
        unaccounted: cashExpenses - unofficialSalary,
      })
    }
    setRecentEntries(recent)

    setLoading(false)
  }

  if (loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',color:'var(--text2)'}}>Загрузка...</div>

  const totalBalance = stats.balance_bank + stats.balance_kaspi + stats.balance_cash
  const balanceColor = totalBalance >= stats.zp_remaining ? 'green' : totalBalance >= stats.zp_remaining*0.7 ? 'amber' : 'red'
  const diff = totalBalance - stats.zp_remaining

  return (
    <div className="app-layout" style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main className="app-main" style={{flex:1,padding:'28px 32px',minWidth:0,overflowX:'hidden'}}>
        <div style={{marginBottom:28}}>
          <h1 style={{fontSize:22,fontWeight:600,margin:0}}>Дашборд</h1>
          <p style={{fontSize:13,color:'var(--text2)',margin:'4px 0 0'}}>
            {lastSnap ? `Остатки на ${lastSnap.snap_date}` : 'Данные текущего месяца'} · ТОО «Тұмар Күзет»
          </p>
        </div>

        {/* Status banner */}
        <div className="status-banner" style={{background:diff>=0?'var(--green-bg)':'var(--red-bg)',border:`1px solid ${diff>=0?'rgba(63,185,80,.3)':'rgba(248,81,73,.3)'}`,borderRadius:12,padding:'16px 22px',marginBottom:24,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:4}}>
              {diff>=0 ? '✅ Денег на ЗП хватает' : '🔴 Не хватает на выплату ЗП'}
            </div>
            <div style={{fontSize:26,fontWeight:700,color:diff>=0?'var(--green)':'var(--red)'}}>
              {diff>=0?'+':''}{fmt(Math.round(diff))} ₸
            </div>
            <div style={{fontSize:12,color:'var(--text2)',marginTop:3}}>
              {diff>=0 ? 'останется после выплаты всей ЗП' : 'нужно пополнить счёт'}
            </div>
          </div>
          {stats.balance_kaspi > 0 && (
            <div style={{background:'var(--amber-bg)',border:'1px solid rgba(210,153,34,.3)',borderRadius:10,padding:'10px 16px',maxWidth:280}}>
              <div style={{fontSize:12,color:'var(--amber)',fontWeight:500,marginBottom:2}}>⚠ Каспи не переведён</div>
              <div style={{fontSize:20,fontWeight:600,color:'var(--amber)'}}>{fmt(stats.balance_kaspi)} ₸</div>
              <div style={{fontSize:11,color:'var(--text2)'}}>перевести на расчётный счёт сегодня</div>
            </div>
          )}
        </div>

        {/* Timesheet FOT banner */}
        {timesheetFOT && (
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 22px',marginBottom:16,display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:16}}>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>ФОТ по табелю</div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--amber)'}}>{fmt(Number(timesheetFOT.total_salary))} ₸</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>реальный расход на ЗП</div>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Официальные ({timesheetFOT.official_count} чел)</div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--green)'}}>{fmt(Number(timesheetFOT.official_salary))} ₸</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>через банк + налоги ~{fmt(Number(timesheetFOT.tax_estimate))} ₸</div>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Неофициальные ({timesheetFOT.unofficial_count} чел)</div>
              <div style={{fontSize:20,fontWeight:700,color:'#f59e0b'}}>{fmt(Number(timesheetFOT.unofficial_salary))} ₸</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>наличными, вне 1С</div>
            </div>
            {cashAccountability && cashAccountability.unaccounted > 10000 && (
              <div style={{background:'#fef2f2',borderRadius:10,padding:'10px 14px',border:'1px solid rgba(248,81,73,.3)'}}>
                <div style={{fontSize:11,color:'var(--red)',fontWeight:600,marginBottom:4}}>Неучтённые наличные</div>
                <div style={{fontSize:20,fontWeight:700,color:'var(--red)'}}>{fmt(cashAccountability.unaccounted)} ₸</div>
                <div style={{fontSize:10,color:'var(--text2)'}}>потрачено {fmt(cashAccountability.reported)} - ЗП неоф {fmt(cashAccountability.fromTimesheet)}</div>
              </div>
            )}
          </div>
        )}

        {/* Top stats */}
        <div className="grid-stats" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
          <StatCard label="Нар. банк (остаток)" value={stats.balance_bank} color="blue" />
          <StatCard label="Каспи (остаток)" value={stats.balance_kaspi} color={stats.balance_kaspi>0?'amber':'default'} />
          <StatCard label="Наличные (касса)" value={stats.balance_cash} color="default" />
          <StatCard label="Нужно на ЗП" value={stats.zp_remaining} color="red" />
        </div>

        <div className="grid-stats" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:28}}>
          <StatCard label="Поступило за месяц" value={stats.income} color="green" />
          <StatCard label="Расход через банк" value={stats.expense} color="default" />
          <StatCard label="Расход наличными" value={stats.cash_expense} color="default" />
          <StatCard label="Итого расходы" value={stats.expense+stats.cash_expense} color="red" />
        </div>

        {/* Charts */}
        <div className="grid-charts" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:28}}>
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:16}}>Приход / расход по месяцам</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--text2)'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize:10,fill:'var(--text2)'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000000?(v/1000000).toFixed(1)+'M':(v/1000)+'K'} />
                <Tooltip contentStyle={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,fontSize:12}} formatter={(v:any)=>[fmt(v)+' ₸']} />
                <Bar dataKey="income" fill="#3fb950" name="Приход" radius={[4,4,0,0]} />
                <Bar dataKey="expense" fill="#f85149" name="Расход" radius={[4,4,0,0]} />
                <Legend wrapperStyle={{fontSize:11,color:'var(--text2)'}} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:16}}>Динамика прихода</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--text2)'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize:10,fill:'var(--text2)'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000000?(v/1000000).toFixed(1)+'M':(v/1000)+'K'} />
                <Tooltip contentStyle={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,fontSize:12}} formatter={(v:any)=>[fmt(v)+' ₸']} />
                <Line type="monotone" dataKey="income" stroke="#58a6ff" strokeWidth={2} dot={{fill:'#58a6ff',r:3}} name="Приход" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
          <div style={{fontSize:13,fontWeight:500,marginBottom:14}}>Последние операции</div>
          <div className="table-wrap" style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{color:'var(--text2)',textAlign:'left'}}>
                  {['Дата','Описание','Канал','Категория','Сумма'].map(h=>(
                    <th key={h} style={{padding:'6px 10px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.05em',borderBottom:'1px solid var(--border)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentEntries.length === 0 && (
                  <tr><td colSpan={5} style={{padding:'20px 10px',color:'var(--text3)',textAlign:'center'}}>Нет данных — внесите первые операции</td></tr>
                )}
                {recentEntries.map((r,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 10px',color:'var(--text2)',whiteSpace:'nowrap'}}>{r.entry_date}</td>
                    <td style={{padding:'9px 10px',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description||'—'}</td>
                    <td style={{padding:'9px 10px'}}>
                      <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:r.source==='Нар. банк'?'var(--blue-bg)':r.source==='Каспи'?'var(--amber-bg)':'var(--bg3)',color:r.source==='Нар. банк'?'var(--blue)':r.source==='Каспи'?'var(--amber)':'var(--text2)',whiteSpace:'nowrap'}}>{r.source}</span>
                    </td>
                    <td style={{padding:'9px 10px',color:'var(--text2)',fontSize:12}}>{r.category||'—'}</td>
                    <td style={{padding:'9px 10px',fontWeight:500,color:r.type==='income'?'var(--green)':'var(--red)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>
                      {r.type==='income'?'+':'-'}{fmt(Number(r.amount))} ₸
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
