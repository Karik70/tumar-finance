'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureUserExists } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const fmt = (n:number) => n.toLocaleString('ru-RU')

export default function SalaryPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ month: new Date().toISOString().slice(0,7)+'-01', total_planned:'', bank_part:'', cash_part:'', notes:'' })
  const [msg, setMsg] = useState('')
  const [editId, setEditId] = useState<string|null>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [snaps, setSnaps] = useState<any[]>([])
  const [bankIncome, setBankIncome] = useState(0)

  useEffect(()=>{
    const s=createClient()
    s.auth.getUser().then(async ({data})=>{if(!data.user){router.push('/login');return}; await ensureUserExists(s, data.user); setUser(data.user);load(s)})
  },[])

  async function load(s:any){
    const now=new Date()
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10)
    const [pRes,sRes,bRes]=await Promise.all([
      s.from('salary_plan').select('*').order('month',{ascending:false}).limit(12),
      s.from('weekly_snapshots').select('*').order('snap_date',{ascending:false}).limit(1),
      s.from('bank_entries').select('amount').eq('type','income').gte('entry_date',monthStart)
    ])
    setPlans(pRes.data||[])
    setSnaps(sRes.data||[])
    setBankIncome((bRes.data||[]).reduce((s:number,r:any)=>s+Number(r.amount),0))
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();setLoading(true);setMsg('')
    const s=createClient()
    const {error}=await s.from('salary_plan').insert({...form,total_planned:parseFloat(form.total_planned),bank_part:parseFloat(form.bank_part)||null,cash_part:parseFloat(form.cash_part)||null,created_by:user.id})
    if(error){setMsg('Ошибка: '+error.message);setLoading(false);return}
    setMsg('✅ Сохранено')
    setForm(f=>({...f,total_planned:'',bank_part:'',cash_part:'',notes:''}))
    load(s);setLoading(false)
    setTimeout(()=>setMsg(''),3000)
  }

  async function saveEdit(){
    if(!editId||!editForm) return
    setLoading(true)
    const s=createClient()
    const {error}=await s.from('salary_plan').update({
      total_planned:parseFloat(editForm.total_planned),
      bank_part:parseFloat(editForm.bank_part)||null,
      cash_part:parseFloat(editForm.cash_part)||null,
      notes:editForm.notes||null
    }).eq('id',editId)
    if(error){setMsg('Ошибка: '+error.message)}else{setMsg('✅ Сохранено');setEditId(null);setEditForm(null);load(s)}
    setLoading(false);setTimeout(()=>setMsg(''),3000)
  }

  const snap=snaps[0]
  const totalBalance=snap?(Number(snap.balance_narodniy)+Number(snap.balance_kaspi)+Number(snap.balance_cash)):0
  const currentPlan=plans[0]
  const planned=currentPlan?Number(currentPlan.total_planned):0
  const coverage=planned>0?Math.round(totalBalance/planned*100):0
  const rule40=Math.round(bankIncome*0.4)

  return (
    <div className="app-layout" style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main className="app-main" style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <h1 style={{fontSize:22,fontWeight:600,margin:'0 0 6px'}}>ЗП / Покрытие</h1>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:28}}>Плановый фонд зарплаты и контроль покрытия</p>

        {/* Coverage widget */}
        {snap && (
          <div className="grid-coverage" style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'22px 28px',marginBottom:24,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:24}}>
            <div>
              <div style={{fontSize:12,color:'var(--text2)',marginBottom:6}}>Остаток на счетах</div>
              <div style={{fontSize:28,fontWeight:700,color:'var(--blue)'}}>{fmt(totalBalance)} ₸</div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>по данным сверки {snap.snap_date}</div>
            </div>
            <div>
              <div style={{fontSize:12,color:'var(--text2)',marginBottom:6}}>Плановый ФОТ (этот месяц)</div>
              <div style={{fontSize:28,fontWeight:700,color:'var(--amber)'}}>{fmt(planned)} ₸</div>
              {currentPlan&&<div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{new Date(currentPlan.month).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</div>}
            </div>
            <div>
              <div style={{fontSize:12,color:'var(--text2)',marginBottom:8}}>Покрытие</div>
              <div style={{fontSize:28,fontWeight:700,color:coverage>=100?'var(--green)':coverage>=70?'var(--amber)':'var(--red)'}}>{coverage}%</div>
              <div style={{height:8,background:'var(--bg3)',borderRadius:4,marginTop:8,overflow:'hidden'}}>
                <div style={{width:`${Math.min(coverage,100)}%`,height:'100%',background:coverage>=100?'var(--green)':coverage>=70?'var(--amber)':'var(--red)',borderRadius:4,transition:'width .4s'}} />
              </div>
              <div style={{fontSize:12,color:coverage>=100?'var(--green)':'var(--red)',marginTop:4}}>
                {coverage>=100?`Хватает, запас ${fmt(totalBalance-planned)} ₸`:`Не хватает ${fmt(planned-totalBalance)} ₸`}
              </div>
            </div>
          </div>
        )}

        {/* 40% rule tip */}
        <div className="tip-box" style={{background:'var(--amber-bg)',border:'1px solid rgba(210,153,34,.3)',borderRadius:12,padding:'14px 20px',marginBottom:24,display:'flex',alignItems:'center',gap:16}}>
          <div className="tip-icon" style={{fontSize:24}}>💡</div>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:'var(--amber)',marginBottom:2}}>Правило 40% — фонд ЗП за этот месяц</div>
            <div style={{fontSize:13,color:'var(--text2)'}}>
              Поступило в банк: <strong style={{color:'var(--text)'}}>{fmt(bankIncome)} ₸</strong> → нужно отложить на ЗП: <strong style={{color:'var(--amber)'}}>{fmt(rule40)} ₸</strong>
            </div>
          </div>
        </div>

        {/* Add plan form */}
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'22px 24px',marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:18}}>Добавить план ФОТ</div>
          <form onSubmit={submit}>
            <div className="grid-form" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Месяц</label>
                <input type="date" value={form.month} onChange={e=>setForm(f=>({...f,month:e.target.value}))} required />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Общий ФОТ, ₸</label>
                <input type="number" value={form.total_planned} onChange={e=>setForm(f=>({...f,total_planned:e.target.value}))} placeholder="0" required />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Через банк, ₸</label>
                <input type="number" value={form.bank_part} onChange={e=>setForm(f=>({...f,bank_part:e.target.value}))} placeholder="0" />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Наличными, ₸</label>
                <input type="number" value={form.cash_part} onChange={e=>setForm(f=>({...f,cash_part:e.target.value}))} placeholder="0" />
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Заметки</label>
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Дополнительно..." />
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button type="submit" disabled={loading} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',fontSize:14,fontWeight:500,cursor:'pointer'}}>
                {loading?'Сохранение...':'Сохранить'}
              </button>
              {msg&&<span style={{fontSize:13,color:msg.startsWith('✅')?'var(--green)':'var(--red)'}}>{msg}</span>}
            </div>
          </form>
        </div>

        {/* History */}
        <div className="table-wrap" style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:650}}>
              <thead>
                <tr>{['Месяц','Общий ФОТ','Банк','Наличные','Налоги (≈12%)','Заметки',''].map(h=>(
                  <th key={h} style={{padding:'10px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid var(--border)',color:'var(--text2)'}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {plans.length===0&&<tr><td colSpan={7} style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Нет данных</td></tr>}
                {plans.map((r,i)=>{
                  const isEdit=editId===r.id
                  return (
                  <tr key={i} style={{borderBottom:'1px solid var(--border)',background:isEdit?'var(--amber-bg)':'transparent'}}>
                    <td style={{padding:'9px 14px',fontWeight:500,whiteSpace:'nowrap'}}>{new Date(r.month).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</td>
                    {isEdit?(
                      <>
                        <td style={{padding:'6px 8px'}}><input type="number" value={editForm.total_planned} onChange={e=>setEditForm((f:any)=>({...f,total_planned:e.target.value}))} style={{width:100,padding:'4px 7px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}} /></td>
                        <td style={{padding:'6px 8px'}}><input type="number" value={editForm.bank_part} onChange={e=>setEditForm((f:any)=>({...f,bank_part:e.target.value}))} style={{width:90,padding:'4px 7px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}} /></td>
                        <td style={{padding:'6px 8px'}}><input type="number" value={editForm.cash_part} onChange={e=>setEditForm((f:any)=>({...f,cash_part:e.target.value}))} style={{width:90,padding:'4px 7px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}} /></td>
                        <td style={{padding:'9px 14px',color:'var(--text2)',whiteSpace:'nowrap'}}>{fmt(Math.round(Number(editForm.total_planned||0)*0.12))} ₸</td>
                        <td style={{padding:'6px 8px'}}><input value={editForm.notes} onChange={e=>setEditForm((f:any)=>({...f,notes:e.target.value}))} style={{width:140,padding:'4px 7px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}} /></td>
                        <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                          <button onClick={saveEdit} disabled={loading} style={{padding:'4px 10px',borderRadius:5,border:'none',background:'var(--blue)',color:'#fff',fontSize:12,cursor:'pointer',marginRight:4}}>Сохранить</button>
                          <button onClick={()=>{setEditId(null);setEditForm(null)}} style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',fontSize:12,cursor:'pointer'}}>✕</button>
                        </td>
                      </>
                    ):(
                      <>
                        <td style={{padding:'9px 14px',fontWeight:600,color:'var(--amber)',whiteSpace:'nowrap'}}>{fmt(Number(r.total_planned))} ₸</td>
                        <td style={{padding:'9px 14px',color:'var(--blue)',whiteSpace:'nowrap'}}>{r.bank_part?fmt(Number(r.bank_part))+' ₸':'—'}</td>
                        <td style={{padding:'9px 14px',color:'var(--text2)',whiteSpace:'nowrap'}}>{r.cash_part?fmt(Number(r.cash_part))+' ₸':'—'}</td>
                        <td style={{padding:'9px 14px',color:'var(--text2)',whiteSpace:'nowrap'}}>{fmt(Math.round(Number(r.total_planned)*0.12))} ₸</td>
                        <td style={{padding:'9px 14px',fontSize:12,color:'var(--text2)'}}>{r.notes||'—'}</td>
                        <td style={{padding:'9px 14px'}}>
                          <button onClick={()=>{setEditId(r.id);setEditForm({total_planned:String(r.total_planned),bank_part:String(r.bank_part||''),cash_part:String(r.cash_part||''),notes:r.notes||''})}} style={{padding:'4px 10px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',fontSize:12,cursor:'pointer'}}>✏️ Ред.</button>
                        </td>
                      </>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
