'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureUserExists } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const fmt=(n:number)=>n.toLocaleString('ru-RU')

export default function SnapshotPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [snaps, setSnaps] = useState<any[]>([])
  const [form, setForm] = useState({snap_date:new Date().toISOString().slice(0,10),balance_narodniy:'',balance_kaspi:'',balance_cash:'',zp_remaining:'',notes:''})
  const [msg, setMsg] = useState('')

  useEffect(()=>{
    const s=createClient()
    s.auth.getUser().then(async ({data})=>{if(!data.user){router.push('/login');return}; await ensureUserExists(s, data.user); setUser(data.user);load(s)})
  },[])

  async function load(s:any){
    const {data}=await s.from('weekly_snapshots').select('*').order('snap_date',{ascending:false}).limit(20)
    setSnaps(data||[])
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();setLoading(true);setMsg('')
    const s=createClient()
    const payload={snap_date:form.snap_date,balance_narodniy:parseFloat(form.balance_narodniy)||0,balance_kaspi:parseFloat(form.balance_kaspi)||0,balance_cash:parseFloat(form.balance_cash)||0,zp_remaining:parseFloat(form.zp_remaining)||0,notes:form.notes,created_by:user.id}
    const {error}=await s.from('weekly_snapshots').insert(payload)
    if(error){setMsg('Ошибка: '+error.message);setLoading(false);return}
    setMsg('✅ Сохранено')
    setForm(f=>({...f,balance_narodniy:'',balance_kaspi:'',balance_cash:'',zp_remaining:'',notes:''}))
    load(s);setLoading(false)
    setTimeout(()=>setMsg(''),3000)
  }

  const last = snaps[0]
  const total = last ? Number(last.balance_narodniy)+Number(last.balance_kaspi)+Number(last.balance_cash) : 0
  const diff = last ? total - Number(last.zp_remaining) : 0

  return (
    <div style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <h1 style={{fontSize:22,fontWeight:600,margin:'0 0 6px'}}>Остатки счетов (ежедневно)</h1>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:28}}>Ежедневная сверка — вносить каждый день для директора</p>

        {last && (
          <div style={{background:diff>=0?'var(--green-bg)':'var(--red-bg)',border:`1px solid ${diff>=0?'rgba(63,185,80,.3)':'rgba(248,81,73,.3)'}`,borderRadius:12,padding:'16px 22px',marginBottom:24,display:'flex',gap:32,flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Последняя сверка: {last.snap_date}</div>
              <div style={{fontSize:22,fontWeight:700,color:diff>=0?'var(--green)':'var(--red)'}}>{diff>=0?'✅ Хватает':'🔴 Не хватает'} {Math.abs(diff).toLocaleString('ru-RU')} ₸</div>
            </div>
            <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
              {[['Нар. банк',last.balance_narodniy,'var(--blue)'],['Каспи',last.balance_kaspi,'var(--amber)'],['Нал',last.balance_cash,'var(--text)'],['На ЗП',last.zp_remaining,'var(--red)']].map(([l,v,c])=>(
                <div key={String(l)}>
                  <div style={{fontSize:11,color:'var(--text2)'}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:600,color:String(c)}}>{Number(v).toLocaleString('ru-RU')} ₸</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'22px 24px',marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:18}}>Внести остатки</div>
          <form onSubmit={submit}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:14}}>
              {[['snap_date','Дата','date'],['balance_narodniy','Нар. банк, ₸','number'],['balance_kaspi','Каспи, ₸','number'],['balance_cash','Наличные, ₸','number'],['zp_remaining','Нужно на ЗП, ₸','number']].map(([k,l,t])=>(
                <div key={k}>
                  <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>{l}</label>
                  <input type={t} value={(form as any)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={t==='number'?'0':undefined} required={k!=='notes'} />
                </div>
              ))}
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:5}}>Заметки</label>
              <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Важные события, комментарии директору..." />
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button type="submit" disabled={loading} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'9px 22px',fontSize:14,fontWeight:500,cursor:'pointer'}}>
                {loading?'Сохранение...':'Сохранить сверку'}
              </button>
              {msg&&<span style={{fontSize:13,color:msg.startsWith('✅')?'var(--green)':'var(--red)'}}>{msg}</span>}
            </div>
          </form>
        </div>

        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr>{['Дата','Нар. банк','Каспи','Нал','Итого','На ЗП','Статус','Заметки'].map(h=>(
                <th key={h} style={{padding:'10px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.04em',textAlign:'left',borderBottom:'1px solid var(--border)',color:'var(--text2)'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {snaps.length===0&&<tr><td colSpan={8} style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Нет записей</td></tr>}
              {snaps.map((r,i)=>{
                const tot=Number(r.balance_narodniy)+Number(r.balance_kaspi)+Number(r.balance_cash)
                const d=tot-Number(r.zp_remaining)
                return (
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 14px',fontWeight:500}}>{r.snap_date}</td>
                    <td style={{padding:'9px 14px',color:'var(--blue)',fontVariantNumeric:'tabular-nums'}}>{fmt(Number(r.balance_narodniy))}</td>
                    <td style={{padding:'9px 14px',color:'var(--amber)',fontVariantNumeric:'tabular-nums'}}>{fmt(Number(r.balance_kaspi))}</td>
                    <td style={{padding:'9px 14px',color:'var(--text2)',fontVariantNumeric:'tabular-nums'}}>{fmt(Number(r.balance_cash))}</td>
                    <td style={{padding:'9px 14px',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{fmt(tot)}</td>
                    <td style={{padding:'9px 14px',color:'var(--red)',fontVariantNumeric:'tabular-nums'}}>{fmt(Number(r.zp_remaining))}</td>
                    <td style={{padding:'9px 14px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:d>=0?'var(--green-bg)':'var(--red-bg)',color:d>=0?'var(--green)':'var(--red)'}}>{d>=0?`+${fmt(d)}`:`${fmt(d)}`}</span></td>
                    <td style={{padding:'9px 14px',fontSize:12,color:'var(--text2)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
