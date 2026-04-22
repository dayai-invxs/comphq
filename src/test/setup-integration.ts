// Integration-test setup: no mocks. Real Supabase project, real cookies,
// real RLS. Keeps the linked test DB as-is — no cleanup between tests
// beyond what each test does itself.
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY (all sourced from .env.local).
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })
