import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

// Service-role client: auth admin operations, storage, realtime. Bypasses RLS
// by design — the route guards are the real authorization, exactly as in v1.
//
// v1 builds this at module load from process.env. Under Deno the environment
// is read lazily (see env.ts), so a module-level createClient would run before
// the function has its secrets. The Proxy defers construction to first use
// while keeping the export v1's handlers import — they say `supabase.from(…)`
// and they are copied byte for byte, so the shape has to stay. Same trick, and
// the same reason, as db.ts.
let instance: SupabaseClient | undefined

export function getSupabase(): SupabaseClient {
  if (!instance) {
    const env = getEnv()
    instance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  }
  return instance
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const real = getSupabase()
    const value = real[prop as keyof SupabaseClient]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})
