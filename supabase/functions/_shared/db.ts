import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import { getEnv } from '@/lib/env'

// v1 wrapped this in a lazy Proxy purely to survive Next's build-time static
// prerender, which imported the module without a real DB URL. No prerender
// step exists here, so the wrapper is gone.
//
// prepare: false is required behind Supabase's transaction pooler — pgbouncer
// in transaction mode cannot hold prepared statements across checkouts.
//
// v1 hardcoded ssl: 'require' because it only ever spoke to hosted Supabase.
// The golden-master differential runs against a local Postgres that has no
// TLS, so the mode comes from the connection string when it says one, and
// falls back to require when it does not.
let client: postgres.Sql | undefined
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (instance) return instance
  const url = getEnv().SUPABASE_DB_URL
  const declared = new URL(url).searchParams.has('sslmode')
  client = postgres(url, { prepare: false, ...(declared ? {} : { ssl: 'require' as const }) })
  instance = drizzle(client, { schema })
  return instance
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_t, prop) {
    const real = getDb()
    const value = real[prop as keyof typeof real]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})
