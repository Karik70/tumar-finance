'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, ensureUserExists } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Papa from 'papaparse'

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

  const [uploading, setUploading] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    const s = createClient()
    s.auth.getUser().then(async ({data})=>{ if(!data.user){router.push('/login');return}; await ensureUserExists(s, data.user); setUser(data.user); load(s) })
  },[])

  async function load(s:any) {
    const all: any[] = []
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data } = await s.from('bank_entries').select('*').order('entry_date',{ascending:false}).range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }
    setEntries(all)
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMsg('Парсинг PDF...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const s = createClient()
      const { data: sessionData } = await s.auth.getSession()
      if (!sessionData.session) throw new Error('Сессия истекла. Войдите заново.')

      const res = await fetch('/api/upload-statement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')

      setPreviewData(data.transactions)
      setShowPreview(true)
      setMsg('')
    } catch (err: any) {
      setMsg('❌ Ошибка: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function savePreviewData() {
    setUploading(true)
    const s = createClient()
    const rowsToInsert = previewData.map(r => ({
      entry_date: r.entry_date,
      bank: r.bank,
      type: r.type,
      amount: r.amount,
      category: r.category,
      description: r.description,
      counterparty: r.counterparty,
      created_by: user.id
    }))

    // deduplicate: load existing records for the same date range
    const dates = rowsToInsert.map(r => r.entry_date).sort()
    const minDate = dates[0], maxDate = dates[dates.length - 1]
    const { data: existing } = await s.from('bank_entries')
      .select('entry_date,bank,amount,counterparty')
      .gte('entry_date', minDate).lte('entry_date', maxDate)
    const existingSet = new Set(
      (existing || []).map((r: any) => `${r.entry_date}|${r.bank}|${r.amount}|${r.counterparty||''}`)
    )
    const newRows = rowsToInsert.filter(r =>
      !existingSet.has(`${r.entry_date}|${r.bank}|${r.amount}|${r.counterparty||''}`)
    )
    const skipped = rowsToInsert.length - newRows.length

    if (newRows.length === 0) {
      setMsg(`⚠️ Все ${rowsToInsert.length} записей уже есть в базе, дубли не добавлены`)
      setUploading(false)
      setShowPreview(false)
      setPreviewData([])
      setTimeout(() => setMsg(''), 5000)
      return
    }

    const BATCH_SIZE = 200
    let saved = 0
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batch = newRows.slice(i, i + BATCH_SIZE)
      const { error } = await s.from('bank_entries').insert(batch)
      if (error) {
        setMsg(`❌ Ошибка на записях ${i+1}–${i+batch.length}: ${error.message}`)
        setUploading(false)
        return
      }
      saved += batch.length
      setMsg(`Сохранение... ${saved} / ${newRows.length}`)
    }

    const skipMsg = skipped > 0 ? `, пропущено дублей: ${skipped}` : ''
    setMsg(`✅ Сохранено ${saved} новых записей${skipMsg}`)
    setShowPreview(false)
    setPreviewData([])
    load(s)
    setUploading(false)
    setTimeout(()=>setMsg(''), 4000)
  }

  function handlePreviewChange(index: number, field: string, value: string) {
    const newData = [...previewData]
    newData[index][field] = value
    setPreviewData(newData)
  }

  async function deleteEntry(id: string) {
    if (!window.confirm('Удалить эту запись?')) return
    const s = createClient()
    const { error } = await s.from('bank_entries').delete().eq('id', id)
    if (error) { setMsg('❌ Ошибка: ' + error.message); return }
    setEntries(prev => prev.filter(r => r.id !== id))
  }

  async function clearAllEntries() {
    const confirmed = window.confirm(
      `Удалить ВСЕ записи из выписки банка?\n\nЭто действие нельзя отменить.\nВсего записей: ${entries.length}\n\nНапишите "УДАЛИТЬ" для подтверждения.`
    )
    if (!confirmed) return
    const typed = window.prompt('Введите слово УДАЛИТЬ для подтверждения:')
    if (typed?.trim() !== 'УДАЛИТЬ') { setMsg('Отменено — слово не совпало'); setTimeout(()=>setMsg(''),3000); return }
    setUploading(true)
    setMsg('Удаление...')
    const s = createClient()
    const { error } = await s.from('bank_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) { setMsg('❌ Ошибка: ' + error.message); setUploading(false); return }
    setEntries([])
    setMsg('✅ Все записи удалены. Теперь можно загрузить PDF заново.')
    setUploading(false)
    setTimeout(()=>setMsg(''),6000)
  }

  function exportCSV() {
    const dataToExport = filtered.map(r => ({
      'Дата': r.entry_date,
      'Банк': r.bank === 'narodniy' ? 'Народный' : 'Каспи',
      'Тип': r.type === 'income' ? 'Приход' : 'Расход',
      'Категория': CAT_LABELS[r.category] || r.category,
      'Сумма': r.amount,
      'Контрагент': r.counterparty,
      'Описание': r.description
    }))
    const csv = Papa.unparse(dataToExport)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `tumar_bank_export_${new Date().toISOString().slice(0,10)}.csv`
    link.click()
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
    <div className="app-layout" style={{display:'flex',minHeight:'100vh'}}>
      <Sidebar userEmail={user?.email} />
      <main className="app-main" style={{flex:1,padding:'28px 32px',minWidth:0}}>
        <div className="page-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
          <div>
             <h1 style={{fontSize:22,fontWeight:600,margin:'0 0 6px'}}>Выписка банка</h1>
             <p style={{fontSize:13,color:'var(--text2)',margin:0}}>Народный банк и Каспи — доходы и расходы</p>
          </div>
          <div className="header-actions" style={{display:'flex',gap:12}}>
            <label style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:500,cursor:uploading?'wait':'pointer',display:'inline-flex',alignItems:'center',gap:6,color:'var(--text)',whiteSpace:'nowrap'}}>
              <input type="file" accept="application/pdf,.xlsx,.xls" onChange={handleFileUpload} style={{display:'none'}} disabled={uploading} />
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {uploading ? 'Загрузка...' : 'Загрузить PDF / Excel'}
            </label>
            <button onClick={exportCSV} style={{background:'var(--bg3)',border:'1px solid var(--border2)',color:'var(--text)',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:500,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Экспорт CSV
            </button>
            <button onClick={clearAllEntries} disabled={uploading||entries.length===0} style={{background:'var(--red-bg)',border:'1px solid rgba(248,81,73,.4)',color:'var(--red)',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:500,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6,whiteSpace:'nowrap',opacity:entries.length===0?.4:1}}>
              🗑 Очистить все
            </button>
          </div>
        </div>

        {/* Form */}
        {!showPreview && (
        <div style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'22px 24px',marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:18}}>Добавить операцию</div>
          <form onSubmit={submit}>
            <div className="grid-form" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14,marginBottom:14}}>
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
        )}

        {/* Preview Modal for PDF Upload */}
        {showPreview && (
          <div style={{background:'var(--bg-elevated)',border:'1px dashed var(--border2)',borderRadius:12,padding:'22px 24px',marginBottom:28}}>
            <div className="page-header" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:12}}>
              <div style={{fontSize:16,fontWeight:500,color:'var(--blue)'}}>Распознано записей: {previewData.length}</div>
              <div style={{display:'flex',gap:12}}>
                <button onClick={()=>setShowPreview(false)} style={{background:'transparent',border:'1px solid var(--border)',borderRadius:8,padding:'8px 16px',fontSize:13,cursor:'pointer',color:'var(--text2)'}}>Отмена</button>
                <button onClick={savePreviewData} disabled={uploading} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontSize:13,fontWeight:500,cursor:'pointer'}}>
                  {uploading ? 'Сохранение...' : 'Сохранить все'}
                </button>
              </div>
            </div>

            <div className="table-wrap" style={{maxHeight:'400px',overflowY:'auto',overflowX:'auto',background:'var(--bg)',borderRadius:8,border:'1px solid var(--border)'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:700}}>
                <thead style={{position:'sticky',top:0,background:'var(--bg2)',zIndex:1}}>
                  <tr>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Дата</th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Банк / Тип</th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Сумма</th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Категория</th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:'1px solid var(--border)'}}>Контрагент / Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((r, i) => (
                    <tr key={i} style={{borderBottom:'1px solid var(--border)',background: i%2===0?'transparent':'rgba(0,0,0,0.02)'}}>
                      <td style={{padding:'8px'}}>
                        <input type="date" value={r.entry_date} onChange={e=>handlePreviewChange(i,'entry_date',e.target.value)} style={{fontSize:11,padding:'4px',border:'1px solid var(--border)',borderRadius:4}}/>
                      </td>
                      <td style={{padding:'8px'}}>
                        <select value={r.bank} onChange={e=>handlePreviewChange(i,'bank',e.target.value)} style={{fontSize:11,padding:'4px',marginRight:4,border:'1px solid var(--border)',borderRadius:4}}>
                          <option value="kaspi">Каспи</option>
                          <option value="narodniy">Халык</option>
                        </select>
                        <select value={r.type} onChange={e=>handlePreviewChange(i,'type',e.target.value)} style={{fontSize:11,padding:'4px',border:'1px solid var(--border)',borderRadius:4}}>
                          <option value="income">Приход</option>
                          <option value="expense">Расход</option>
                        </select>
                      </td>
                      <td style={{padding:'8px',fontWeight:600,fontFamily:'monospace'}}>
                        <input type="number" value={r.amount} onChange={e=>handlePreviewChange(i,'amount',e.target.value)} style={{fontSize:11,padding:'4px',width:80,border:'1px solid var(--border)',borderRadius:4}}/>
                      </td>
                      <td style={{padding:'8px'}}>
                        <select value={r.category} onChange={e=>handlePreviewChange(i,'category',e.target.value)} style={{fontSize:11,padding:'4px',border:'1px solid var(--border)',borderRadius:4,maxWidth:120}}>
                          {CATEGORIES.map(c=><option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                        </select>
                      </td>
                      <td style={{padding:'8px'}}>
                        <div style={{marginBottom:4}}><input value={r.counterparty} onChange={e=>handlePreviewChange(i,'counterparty',e.target.value)} placeholder="Контрагент" style={{fontSize:11,padding:'4px',width:'100%',border:'1px solid var(--border)',borderRadius:4}}/></div>
                        <div><input value={r.description} onChange={e=>handlePreviewChange(i,'description',e.target.value)} placeholder="Описание" style={{fontSize:11,padding:'4px',width:'100%',border:'1px solid var(--border)',borderRadius:4}}/></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {msg && <div style={{marginTop:12,fontSize:13,color:'var(--red)'}}>{msg}</div>}
          </div>
        )}

        {/* Filters */}
        <div className="filter-row" style={{display:'flex',gap:12,marginBottom:14,flexWrap:'wrap',alignItems:'flex-end'}}>
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
        <div className="totals-row" style={{display:'flex',gap:12,marginBottom:16}}>
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
        <div className="table-wrap" style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:700}}>
              <thead>
                <tr style={{color:'var(--text2)'}}>
                  {['Дата','Банк','Тип','Описание','Контрагент','Категория','Сумма',''].map(h=>(
                    <th key={h} style={{padding:'10px 14px',fontWeight:500,fontSize:11,textTransform:'uppercase',letterSpacing:'.05em',textAlign:'left',borderBottom:'1px solid var(--border)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0&&<tr><td colSpan={8} style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Нет записей</td></tr>}
                {filtered.map((r,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'9px 14px',color:'var(--text2)',whiteSpace:'nowrap'}}>{r.entry_date}</td>
                    <td style={{padding:'9px 14px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:r.bank==='narodniy'?'var(--blue-bg)':'var(--amber-bg)',color:r.bank==='narodniy'?'var(--blue)':'var(--amber)',whiteSpace:'nowrap'}}>{r.bank==='narodniy'?'Нар.банк':'Каспи'}</span></td>
                    <td style={{padding:'9px 14px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:r.type==='income'?'var(--green-bg)':'var(--red-bg)',color:r.type==='income'?'var(--green)':'var(--red)'}}>{r.type==='income'?'Приход':'Расход'}</span></td>
                    <td style={{padding:'9px 14px',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.description||'—'}</td>
                    <td style={{padding:'9px 14px',color:'var(--text2)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.counterparty||'—'}</td>
                    <td style={{padding:'9px 14px',fontSize:11,color:'var(--text2)',whiteSpace:'nowrap'}}>{CAT_LABELS[r.category]||r.category}</td>
                    <td style={{padding:'9px 14px',fontWeight:600,color:r.type==='income'?'var(--green)':'var(--red)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>
                      {r.type==='income'?'+':'-'}{fmt(Number(r.amount))} ₸
                    </td>
                    <td style={{padding:'9px 8px'}}>
                      <button onClick={()=>deleteEntry(r.id)} title="Удалить" style={{background:'transparent',border:'1px solid rgba(248,81,73,.3)',borderRadius:5,color:'var(--red)',cursor:'pointer',fontSize:12,padding:'3px 8px',lineHeight:1}}>✕</button>
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
