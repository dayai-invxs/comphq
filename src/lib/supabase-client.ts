'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Browser-side Supabase client. Uses the anon key + the session cookie
// that @supabase/ssr manages. The client handles:
//   • auth.signInWithPassword / signOut / resetPasswordForEmail
//   • Realtime subscriptions (Score, HeatCompletion) — RLS-gated
//   • Any direct DB reads from RLS-accessible tables
//
// Memoized so components all share one WebSocket for Realtime.

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — client auth + Realtime need both.',
    )
  }
  client = createBrowserClient(url, anonKey)
  return client
}
