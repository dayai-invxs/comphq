import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

/**
 * Safety-net cleanup after the whole E2E run.
 *
 * Per-test afterAll / finally hooks usually handle their own fixtures, but
 * a test abort (timeout, crash, Ctrl-C) skips them. Since the linked
 * Supabase project is shared — prod today, a dedicated staging project
 * eventually — orphan rows accumulate across failed runs. This sweep runs
 * unconditionally after Playwright finishes and deletes anything matching
 * the prefixes every e2e spec uses.
 *
 * Naming conventions in the suite (keep in sync when you add specs):
 *   Competition.slug:
 *     e2e-*               (happy-path.spec.ts, heat-reorder.spec.ts)
 *     crud-*              (admin-crud.spec.ts)
 *     ag-a-*, ag-b-*      (access-gates.spec.ts)
 *   auth.users.email:
 *     *@test.local        (all created test users)
 *
 * Competition deletes cascade to Division/Athlete/Workout/HeatAssignment/
 * Score/HeatCompletion/CompetitionAdmin via FK onDelete: cascade.
 * auth.users deletes cascade to UserProfile via FK onDelete: cascade.
 */
export default async function globalTeardown() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!url || !key || !dbUrl) {
    console.warn('[e2e teardown] Missing SUPABASE_* envs — skipping cleanup')
    return
  }

  const sql = postgres(dbUrl, { prepare: false })
  try {
    const deleted = await sql<{ id: number; slug: string }[]>`
      DELETE FROM "Competition"
      WHERE slug LIKE 'e2e-%'
         OR slug LIKE 'crud-%'
         OR slug LIKE 'ag-a-%'
         OR slug LIKE 'ag-b-%'
      RETURNING id, slug
    `
    if (deleted.length > 0) {
      console.log(`[e2e teardown] deleted ${deleted.length} orphan competition(s):`,
        deleted.map((r) => r.slug).join(', '))
    }
  } finally {
    await sql.end()
  }

  const admin = createClient(url, key, { auth: { persistSession: false } })
  let deletedUsers = 0
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.warn('[e2e teardown] listUsers failed:', error.message)
      break
    }
    const users = data?.users ?? []
    if (users.length === 0) break

    const targets = users.filter((u) => u.email?.endsWith('@test.local'))
    for (const u of targets) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
      if (delErr) {
        console.warn(`[e2e teardown] deleteUser(${u.email}) failed:`, delErr.message)
      } else {
        deletedUsers++
      }
    }

    if (users.length < 1000) break
    page++
  }
  if (deletedUsers > 0) {
    console.log(`[e2e teardown] deleted ${deletedUsers} orphan @test.local user(s)`)
  }
}
