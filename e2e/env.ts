import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// One .env.local at the repo root already serves the tools, the migrations,
// the Edge Functions and Vite. Node reads it natively, so the suite carries no
// dotenv dependency and no second copy of the parser in tools/pg.mjs.
const ENV_FILE = fileURLToPath(new URL('../.env.local', import.meta.url))
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`${key} is not set. Put it in comphq-v3/.env.local.`)
  return value
}

const trim = (value: string) => value.replace(/\/$/, '')

/** The SPA. Vite's own default port — v1 was Next on 3000 and both can run at once. */
export const baseURL = trim(process.env.E2E_BASE_URL ?? 'http://localhost:5173')

/**
 * The Edge Functions. A second origin is the whole architectural difference
 * between this suite and v1's: there the API was same-origin and arrived on a
 * cookie, here it is a separate server reached with a bearer token.
 */
export const functionsUrl = trim(process.env.VITE_FUNCTIONS_URL ?? 'http://localhost:54321')

// Everything below is read on use rather than on import, so `playwright test
// --list` can enumerate the suite on a machine that has no credentials.
export const supabaseUrl = () => trim(required('SUPABASE_URL'))
export const anonKey = () => required('VITE_SUPABASE_ANON_KEY')
export const serviceKey = () => required('SUPABASE_SERVICE_KEY')
export const dbUrl = () => required('SUPABASE_DB_URL')

export const adminEmail = () => process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local'
export const adminPassword = () => process.env.E2E_ADMIN_PASSWORD ?? 'crossfit123456'
