type Color = 'green'|'red'|'amber'|'blue'|'default'
const C: Record<Color,{bg:string,text:string,border:string}> = {
  green:  {bg:'var(--green-bg)', text:'var(--green)', border:'rgba(63,185,80,.25)'},
  red:    {bg:'var(--red-bg)',   text:'var(--red)',   border:'rgba(248,81,73,.25)'},
  amber:  {bg:'var(--amber-bg)', text:'var(--amber)', border:'rgba(210,153,34,.25)'},
  blue:   {bg:'var(--blue-bg)',  text:'var(--blue)',  border:'rgba(88,166,255,.25)'},
  default:{bg:'var(--bg3)',      text:'var(--text)',  border:'var(--border2)'},
}
export default function StatCard({label,value,sub,color='default',large}:{label:string,value:string|number,sub?:string,color?:Color,large?:boolean}) {
  const c = C[color]
  const fmt = typeof value==='number' ? value.toLocaleString('ru-RU')+' ₸' : value
  return (
    <div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:12,padding:'16px 20px'}}>
      <div style={{fontSize:11,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{label}</div>
      <div style={{fontSize:large?30:22,fontWeight:600,color:c.text,fontVariantNumeric:'tabular-nums',lineHeight:1,marginBottom:sub?6:0}}>{fmt}</div>
      {sub && <div style={{fontSize:12,color:'var(--text2)',marginTop:4}}>{sub}</div>}
    </div>
  )
}
