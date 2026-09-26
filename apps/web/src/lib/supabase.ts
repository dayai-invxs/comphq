import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Browser-side Supabase client: sign-in, sign-out, password reset, and the
// Realtime subscriptions the leaderboard and TV screens listen on.
//
// v1 used @supabase/ssr's createBrowserClient because Next needed the session
// in a cookie its server components could read. Nothing here reads cookies:
// the SPA sends the access token in an Authorization header, which is what
// supabase/functions/_shared/supabase-server.ts was adapted to read. So the
// plain client, with its own storage, is the whole of it.
//
// Memoized, as v1 was, so every component shares one Realtime socket.

let client: SupabaseClient | undefined

// The values the whole app is configured by: this client is one consumer,
// api.ts is the other — it builds Edge Function URLs and sends the same key
// as `apikey`.
//
// functionsUrl is the project itself once the functions are deployed, and a
// local `supabase functions serve` port during development. It is separate
// from `url` because auth and Realtime still have to reach the hosted project
// while the functions answer from localhost.
// functionsRegion, when set, is the database's region: api.ts sends it as
// x-region so the gateway runs every function next to the data instead of
// wherever is closest to the caller. Unset locally — `supabase functions
// serve` has no regions.
export function getSupabaseEnv(): {
  url: string; anonKey: string; functionsUrl: string; functionsRegion?: string
} {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — auth and Realtime need both.',
    )
  }
  const trim = (value: string) => value.replace(/\/$/, '')
  return {
    url: trim(url),
    anonKey,
    functionsUrl: trim(import.meta.env.VITE_FUNCTIONS_URL || url),
    functionsRegion: import.meta.env.VITE_FUNCTIONS_REGION || undefined,
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client

  const { url, anonKey } = getSupabaseEnv()
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // v1 refreshed the token in Next middleware on every request. There is
      // no request to hang that on here, so the client does it itself.
      detectSessionInUrl: true,
    },
  })
  return client
}
