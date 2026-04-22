import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

/**
 * Integration tests: real Supabase project, real RLS. Hits the DB at the
 * linked test project.
 *
 * Matrix for each protected table:
 *   • anon:        cannot insert/update/delete
 *   • authed-none: authed user with zero membership — cannot write
 *   • comp-admin:  authed user IS CompetitionAdmin of comp A
 *                  — can write to A's rows, NOT to B's rows
 *   • super:       authed user with UserProfile.isSuper=true
 *                  — can write to any comp's rows
 *
 * Tests create their own ephemeral Supabase Auth users + competitions and
 * tear them down in afterAll. No dependence on the linked project's other
 * data.
 */

const URL = process.env.SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_KEY!
const ANON_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(ANON_URL, ANON_KEY, { auth: { persistSession: false } })

// Scoped state: two comps, one super-user, one comp-admin-of-A, one authed-none.
let compA: { id: number; slug: string }
let compB: { id: number; slug: string }
let superUser: User
let compAdmin: User
let noneUser: User

const password = 'rls-test-password-12345'

async function signUp(email: string): Promise<User> {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user!
}

async function asClient(email: string): Promise<SupabaseClient> {
  const client = createClient(ANON_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) → ${error.message}`)
  return client
}

beforeAll(async () => {
  const ts = Date.now()
  const mk = (tag: string) => `rls-${tag}-${ts}@test.local`

  // Create comps via service role.
  const { data: cA } = await admin.from('Competition').insert({ name: `A-${ts}`, slug: `rls-a-${ts}` }).select('*').single()
  compA = cA as { id: number; slug: string }
  const { data: cB } = await admin.from('Competition').insert({ name: `B-${ts}`, slug: `rls-b-${ts}` }).select('*').single()
  compB = cB as { id: number; slug: string }

  // Create users.
  superUser = await signUp(mk('super'))
  compAdmin = await signUp(mk('admin'))
  noneUser = await signUp(mk('none'))

  // UserProfile rows auto-create via trigger. Mark super.
  await admin.from('UserProfile').update({ isSuper: true }).eq('id', superUser.id)

  // Grant compAdmin on compA only.
  await admin.from('CompetitionAdmin').insert({ userId: compAdmin.id, competitionId: compA.id })
})

afterAll(async () => {
  // Wipe in dependency order.
  const ids = [compA?.id, compB?.id].filter(Boolean)
  if (ids.length) await admin.from('Competition').delete().in('id', ids as number[])
  for (const u of [superUser, compAdmin, noneUser]) {
    if (u) await admin.auth.admin.deleteUser(u.id)
  }
})

describe('RLS: Competition', () => {
  it('anon cannot INSERT', async () => {
    const { error } = await anon.from('Competition').insert({ name: 'X', slug: `x-${Date.now()}` })
    expect(error).toBeTruthy()
  })

  it('authed non-super cannot INSERT', async () => {
    const c = await asClient(compAdmin.email!)
    const { error } = await c.from('Competition').insert({ name: 'X', slug: `x-${Date.now()}` })
    expect(error).toBeTruthy()
    expect(error?.message.toLowerCase()).toMatch(/(row-level security|permission)/)
  })

  it('super CAN INSERT', async () => {
    const c = await asClient(superUser.email!)
    const slug = `rls-super-${Date.now()}`
    const { data, error } = await c.from('Competition').insert({ name: 'S', slug }).select('*').single()
    expect(error).toBeNull()
    // Cleanup
    if (data) await admin.from('Competition').delete().eq('id', (data as { id: number }).id)
  })
})

describe('RLS: per-competition tables', () => {
  it('anon cannot INSERT into Athlete', async () => {
    const { error } = await anon.from('Athlete').insert({ name: 'Ghost', competitionId: compA.id })
    expect(error).toBeTruthy()
  })

  it('authed non-member cannot INSERT into Athlete', async () => {
    const c = await asClient(noneUser.email!)
    const { error } = await c.from('Athlete').insert({ name: 'Ghost', competitionId: compA.id })
    expect(error).toBeTruthy()
  })

  it('comp-admin-of-A CAN INSERT into Athlete for comp A', async () => {
    const c = await asClient(compAdmin.email!)
    const { data, error } = await c.from('Athlete').insert({ name: 'CompA Ath', competitionId: compA.id }).select('*').single()
    expect(error).toBeNull()
    if (data) await admin.from('Athlete').delete().eq('id', (data as { id: number }).id)
  })

  it('comp-admin-of-A CANNOT INSERT into Athlete for comp B', async () => {
    const c = await asClient(compAdmin.email!)
    const { error } = await c.from('Athlete').insert({ name: 'CompB Ath', competitionId: compB.id })
    expect(error).toBeTruthy()
  })

  it('super CAN INSERT into Athlete for any comp', async () => {
    const c = await asClient(superUser.email!)
    const { data, error } = await c.from('Athlete').insert({ name: 'Super A', competitionId: compA.id }).select('*').single()
    expect(error).toBeNull()
    if (data) await admin.from('Athlete').delete().eq('id', (data as { id: number }).id)

    const { data: d2, error: e2 } = await c.from('Athlete').insert({ name: 'Super B', competitionId: compB.id }).select('*').single()
    expect(e2).toBeNull()
    if (d2) await admin.from('Athlete').delete().eq('id', (d2 as { id: number }).id)
  })
})

describe('RLS: UserProfile', () => {
  it('user reads own UserProfile row', async () => {
    const c = await asClient(noneUser.email!)
    const { data, error } = await c.from('UserProfile').select('id, isSuper').eq('id', noneUser.id).maybeSingle()
    expect(error).toBeNull()
    expect((data as { id: string } | null)?.id).toBe(noneUser.id)
  })

  it('user CANNOT read other UserProfile rows', async () => {
    const c = await asClient(noneUser.email!)
    const { data } = await c.from('UserProfile').select('id, isSuper').eq('id', compAdmin.id).maybeSingle()
    expect(data).toBeNull() // RLS silently filters, returns no rows
  })

  it('super reads all UserProfile rows', async () => {
    const c = await asClient(superUser.email!)
    const { data, error } = await c.from('UserProfile').select('id').order('id')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('RLS: CompetitionAdmin', () => {
  it('user sees their own CompetitionAdmin rows', async () => {
    const c = await asClient(compAdmin.email!)
    const { data } = await c.from('CompetitionAdmin').select('*').eq('userId', compAdmin.id)
    expect((data ?? []).length).toBe(1)
  })

  it('user CANNOT see other users\' CompetitionAdmin rows', async () => {
    const c = await asClient(noneUser.email!)
    const { data } = await c.from('CompetitionAdmin').select('*').eq('userId', compAdmin.id)
    expect((data ?? []).length).toBe(0)
  })

  it('super reads all CompetitionAdmin rows', async () => {
    const c = await asClient(superUser.email!)
    const { data, error } = await c.from('CompetitionAdmin').select('*')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it('non-super CANNOT INSERT CompetitionAdmin', async () => {
    const c = await asClient(compAdmin.email!)
    const { error } = await c.from('CompetitionAdmin').insert({ userId: noneUser.id, competitionId: compA.id })
    expect(error).toBeTruthy()
  })

  it('super CAN INSERT CompetitionAdmin', async () => {
    const c = await asClient(superUser.email!)
    const { error } = await c.from('CompetitionAdmin').insert({ userId: noneUser.id, competitionId: compB.id })
    expect(error).toBeNull()
    // Cleanup the grant
    await admin.from('CompetitionAdmin').delete()
      .eq('userId', noneUser.id).eq('competitionId', compB.id)
  })
})
