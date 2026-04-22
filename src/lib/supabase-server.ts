import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { env } from './env'

/**
 * Supabase client for server code paths (route handlers, server components,
 * server actions). Reads and writes the session cookie via next/headers so
 * `auth.getUser()` returns the logged-in user (if any).
 *
 * Uses the anon key; RLS applies. For admin mutations that must bypass
 * RLS (most of our routes), keep using `src/lib/supabase.ts` (service role).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a server component — cookies() is read-only in that
          // context. The middleware handles session refresh instead.
        }
      },
    },
  })
}
