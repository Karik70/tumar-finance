'use client'
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Ensure auth user exists in public.users table (for FK constraints)
export async function ensureUserExists(supabase: ReturnType<typeof createClient>, user: { id: string; email?: string }) {
  await supabase.from('users').upsert(
    { id: user.id, email: user.email || '' },
    { onConflict: 'id', ignoreDuplicates: true }
  )
}
