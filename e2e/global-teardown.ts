import postgres from 'postgres'
import { adminEmail, dbUrl, serviceKey, supabaseUrl } from './env'
import { serviceClient } from './api'

/**
 * The sweep after the whole run.
 *
 * Every spec cleans up after itself, but a run that is killed — a timeout, a
 * crash, Ctrl-C — never reaches its own finally block. The project is shared,
 * so orphan rows accumulate across failed runs and somebody clears them by
 * hand. This runs unconditionally and deletes anything matching the prefixes
 * the suite names its fixtures with.
 *
 * Naming conventions, to keep in step when a spec is added:
 *   Competition.slug:
 *     e2e-*             happy-path.spec.ts, heat-reorder.spec.ts
 *     crud-*            admin-crud.spec.ts
 *     ag-a-*, ag-b-*    access-gates.spec.ts
 *   auth.users.email:
 *     *@test.local      every account a spec creates
 *
 * A competition delete cascades to its divisions, athletes, workouts, heat
 * assignments, scores, heat completions and admin rows; a user delete cascades
 * to their profile.
 *
 * The account the suite signs in as lives at that same domain, and v1's sweep
 * deleted it along with the throwaways — so the run after a killed run could
 * not log in. It is excluded by name here.
 */

const TEST_DOMAIN = '@test.local'
export default async function globalTeardown() {
  let connection: string
  try {
    // serviceClient() needs the other two, and it is used further down.
    supabaseUrl()
    serviceKey()
    connection = dbUrl()
  } catch {
    console.warn('[e2e teardown] Missing SUPABASE_* envs — skipping cleanup')
    return
  }

  const sql = postgres(connection, { prepare: false })
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
      console.log(
        `[e2e teardown] deleted ${deleted.length} orphan competition(s):`,
        deleted.map((r) => r.slug).join(', '),
      )
    }
  } finally {
    await sql.end()
  }

  const admin = serviceClient()
  const signedInAs = adminEmail()
  let deletedUsers = 0
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.warn('[e2e teardown] listUsers failed:', error.message)
      break
    }
    const users = data?.users ?? []
    if (users.length === 0) break

    const orphans = users.filter(
      (candidate) => candidate.email?.endsWith(TEST_DOMAIN) && candidate.email !== signedInAs,
    )
    for (const u of orphans) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
      if (delErr) console.warn(`[e2e teardown] deleteUser(${u.email}) failed:`, delErr.message)
      else deletedUsers++
    }

    if (users.length < 1000) break
    page++
  }
  if (deletedUsers > 0) {
    console.log(`[e2e teardown] deleted ${deletedUsers} orphan @test.local user(s)`)
  }
}
