import { test, expect, type Page } from '@playwright/test'
import type { User } from '@supabase/supabase-js'
import { serviceClient } from './api'
import { login } from './fixtures'

/**
 * The gates, from the outside. Each of these redirects is also a 403 on the
 * server, and this is the proof that a person who never sees the 403 is still
 * stopped:
 *
 *   - a member of comp A opening /admin lands on /A/admin
 *   - somebody with no membership opening /admin is told access is required
 *   - a member of A opening /B/admin is told they have no access to it
 *   - a super opens either, and neither stops them
 *
 * Throwaway users and competitions per run; removed in afterAll, and swept by
 * the global teardown if a run is killed before it gets there.
 *
 * Ported from v1's e2e/access-gates.spec.ts. The screens are redrawn, so the
 * names are v3's; the four rules are v1's.
 */

const admin = serviceClient()

const ts = Date.now()
const passwd = 'access-gate-password-12345'
let compA: { id: number; slug: string }
let compB: { id: number; slug: string }
let memberUser: User
let noneUser: User

test.beforeAll(async () => {
  const { data: a } = await admin.from('Competition')
    .insert({ name: `A-${ts}`, slug: `ag-a-${ts}` }).select('*').single()
  const { data: b } = await admin.from('Competition')
    .insert({ name: `B-${ts}`, slug: `ag-b-${ts}` }).select('*').single()
  compA = a as { id: number; slug: string }
  compB = b as { id: number; slug: string }

  const { data: m } = await admin.auth.admin.createUser({
    email: `ag-member-${ts}@test.local`, password: passwd, email_confirm: true,
  })
  const { data: n } = await admin.auth.admin.createUser({
    email: `ag-none-${ts}@test.local`, password: passwd, email_confirm: true,
  })
  memberUser = m.user!
  noneUser = n.user!

  await admin.from('CompetitionAdmin').insert({ userId: memberUser.id, competitionId: compA.id })
})

test.afterAll(async () => {
  if (compA) await admin.from('Competition').delete().eq('id', compA.id)
  if (compB) await admin.from('Competition').delete().eq('id', compB.id)
  if (memberUser) await admin.auth.admin.deleteUser(memberUser.id)
  if (noneUser) await admin.auth.admin.deleteUser(noneUser.id)
})

const asUser = (page: Page, email: string) => login(page, email, passwd)

test.describe('non-super with zero memberships', () => {
  test('visiting /admin is told access is required', async ({ page }) => {
    await asUser(page, noneUser.email!)
    await expect(page.getByRole('heading', { name: 'Access required' }))
      .toBeVisible({ timeout: 10_000 })
  })

  test('visiting a competition they are not in is told so', async ({ page }) => {
    await asUser(page, noneUser.email!)
    await page.goto(`/${compA.slug}/admin`)
    await expect(page.getByRole('heading', { name: /no access to this competition/i }))
      .toBeVisible({ timeout: 10_000 })
  })
})

test.describe('non-super with membership on comp A', () => {
  test('visiting /admin bounces to /A/admin', async ({ page }) => {
    await asUser(page, memberUser.email!)
    await expect(page).toHaveURL(new RegExp(`/${compA.slug}/admin/?$`), { timeout: 10_000 })
  })

  test('visiting /B/admin is told they have no access to it', async ({ page }) => {
    await asUser(page, memberUser.email!)
    await page.goto(`/${compB.slug}/admin`)
    await expect(page.getByRole('heading', { name: /no access to this competition/i }))
      .toBeVisible({ timeout: 10_000 })
  })

  test('visiting /A/admin reaches the competition it belongs to', async ({ page }) => {
    await asUser(page, memberUser.email!)
    await page.goto(`/${compA.slug}/admin`)
    // The Dashboard link is the competition rail, and only that shell has one.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true }))
      .toBeVisible({ timeout: 10_000 })
  })
})

test.describe('super admin', () => {
  test('visiting /admin reaches the site-wide rail', async ({ page }) => {
    await login(page)
    await expect(page.getByRole('link', { name: 'Competitions' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage Users' })).toBeVisible()
  })

  test('may open a competition they hold no membership row for', async ({ page }) => {
    await login(page)
    await page.goto(`/${compB.slug}/admin`)
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true }))
      .toBeVisible({ timeout: 10_000 })
  })
})
