'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const CATS = [{v:'zp_guard',l:'ЗП охранники'},{v:'zp_office',l:'ЗП офис/тех.'},{v:'materials',l:'Материалы/закуп'},{v:'fuel',l:'Топливо (Гелиос)'},{v:'cleaning',l:'Уборка помещений'},{v:'other',l:'Прочее'}]
const RESP = [{v:'sergey',l:'Лазарев Сергей'},{v:'kim',l:'Ким А.А.'},{v:'accountant',l:'Бухгалтер'},{v:'other',l:'Другой'}]
const fmt = (n:number)=>n.toLocaleString('ru-RU')

export default function CashEntryPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<any[]>([])
  const [form, setForm] = useState({entry_date:new Date().toISOString().slice(0,10),type:'expense',amount:'',category:'zp_guard',description:'',responsible:'sergey'})
  const [msg, setMsg] = useState('')

  useEffect(()=>{
    const s=createClient()
    s.auth.getUser().then(({data})=>{if(!data.user){router.push('/login');return};setUser(data.user);load(s)})
  },[])

  async function load(s:any){
    const {data}=await s.from('cash_entries').select('*').order('entry_date',{ascending:false}).limit(50)
    setEntries(data||[])
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();setLoading(true);setMsg('')
    const s=createClient()
    const {error}=await s.from('cash_entries').insert({...form,amount:parseFloat(form.amount),created_by:user.id})
    if(error){setMsg('Ошибка: '+error.message);setLoading(false);return}
    setMsg('✅ Сохранено')
    setForm(f=>({...f,amount:'',description:''}))
    load(s);setLoading(false)
    setTimeout(()=>setMsg(''),3000)
  }

  const totalExp=entries.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount),0)
  const totalIn=entries.filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount),0)

  return (
    <div style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <h1 style={{fontSize:22,fontWeight:600,margin:'0 0 6px'}}>Расход наличных</h1>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:28}}>Наличные деньги: выплаты охранникам, закупы, подотчёт</p>

        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'22px 24px',marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:18}}>Добавить запись</div>
          <form onSubmit={submit}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Дата</label>
                <input type="date" value={form.entry_date} onChange={e=>setForm(f=>({...f,entry_date:e.target.value}))} required />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Тип</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                  <option value="expense">Расход</option>
                  <option value="income">Поступление нал</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Сумма, ₸</label>
                <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" min="0" required />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Категория</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                  {CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Ответственный</label>
                <select value={form.responsible} onChange={e=>setForm(f=>({...f,responsible:e.target.value}))}>
                  {RESP.map(r=><option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Комментарий</label>
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="На что потрачено / от кого получено..." />
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button type="submit" disabled={loading} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',fontSize:14,fontWeight:500,cursor:'pointer'}}>
                {loading?'Сохранение...':'Сохранить'}
              </button>
              {msg&&<span style={{fontSize:13,color:msg.startsWith('✅')?'var(--green)':'var(--red)'}}>{msg}</span>}
            </div>
          </form>
        </div>

        <div style={{display:'flex',gap:12,marginBottom:16}}>
          <div style={{background:'var(--green-bg)',border:'1px solid rgba(63,185,80,.25)',borderRadius:8,padding:'8px 16px',fontSize:13}}>Приход нал: <strong style={{color:'var(--green)'}}>{fmt(totalIn)} ₸</strong></div>
          <div style={{background:'var(--red-bg)',border:'1px solid rgba(248,81,73,.25)',borderRadius:8,padding:'8px 16px',fontSize:13}}>Расход нал: <strong style={{color:'var(--red)'}}>{fmt(totalExp)} ₸</strong></div>
        </div>

        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr>{['Дата','Тип','Категория','Ответственный','Комментарий','Сумма'].map(h=>(
                <th key={h} style={{padding:'10px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid var(--border)',color:'var(--text2)'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {entries.length===0&&<tr><td colSpan={6} style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Нет записей</td></tr>}
              {entries.map((r,i)=>(
                <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'9px 14px',color:'var(--text2)'}}>{r.entry_date}</td>
                  <td style={{padding:'9px 14px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:r.type==='income'?'var(--green-bg)':'var(--red-bg)',color:r.type==='income'?'var(--green)':'var(--red)'}}>{r.type==='income'?'Приход':'Расход'}</span></td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text2)'}}>{CATS.find(c=>c.v===r.category)?.l||r.category}</td>
                  <td style={{padding:'9px 14px',fontSize:12,color:'var(--text2)'}}>{RESP.find(c=>c.v===r.responsible)?.l||r.responsible}</td>
                  <td style={{padding:'9px 14px',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text2)'}}>{r.description||'—'}</td>
                  <td style={{padding:'9px 14px',fontWeight:600,color:r.type==='income'?'var(--green)':'var(--red)'}}>{r.type==='income'?'+':'-'}{fmt(Number(r.amount))} ₸</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
