'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureUserExists } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

const fmt=(n:number)=>n.toLocaleString('ru-RU')
const inp = {padding:'4px 7px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,width:90} as const

export default function SnapshotPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [snaps, setSnaps] = useState<any[]>([])
  const [form, setForm] = useState({snap_date:new Date().toISOString().slice(0,10),balance_narodniy:'',balance_kaspi:'',balance_cash:'',zp_remaining:'',notes:''})
  const [msg, setMsg] = useState('')
  const [editId, setEditId] = useState<string|null>(null)
  const [editForm, setEditForm] = useState<any>(null)

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

  async function saveEdit(){
    if(!editId||!editForm) return
    setLoading(true)
    const s=createClient()
    const {error}=await s.from('weekly_snapshots').update({
      snap_date:editForm.snap_date,
      balance_narodniy:parseFloat(editForm.balance_narodniy)||0,
      balance_kaspi:parseFloat(editForm.balance_kaspi)||0,
      balance_cash:parseFloat(editForm.balance_cash)||0,
      zp_remaining:parseFloat(editForm.zp_remaining)||0,
      notes:editForm.notes||null,
    }).eq('id',editId)
    if(error){setMsg('Ошибка: '+error.message)}else{setMsg('✅ Сохранено');setEditId(null);setEditForm(null);load(s)}
    setLoading(false);setTimeout(()=>setMsg(''),3000)
  }

  async function deleteSnap(id:string){
    if(!window.confirm('Удалить запись?')) return
    setLoading(true)
    const s=createClient()
    const {error}=await s.from('weekly_snapshots').delete().eq('id',id)
    if(error){setMsg('Ошибка: '+error.message)}else{load(s)}
    setLoading(false)
  }

  const last = snaps[0]
  const total = last ? Number(last.balance_narodniy)+Number(last.balance_kaspi)+Number(last.balance_cash) : 0
  const diff = last ? total - Number(last.zp_remaining) : 0

  return (
    <div className="app-layout" style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main className="app-main" style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <h1 style={{fontSize:22,fontWeight:600,margin:'0 0 6px'}}>Остатки счетов (ежедневно)</h1>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:28}}>Ежедневная сверка — вносить каждый день для директора</p>

        {last && (
          <div className="snap-summary" style={{background:diff>=0?'var(--green-bg)':'var(--red-bg)',border:`1px solid ${diff>=0?'rgba(63,185,80,.3)':'rgba(248,81,73,.3)'}`,borderRadius:12,padding:'16px 22px',marginBottom:24,display:'flex',gap:32,flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Последняя сверка: {last.snap_date}</div>
              <div style={{fontSize:22,fontWeight:700,color:diff>=0?'var(--green)':'var(--red)'}}>{diff>=0?'✅ Хватает':'🔴 Не хватает'} {Math.abs(diff).toLocaleString('ru-RU')} ₸</div>
            </div>
            <div className="snap-values" style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
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
            <div className="grid-form" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:14}}>
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

        <div className="table-wrap" style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:700}}>
              <thead>
                <tr>{['Дата','Нар. банк','Каспи','Нал','Итого','На ЗП','Статус','Заметки',''].map(h=>(
                  <th key={h} style={{padding:'10px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.04em',textAlign:'left',borderBottom:'1px solid var(--border)',color:'var(--text2)'}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {snaps.length===0&&<tr><td colSpan={9} style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Нет записей</td></tr>}
                {snaps.map((r,i)=>{
                  const tot=Number(r.balance_narodniy)+Number(r.balance_kaspi)+Number(r.balance_cash)
                  const d=tot-Number(r.zp_remaining)
                  const isEdit=editId===r.id
                  return (
                    <tr key={i} style={{borderBottom:'1px solid var(--border)',background:isEdit?'var(--blue-bg)':'transparent'}}>
                      {isEdit?(
                        <>
                          <td style={{padding:'6px 8px'}}><input type="date" value={editForm.snap_date} onChange={e=>setEditForm((f:any)=>({...f,snap_date:e.target.value}))} style={{...inp,width:120}} /></td>
                          <td style={{padding:'6px 8px'}}><input type="number" value={editForm.balance_narodniy} onChange={e=>setEditForm((f:any)=>({...f,balance_narodniy:e.target.value}))} style={inp} /></td>
                          <td style={{padding:'6px 8px'}}><input type="number" value={editForm.balance_kaspi} onChange={e=>setEditForm((f:any)=>({...f,balance_kaspi:e.target.value}))} style={inp} /></td>
                          <td style={{padding:'6px 8px'}}><input type="number" value={editForm.balance_cash} onChange={e=>setEditForm((f:any)=>({...f,balance_cash:e.target.value}))} style={inp} /></td>
                          <td style={{padding:'9px 14px',color:'var(--text3)',fontSize:12}}>—</td>
                          <td style={{padding:'6px 8px'}}><input type="number" value={editForm.zp_remaining} onChange={e=>setEditForm((f:any)=>({...f,zp_remaining:e.target.value}))} style={inp} /></td>
                          <td style={{padding:'9px 14px',color:'var(--text3)',fontSize:12}}>—</td>
                          <td style={{padding:'6px 8px'}}><input value={editForm.notes} onChange={e=>setEditForm((f:any)=>({...f,notes:e.target.value}))} style={{...inp,width:140}} /></td>
                          <td style={{padding:'6px 8px',whiteSpace:'nowrap'}}>
                            <button onClick={saveEdit} disabled={loading} style={{padding:'4px 10px',borderRadius:5,border:'none',background:'var(--blue)',color:'#fff',fontSize:12,cursor:'pointer',marginRight:4}}>{loading?'...':'Сохранить'}</button>
                            <button onClick={()=>{setEditId(null);setEditForm(null)}} style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',fontSize:12,cursor:'pointer'}}>✕</button>
                          </td>
                        </>
                      ):(
                        <>
                          <td style={{padding:'9px 14px',fontWeight:500,whiteSpace:'nowrap'}}>{r.snap_date}</td>
                          <td style={{padding:'9px 14px',color:'var(--blue)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmt(Number(r.balance_narodniy))}</td>
                          <td style={{padding:'9px 14px',color:'var(--amber)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmt(Number(r.balance_kaspi))}</td>
                          <td style={{padding:'9px 14px',color:'var(--text2)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmt(Number(r.balance_cash))}</td>
                          <td style={{padding:'9px 14px',fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmt(tot)}</td>
                          <td style={{padding:'9px 14px',color:'var(--red)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmt(Number(r.zp_remaining))}</td>
                          <td style={{padding:'9px 14px',whiteSpace:'nowrap'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:d>=0?'var(--green-bg)':'var(--red-bg)',color:d>=0?'var(--green)':'var(--red)'}}>{d>=0?`+${fmt(d)}`:`${fmt(d)}`}</span></td>
                          <td style={{padding:'9px 14px',fontSize:12,color:'var(--text2)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                          <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>
                            <button onClick={()=>{setEditId(r.id);setEditForm({snap_date:r.snap_date,balance_narodniy:String(r.balance_narodniy),balance_kaspi:String(r.balance_kaspi),balance_cash:String(r.balance_cash),zp_remaining:String(r.zp_remaining),notes:r.notes||''})}} style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text2)',fontSize:12,cursor:'pointer',marginRight:4}}>✏️</button>
                            <button onClick={()=>deleteSnap(r.id)} disabled={loading} style={{padding:'4px 8px',borderRadius:5,border:'1px solid rgba(248,81,73,.4)',background:'var(--red-bg)',color:'var(--red)',fontSize:12,cursor:'pointer'}}>🗑</button>
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
