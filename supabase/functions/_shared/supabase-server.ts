import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'
import { getRequestContext } from '@/lib/request-context'

/**
 * Supabase client bound to the calling user's session.
 *
 * v1 read the session from a cookie via next/headers. Edge Functions receive
 * the access token on the Authorization header instead, so the token is taken
 * from the request context. The zero-argument signature is deliberate: it
 * keeps auth-competition.ts byte-identical to v1, which is what lets v1's 21
 * auth specs prove the port.
 *
 * Uses the anon key, so RLS applies. Admin mutations that must bypass RLS keep
 * using the service-role client in supabase.ts, exactly as in v1.
 */
export async function createSupabaseServerClient() {
  const env = getEnv()
  const authHeader = getRequestContext()?.authHeader ?? ''
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
