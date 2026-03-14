import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Тұмар — Финансы', description: 'Финансовый дашборд ТОО Тұмар Күзет' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>
}
