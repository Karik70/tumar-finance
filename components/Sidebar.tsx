'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const NAV = [
  { href:'/dashboard',        icon:'📊', label:'Дашборд' },
  { href:'/entry/bank',       icon:'🏦', label:'Выписка банка' },
  { href:'/entry/cash',       icon:'💵', label:'Расход наличных' },
  { href:'/entry/snapshot',   icon:'📋', label:'Остатки (ежедневно)' },
  { href:'/analytics',        icon:'📈', label:'Аналитика' },
  { href:'/salary',           icon:'👥', label:'ЗП / Покрытие' },
]

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close menu on navigation
  useEffect(() => { setOpen(false) }, [path])

  async function logout() {
    const s = createClient(); await s.auth.signOut(); router.push('/login')
  }

  // Mobile: hamburger button + slide-out menu
  if (isMobile) {
    return (
      <>
        {/* Hamburger button */}
        <button
          onClick={() => setOpen(!open)}
          style={{
            position:'fixed', top:12, left:12, zIndex:1001,
            width:40, height:40, borderRadius:10,
            background:'var(--bg2)', border:'1px solid var(--border)',
            color:'var(--text)', fontSize:20, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}
          aria-label="Меню"
        >
          {open ? '✕' : '☰'}
        </button>

        {/* Overlay */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{
              position:'fixed', inset:0, zIndex:999,
              background:'rgba(0,0,0,0.5)',
              backdropFilter:'blur(2px)',
            }}
          />
        )}

        {/* Slide-out menu */}
        <aside style={{
          position:'fixed', top:0, left:0, bottom:0, zIndex:1000,
          width:260, background:'var(--bg2)',
          borderRight:'1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition:'transform .25s ease',
          display:'flex', flexDirection:'column',
          overflowY:'auto',
        }}>
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
                <Link key={href} href={href} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:8,marginBottom:2,textDecoration:'none',background:active?'var(--blue-bg)':'transparent',color:active?'var(--blue)':'var(--text2)',fontSize:15,fontWeight:active?500:400,transition:'all .15s'}}>
                  <span style={{fontSize:18,flexShrink:0}}>{icon}</span>{label}
                </Link>
              )
            })}
          </nav>
          <div style={{padding:'14px 16px',borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:12,color:'var(--text2)',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</div>
            <button onClick={logout} style={{background:'none',border:'1px solid var(--border2)',color:'var(--text2)',borderRadius:6,padding:'8px 12px',fontSize:13,cursor:'pointer',width:'100%'}}>Выйти</button>
          </div>
        </aside>
      </>
    )
  }

  // Desktop: standard sidebar
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
