'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts'

const fmt = (n:number) => n.toLocaleString('ru-RU')
const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']
const DAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
const CAT_LABELS: Record<string,string> = {pulto:'Пультовая',montazh:'Монтаж',zp:'ЗП',nalog:'Налоги',komissia:'Комиссия',vozvrat:'Возврат',other:'Прочее',zp_guard:'ЗП охранники',zp_office:'ЗП офис',materials:'Материалы',fuel:'Топливо',cleaning:'Уборка'}
const PIE_COLORS = ['#3fb950','#58a6ff','#d29922','#f85149','#a78bfa','#34d399','#fb923c']

type ViewMode = 'daily' | 'weekly' | 'monthly'

type UnpaidClient = {
  id: string
  pult_number: string
  name: string
  phone: string | null
  monthly_rate: number
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function getWeekLabel(weekKey: string): string {
  const [year, w] = weekKey.split('-W')
  return `Нед ${parseInt(w)}, ${year}`
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [period, setPeriod] = useState(6)
  const [view, setView] = useState<ViewMode>('monthly')
  const [bankRaw, setBankRaw] = useState<any[]>([])
  const [cashRaw, setCashRaw] = useState<any[]>([])
  const [bankData, setBankData] = useState<any[]>([])
  const [incomePie, setIncomePie] = useState<any[]>([])
  const [expensePie, setExpensePie] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [unpaidClients, setUnpaidClients] = useState<UnpaidClient[]>([])
  const [totalClients, setTotalClients] = useState(0)

  useEffect(()=>{
    const s=createClient()
    s.auth.getUser().then(({data})=>{if(!data.user){router.push('/login');return};setUser(data.user);load(s,period);loadUnpaid(s)})
  },[])

  async function load(s:any,months:number){
    setLoading(true)
    const from = new Date(); from.setMonth(from.getMonth()-months+1); from.setDate(1)
    const fromStr = from.toISOString().slice(0,10)
    const fetchAll = async (table: string, dateFilter: string) => {
      const all: any[] = []
      let f = 0; const PAGE = 1000
      while (true) {
        const { data } = await s.from(table).select('*').gte('entry_date', dateFilter).range(f, f + PAGE - 1)
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
        f += PAGE
      }
      return all
    }
    const [bank, cash] = await Promise.all([
      fetchAll('bank_entries', fromStr),
      fetchAll('cash_entries', fromStr)
    ])
    setBankRaw(bank)
    setCashRaw(cash)

    const incMap: Record<string,number> = {}
    bank.filter((r:any)=>r.type==='income').forEach((r:any)=>{ incMap[r.category]=(incMap[r.category]||0)+Number(r.amount) })
    setIncomePie(Object.entries(incMap).map(([k,v])=>({name:CAT_LABELS[k]||k,value:Math.round(v)})))

    const expMap: Record<string,number> = {}
    bank.filter((r:any)=>r.type==='expense').forEach((r:any)=>{ expMap[r.category]=(expMap[r.category]||0)+Number(r.amount) })
    cash.filter((r:any)=>r.type==='expense').forEach((r:any)=>{ expMap[r.category]=(expMap[r.category]||0)+Number(r.amount) })
    setExpensePie(Object.entries(expMap).map(([k,v])=>({name:CAT_LABELS[k]||k,value:Math.round(v)})))

    const nar = bank.filter((r:any)=>r.bank==='narodniy'&&r.type==='income').reduce((s:number,r:any)=>s+Number(r.amount),0)
    const kas = bank.filter((r:any)=>r.bank==='kaspi'&&r.type==='income').reduce((s:number,r:any)=>s+Number(r.amount),0)
    setBankData([{name:'Нар. банк',value:Math.round(nar)},{name:'Каспи',value:Math.round(kas)}])
    setLoading(false)
  }

  async function loadUnpaid(s: any) {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const [cRes, pRes] = await Promise.all([
      s.from('clients').select('id,pult_number,name,phone,monthly_rate').eq('is_active', true).order('pult_number'),
      s.from('pult_payments').select('client_id').eq('payment_month', currentMonth).eq('is_paid', true),
    ])
    const allClients: UnpaidClient[] = cRes.data || []
    const paidIds = new Set((pRes.data || []).map((p: any) => p.client_id))
    setTotalClients(allClients.length)
    setUnpaidClients(allClients.filter(c => !paidIds.has(c.id)))
  }

  const chartData = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {}

    if (view === 'daily') {
      bankRaw.forEach((r: any) => {
        const k = r.entry_date
        if (!map[k]) map[k] = { income: 0, expense: 0 }
        if (r.type === 'income') map[k].income += Number(r.amount)
        else map[k].expense += Number(r.amount)
      })
      cashRaw.forEach((r: any) => {
        const k = r.entry_date
        if (!map[k]) map[k] = { income: 0, expense: 0 }
        if (r.type === 'expense') map[k].expense += Number(r.amount)
      })
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          const d = new Date(k)
          return {
            label: `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${DAYS[d.getDay()]}`,
            date: k,
            income: Math.round(v.income),
            expense: Math.round(v.expense),
            profit: Math.round(v.income - v.expense),
          }
        })
    } else if (view === 'weekly') {
      bankRaw.forEach((r: any) => {
        const k = getWeekKey(r.entry_date)
        if (!map[k]) map[k] = { income: 0, expense: 0 }
        if (r.type === 'income') map[k].income += Number(r.amount)
        else map[k].expense += Number(r.amount)
      })
      cashRaw.forEach((r: any) => {
        const k = getWeekKey(r.entry_date)
        if (!map[k]) map[k] = { income: 0, expense: 0 }
        if (r.type === 'expense') map[k].expense += Number(r.amount)
      })
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({
          label: getWeekLabel(k),
          date: k,
          income: Math.round(v.income),
          expense: Math.round(v.expense),
          profit: Math.round(v.income - v.expense),
        }))
    } else {
      const now = new Date()
      for (let i = period - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!map[k]) map[k] = { income: 0, expense: 0 }
      }
      bankRaw.forEach((r: any) => {
        const k = r.entry_date.slice(0, 7)
        if (!map[k]) return
        if (r.type === 'income') map[k].income += Number(r.amount)
        else map[k].expense += Number(r.amount)
      })
      cashRaw.forEach((r: any) => {
        const k = r.entry_date.slice(0, 7)
        if (!map[k]) return
        if (r.type === 'expense') map[k].expense += Number(r.amount)
      })
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({
          label: MONTHS[parseInt(k.slice(5, 7)) - 1],
          date: k,
          income: Math.round(v.income),
          expense: Math.round(v.expense),
          profit: Math.round(v.income - v.expense),
        }))
    }
  }, [bankRaw, cashRaw, view, period])

  const totalIncome = chartData.reduce((s, r) => s + r.income, 0)
  const totalExpense = chartData.reduce((s, r) => s + r.expense, 0)
  const totalProfit = totalIncome - totalExpense

  const viewLabels: Record<ViewMode, string> = { daily: 'по дням', weekly: 'по неделям', monthly: 'по месяцам' }

  const tooltip = {contentStyle:{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,fontSize:12},formatter:(v:any)=>[fmt(v)+' ₸']}

  if(loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',color:'var(--text2)'}}>Загрузка...</div>

  return (
    <div className="app-layout" style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main className="app-main" style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <div className="page-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:600,margin:0}}>Аналитика</h1>
            <p style={{fontSize:13,color:'var(--text2)',margin:'4px 0 0'}}>Автоматический анализ по всем данным</p>
          </div>
          <div className="analytics-controls" style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{display:'flex',gap:4,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:8,padding:3}}>
              {(['daily','weekly','monthly'] as ViewMode[]).map(v=>(
                <button key={v} onClick={()=>setView(v)} style={{padding:'5px 12px',borderRadius:6,border:'none',background:view===v?'var(--blue)':'transparent',color:view===v?'#fff':'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:view===v?500:400}}>
                  {v==='daily'?'День':v==='weekly'?'Неделя':'Месяц'}
                </button>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              {[3,6,12].map(m=>(
                <button key={m} onClick={()=>{setPeriod(m);const s=createClient();load(s,m)}} style={{padding:'6px 16px',borderRadius:8,border:'1px solid',borderColor:period===m?'var(--blue)':'var(--border2)',background:period===m?'var(--blue-bg)':'transparent',color:period===m?'var(--blue)':'var(--text2)',fontSize:13,cursor:'pointer'}}>
                  {m} мес.
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="grid-stats" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
          {[
            {l:'Доходы за период',v:totalIncome,c:'var(--green)',b:'var(--green-bg)',br:'rgba(63,185,80,.25)'},
            {l:'Расходы за период',v:totalExpense,c:'var(--red)',b:'var(--red-bg)',br:'rgba(248,81,73,.25)'},
            {l:'Чистый результат',v:totalProfit,c:totalProfit>=0?'var(--green)':'var(--red)',b:totalProfit>=0?'var(--green-bg)':'var(--red-bg)',br:totalProfit>=0?'rgba(63,185,80,.25)':'rgba(248,81,73,.25)'},
            {l:'Среднемесячный доход',v:Math.round(totalIncome/period),c:'var(--blue)',b:'var(--blue-bg)',br:'rgba(88,166,255,.25)'},
          ].map(({l,v,c,b,br})=>(
            <div key={l} className="kpi-card" style={{background:b,border:`1px solid ${br}`,borderRadius:12,padding:'16px 20px'}}>
              <div style={{fontSize:11,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>{l}</div>
              <div className="kpi-value" style={{fontSize:22,fontWeight:700,color:c}}>{fmt(v)} ₸</div>
            </div>
          ))}
        </div>

        {/* Main chart */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'20px 24px',marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:16}}>Доходы vs расходы {viewLabels[view]}</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barSize={view==='daily'?8:view==='weekly'?14:20}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{fontSize:view==='daily'?10:12,fill:'var(--text2)'}} axisLine={false} tickLine={false} interval={view==='daily'?Math.max(0,Math.floor(chartData.length/15)):0} angle={view==='daily'?-45:0} textAnchor={view==='daily'?'end':'middle'} height={view==='daily'?50:30} />
              <YAxis tick={{fontSize:11,fill:'var(--text2)'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000000?(v/1000000).toFixed(1)+'M':(v/1000).toFixed(0)+'K'} />
              <Tooltip {...tooltip} labelFormatter={(l)=>String(l)} />
              <Bar dataKey="income" fill="#3fb950" name="Доход" radius={[4,4,0,0]} />
              <Bar dataKey="expense" fill="#f85149" name="Расход" radius={[4,4,0,0]} />
              <Legend wrapperStyle={{fontSize:12,color:'var(--text2)'}} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detail table for daily/weekly */}
        {view !== 'monthly' && (
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'14px 20px',fontSize:13,fontWeight:500,borderBottom:'1px solid var(--border)'}}>
              Детализация {view==='daily'?'по дням':'по неделям'} ({chartData.length} {view==='daily'?'дн.':'нед.'})
            </div>
            <div className="table-wrap" style={{maxHeight:320,overflowY:'auto',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr>{[view==='daily'?'Дата':'Неделя','Доход','Расход','Результат'].map(h=>(
                    <th key={h} style={{padding:'9px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.04em',textAlign:'left',borderBottom:'1px solid var(--border)',color:'var(--text2)',position:'sticky',top:0,background:'var(--bg2)'}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {chartData.length===0&&<tr><td colSpan={4} style={{padding:'20px',textAlign:'center',color:'var(--text3)'}}>Нет данных</td></tr>}
                  {chartData.map((r,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'8px 14px',fontWeight:500,whiteSpace:'nowrap'}}>{r.label}</td>
                      <td style={{padding:'8px 14px',color:'var(--green)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{r.income>0?'+':''}{fmt(r.income)} ₸</td>
                      <td style={{padding:'8px 14px',color:'var(--red)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>-{fmt(r.expense)} ₸</td>
                      <td style={{padding:'8px 14px',fontWeight:600,color:r.profit>=0?'var(--green)':'var(--red)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{r.profit>=0?'+':''}{fmt(r.profit)} ₸</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid-charts" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20,marginBottom:20}}>
          {/* Income by category */}
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:14}}>Структура доходов</div>
            {incomePie.length>0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={incomePie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                      {incomePie.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,fontSize:12}} formatter={(v:any)=>[fmt(v)+' ₸']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                  {incomePie.map((r,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <div style={{width:10,height:10,borderRadius:2,background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                      <span style={{flex:1,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                      <span style={{fontWeight:500}}>{fmt(r.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div style={{fontSize:13,color:'var(--text3)',padding:'20px 0'}}>Нет данных</div>}
          </div>

          {/* Expense by category */}
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:14}}>Структура расходов</div>
            {expensePie.length>0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={expensePie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                      {expensePie.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,fontSize:12}} formatter={(v:any)=>[fmt(v)+' ₸']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                  {expensePie.map((r,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                      <div style={{width:10,height:10,borderRadius:2,background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                      <span style={{flex:1,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                      <span style={{fontWeight:500}}>{fmt(r.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div style={{fontSize:13,color:'var(--text3)',padding:'20px 0'}}>Нет данных</div>}
          </div>

          {/* Bank split */}
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'18px 20px'}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:14}}>Приход по каналам</div>
            <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:20}}>
              {bankData.map((r,i)=>{
                const total=bankData.reduce((s,x)=>s+x.value,0)
                const pct = total>0?Math.round(r.value/total*100):0
                return (
                  <div key={i}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                      <span style={{color:'var(--text2)'}}>{r.name}</span>
                      <span style={{fontWeight:500}}>{pct}%</span>
                    </div>
                    <div style={{height:8,background:'var(--bg3)',borderRadius:4,overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:i===0?'#58a6ff':'#d29922',borderRadius:4,transition:'width .4s'}} />
                    </div>
                    <div style={{fontSize:11,color:'var(--text2)',marginTop:3}}>{fmt(r.value)} ₸</div>
                  </div>
                )
              })}
              {bankData.length===0&&<div style={{fontSize:13,color:'var(--text3)'}}>Нет данных</div>}
            </div>
          </div>
        </div>

        {/* Profit trend */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'20px 24px',marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:16}}>Чистый результат {viewLabels[view]}</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{fontSize:view==='daily'?10:12,fill:'var(--text2)'}} axisLine={false} tickLine={false} interval={view==='daily'?Math.max(0,Math.floor(chartData.length/15)):0} />
              <YAxis tick={{fontSize:11,fill:'var(--text2)'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000000?(v/1000000).toFixed(1)+'M':(v/1000).toFixed(0)+'K'} />
              <Tooltip {...tooltip} />
              <Line type="monotone" dataKey="profit" stroke="#58a6ff" strokeWidth={2.5} dot={view==='daily'?false:(props:any)=>{const c=props.value>=0?'#3fb950':'#f85149';return<circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={c} stroke={c}/>}} name="Результат" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Unpaid clients block */}
        {totalClients > 0 && (
          <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <div>
                <span style={{fontSize:14,fontWeight:500}}>Пульты — неоплатники этого месяца</span>
                <span style={{marginLeft:10,fontSize:12,color:'var(--text2)'}}>{unpaidClients.length} из {totalClients} не оплатили</span>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                {unpaidClients.length>0&&(
                  <>
                    <span style={{fontSize:12,color:'var(--red)',fontWeight:600}}>
                      Долг: {fmt(unpaidClients.reduce((s,c)=>s+Number(c.monthly_rate),0))} ₸
                    </span>
                    <a href="/remotes/print" target="_blank" style={{fontSize:12,padding:'4px 12px',borderRadius:6,border:'1px solid var(--red)',background:'var(--red-bg)',color:'var(--red)',textDecoration:'none'}}>
                      🖨️ Печать
                    </a>
                  </>
                )}
                <a href="/remotes" style={{fontSize:12,padding:'4px 12px',borderRadius:6,border:'1px solid var(--border2)',background:'transparent',color:'var(--text2)',textDecoration:'none'}}>
                  Открыть базу →
                </a>
              </div>
            </div>
            {unpaidClients.length===0?(
              <div style={{padding:'20px',textAlign:'center',color:'var(--green)',fontSize:13,fontWeight:500}}>
                ✓ Все {totalClients} клиентов оплатили за текущий месяц
              </div>
            ):(
              <div style={{maxHeight:320,overflowY:'auto',overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr>
                      {['Пульт №','Клиент / Объект','Телефон','Сумма (₸)'].map(h=>(
                        <th key={h} style={{padding:'9px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.04em',textAlign:'left',borderBottom:'1px solid var(--border)',color:'var(--text2)',position:'sticky',top:0,background:'var(--bg2)',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidClients.map((c,i)=>(
                      <tr key={c.id} style={{borderBottom:'1px solid var(--border)',background:i%2===0?'transparent':'rgba(248,81,73,.03)'}}>
                        <td style={{padding:'8px 14px',fontWeight:700,fontFamily:'monospace',color:'var(--blue)',whiteSpace:'nowrap'}}>{c.pult_number}</td>
                        <td style={{padding:'8px 14px',fontWeight:500}}>{c.name}</td>
                        <td style={{padding:'8px 14px',color:'var(--text2)',whiteSpace:'nowrap'}}>{c.phone||'—'}</td>
                        <td style={{padding:'8px 14px',fontVariantNumeric:'tabular-nums',color:'var(--red)',fontWeight:600,whiteSpace:'nowrap'}}>
                          {c.monthly_rate>0?fmt(Number(c.monthly_rate))+' ₸':'—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
