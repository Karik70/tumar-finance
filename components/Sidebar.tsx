'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const NAV = [
  { href:'/dashboard',        icon:'📊', label:'Дашборд' },
  { href:'/entry/bank',       icon:'🏦', label:'Выписка банка' },
  { href:'/entry/cash',       icon:'💵', label:'Расход наличных' },
  { href:'/entry/snapshot',   icon:'📋', label:'Остатки (пятница)' },
  { href:'/analytics',        icon:'📈', label:'Аналитика' },
  { href:'/salary',           icon:'👥', label:'ЗП / Покрытие' },
]

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const path = usePathname()
  const router = useRouter()
  async function logout() {
    const s = createClient(); await s.auth.signOut(); router.push('/login')
  }
  return (
    <aside style={{width:220,minHeight:'100vh',background:'var(--bg2)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',flexShrink:0,position:'sticky',top:0,height:'100vh',overflowY:'auto'}}>
      <div style={{padding:'22px 18px 18px',borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#2563eb,#1d4ed8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>⚡</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,letterSpacing:'.06em'}}>ТҰМАР</div>
            <div style={{fontSize:11,color:'var(--text2)'}}>Финансы</div>
          </div>
        </div>
      </div>
      <nav style={{padding:'10px 8px',flex:1}}>
        {NAV.map(({href,icon,label})=>{
          const active = path === href || (href !== '/dashboard' && path.startsWith(href))
          return (
            <Link key={href} href={href} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,marginBottom:2,textDecoration:'none',background:active?'var(--blue-bg)':'transparent',color:active?'var(--blue)':'var(--text2)',fontSize:14,fontWeight:active?500:400,transition:'all .15s'}}>
              <span style={{fontSize:16,flexShrink:0}}>{icon}</span>{label}
            </Link>
          )
        })}
      </nav>
      <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)'}}>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</div>
        <button onClick={logout} style={{background:'none',border:'1px solid var(--border2)',color:'var(--text2)',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',width:'100%'}}>Выйти</button>
      </div>
    </aside>
  )
}
