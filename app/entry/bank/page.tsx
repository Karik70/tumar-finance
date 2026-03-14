'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const CATEGORIES = ['pulto','montazh','zp','nalog','komissia','vozvrat','other']
const CAT_LABELS: Record<string,string> = {pulto:'Пультовая абонентка',montazh:'Монтаж/установка',zp:'Зарплата',nalog:'Налоги',komissia:'Комиссия банка',vozvrat:'Возврат/ошибочный',other:'Прочее'}
const fmt = (n:number) => n.toLocaleString('ru-RU')

export default function BankEntryPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<any[]>([])
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0,10), bank:'narodniy', type:'income', amount:'', category:'pulto', description:'', counterparty:'' })
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState({ bank:'all', type:'all', from:'', to:'' })

  useEffect(() => {
    const s = createClient()
    s.auth.getUser().then(({data})=>{ if(!data.user){router.push('/login');return}; setUser(data.user); load(s) })
  },[])

  async function load(s:any) {
    const {data} = await s.from('bank_entries').select('*').order('entry_date',{ascending:false}).limit(50)
    setEntries(data||[])
  }

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg('')
    const s = createClient()
    const { error } = await s.from('bank_entries').insert({ ...form, amount:parseFloat(form.amount), created_by: user.id })
    if (error) { setMsg('Ошибка: '+error.message); setLoading(false); return }
    setMsg('✅ Запись добавлена')
    setForm(f=>({...f,amount:'',description:'',counterparty:''}))
    load(s); setLoading(false)
    setTimeout(()=>setMsg(''),3000)
  }

  const filtered = entries.filter(r=>{
    if(filter.bank!=='all' && r.bank!==filter.bank) return false
    if(filter.type!=='all' && r.type!==filter.type) return false
    if(filter.from && r.entry_date < filter.from) return false
    if(filter.to && r.entry_date > filter.to) return false
    return true
  })
  const totalIn = filtered.filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount),0)
  const totalOut = filtered.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount),0)

  return (
    <div style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <h1 style={{fontSize:22,fontWeight:600,margin:'0 0 6px'}}>Выписка банка</h1>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:28}}>Народный банк и Каспи — доходы и расходы</p>

        {/* Form */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'22px 24px',marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:18}}>Добавить операцию</div>
          <form onSubmit={submit}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Дата</label>
                <input type="date" value={form.entry_date} onChange={e=>setForm(f=>({...f,entry_date:e.target.value}))} required />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Банк</label>
                <select value={form.bank} onChange={e=>setForm(f=>({...f,bank:e.target.value}))}>
                  <option value="narodniy">Народный банк</option>
                  <option value="kaspi">Каспи</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Тип</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                  <option value="income">Приход</option>
                  <option value="expense">Расход</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Сумма, ₸</label>
                <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" min="0" step="0.01" required />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Категория</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Контрагент</label>
                <input value={form.counterparty} onChange={e=>setForm(f=>({...f,counterparty:e.target.value}))} placeholder="Название организации" />
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Описание / назначение платежа</label>
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Из выписки банка..." />
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button type="submit" disabled={loading} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:loading?.6:1}}>
                {loading?'Сохранение...':'Сохранить'}
              </button>
              {msg && <span style={{fontSize:13,color:msg.startsWith('✅')?'var(--green)':'var(--red)'}}>{msg}</span>}
            </div>
          </form>
        </div>

        {/* Filters */}
        <div style={{display:'flex',gap:12,marginBottom:14,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Банк</label>
            <select value={filter.bank} onChange={e=>setFilter(f=>({...f,bank:e.target.value}))} style={{width:150}}>
              <option value="all">Все</option>
              <option value="narodniy">Народный</option>
              <option value="kaspi">Каспи</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Тип</label>
            <select value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))} style={{width:130}}>
              <option value="all">Все</option>
              <option value="income">Приход</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>С даты</label>
            <input type="date" value={filter.from} onChange={e=>setFilter(f=>({...f,from:e.target.value}))} style={{width:150}} />
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>По дату</label>
            <input type="date" value={filter.to} onChange={e=>setFilter(f=>({...f,to:e.target.value}))} style={{width:150}} />
          </div>
        </div>

        {/* Totals */}
        <div style={{display:'flex',gap:12,marginBottom:16}}>
          <div style={{background:'var(--green-bg)',border:'1px solid rgba(63,185,80,.25)',borderRadius:8,padding:'8px 16px',fontSize:13}}>
            Приход: <strong style={{color:'var(--green)'}}>{fmt(totalIn)} ₸</strong>
          </div>
          <div style={{background:'var(--red-bg)',border:'1px solid rgba(248,81,73,.25)',borderRadius:8,padding:'8px 16px',fontSize:13}}>
            Расход: <strong style={{color:'var(--red)'}}>{fmt(totalOut)} ₸</strong>
          </div>
          <div style={{background:'var(--bg3)',border:'1px solid var(--border2)',borderRadius:8,padding:'8px 16px',fontSize:13}}>
            Баланс: <strong style={{color:totalIn-totalOut>=0?'var(--green)':'var(--red)'}}>{fmt(totalIn-totalOut)} ₸</strong>
          </div>
        </div>

        {/* Table */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{color:'var(--text2)'}}>
                {['Дата','Банк','Тип','Описание','Контрагент','Категория','Сумма'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid var(--border)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={7} style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Нет записей</td></tr>}
              {filtered.map((r,i)=>(
                <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'9px 14px',color:'var(--text2)'}}>{r.entry_date}</td>
                  <td style={{padding:'9px 14px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:r.bank==='narodniy'?'var(--blue-bg)':'var(--amber-bg)',color:r.bank==='narodniy'?'var(--blue)':'var(--amber)'}}>{r.bank==='narodniy'?'Нар.банк':'Каспи'}</span></td>
                  <td style={{padding:'9px 14px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:r.type==='income'?'var(--green-bg)':'var(--red-bg)',color:r.type==='income'?'var(--green)':'var(--red)'}}>{r.type==='income'?'Приход':'Расход'}</span></td>
                  <td style={{padding:'9px 14px',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description||'—'}</td>
                  <td style={{padding:'9px 14px',color:'var(--text2)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.counterparty||'—'}</td>
                  <td style={{padding:'9px 14px',fontSize:11,color:'var(--text2)'}}>{CAT_LABELS[r.category]||r.category}</td>
                  <td style={{padding:'9px 14px',fontWeight:600,color:r.type==='income'?'var(--green)':'var(--red)',fontVariantNumeric:'tabular-nums'}}>
                    {r.type==='income'?'+':'-'}{fmt(Number(r.amount))} ₸
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
