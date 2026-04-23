import 'server-only'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/db/schema'

// Server-only Drizzle client. Uses the same connection string the Supabase
// CLI uses (SUPABASE_DB_URL in .env.local — the direct Postgres URL, not
// the REST URL). Drizzle owns data-access queries; the supabase-js client
// (src/lib/supabase.ts) stays for auth, storage, realtime.
//
// Lazy connect: the client is created on first query, not on module import.
// Next.js build-time static analysis imports this module without a real DB
// URL (placeholder env), and we don't want to throw there. We only fail on
// actual query.
//
// Connection pool is cached on globalThis in dev so hot-reload doesn't leak
// pg connections.

type Cache = {
  client?: postgres.Sql
  db?: ReturnType<typeof drizzle<typeof schema>>
}
const globalForDb = globalThis as unknown as { __drizzle?: Cache }

function getClient(): ReturnType<typeof drizzle<typeof schema>> {
  const cache: Cache = globalForDb.__drizzle ?? (globalForDb.__drizzle = {})
  if (cache.db) return cache.db
  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    throw new Error('SUPABASE_DB_URL is not set. Add it to .env.local.')
  }
  const client = postgres(url, { prepare: false, ssl: 'require' })
  cache.client = client
  cache.db = drizzle(client, { schema })
  return cache.db
}

// Proxy: every property access instantiates (or returns cached) the client.
// This way modules that import `db` at top level don't crash during Next.js
// static prerender — they only fail if a build-time code path actually queries.
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const real = getClient()
    const value = real[prop as keyof typeof real]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})
