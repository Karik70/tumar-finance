'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Неверный email или пароль'); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
      <div style={{width:'100%',maxWidth:380,padding:'0 24px'}}>
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{width:64,height:64,borderRadius:16,background:'linear-gradient(135deg,#2563eb,#1d4ed8)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:30,marginBottom:16}}>⚡</div>
          <div style={{fontSize:24,fontWeight:700,letterSpacing:'.06em'}}>ТҰМАР</div>
          <div style={{fontSize:13,color:'var(--text2)',marginTop:4}}>Финансовый дашборд</div>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:13,color:'var(--text2)',display:'block',marginBottom:6}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="user@tumar.kz" required autoFocus />
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:13,color:'var(--text2)',display:'block',marginBottom:6}}>Пароль</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div style={{background:'var(--red-bg)',border:'1px solid rgba(248,81,73,.3)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--red)',marginBottom:16}}>{error}</div>}
          <button type="submit" disabled={loading} style={{width:'100%',padding:'12px',borderRadius:10,border:'none',background:'#2563eb',color:'#fff',fontSize:15,fontWeight:600,cursor:loading?'not-allowed':'pointer',opacity:loading?.7:1}}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p style={{textAlign:'center',fontSize:12,color:'var(--text3)',marginTop:28}}>ТОО «Тұмар Күзет» · Внутренний доступ</p>
      </div>
    </div>
  )
}
