import { test, expect, type Page } from '@playwright/test'
import { createClient, type User } from '@supabase/supabase-js'

/**
 * Access-gate E2E. Verifies the layout-level redirects that server routes'
 * 403s were supposed to catch as a fallback:
 *
 * - non-super with membership on comp A visits /admin → redirected to /A/admin
 * - non-super with NO memberships visits /admin → access-denied screen
 * - non-super admin of A visits /B/admin → "no access to this competition"
 * - super visits /admin or /any-slug/admin → loads normally
 *
 * Creates throwaway auth users + comps per-run, tears down in afterAll.
 */

const URL = process.env.SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_KEY!

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

const ts = Date.now()
const passwd = 'access-gate-password-12345'
let compA: { id: number; slug: string }
let compB: { id: number; slug: string }
let memberUser: User
let noneUser: User

test.beforeAll(async () => {
  // Two comps.
  const { data: a } = await admin.from('Competition').insert({ name: `A-${ts}`, slug: `ag-a-${ts}` }).select('*').single()
  const { data: b } = await admin.from('Competition').insert({ name: `B-${ts}`, slug: `ag-b-${ts}` }).select('*').single()
  compA = a as { id: number; slug: string }
  compB = b as { id: number; slug: string }

  // Two users: one CompetitionAdmin of A only, one with zero memberships.
  const { data: m } = await admin.auth.admin.createUser({ email: `ag-member-${ts}@test.local`, password: passwd, email_confirm: true })
  const { data: n } = await admin.auth.admin.createUser({ email: `ag-none-${ts}@test.local`, password: passwd, email_confirm: true })
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

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(passwd)
  await page.getByRole('button', { name: 'Sign In' }).click()
  // Login redirects to /admin by default; non-supers bounce onward.
  await page.waitForURL(/\/(admin|ag-.+\/admin)/)
}

test.describe('non-super with zero memberships', () => {
  test('visiting /admin shows access-denied screen', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(noneUser.email!)
    await page.getByLabel('Password').fill(passwd)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/admin', { timeout: 10_000 })

    await expect(page.getByRole('heading', { name: 'Access required' })).toBeVisible({ timeout: 10_000 })
  })

  test('visiting a random /{slug}/admin shows no-access screen', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(noneUser.email!)
    await page.getByLabel('Password').fill(passwd)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/admin', { timeout: 10_000 })

    await page.goto(`/${compA.slug}/admin`)
    await expect(page.getByRole('heading', { name: /no access to this competition/i })).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('non-super with membership on comp A', () => {
  test('visiting /admin bounces to /A/admin', async ({ page }) => {
    await login(page, memberUser.email!)
    await expect(page).toHaveURL(new RegExp(`/${compA.slug}/admin/?$`), { timeout: 10_000 })
  })

  test('visiting /B/admin shows no-access screen', async ({ page }) => {
    await login(page, memberUser.email!)
    await page.goto(`/${compB.slug}/admin`)
    await expect(page.getByRole('heading', { name: /no access to this competition/i })).toBeVisible({ timeout: 10_000 })
  })

  test('visiting /A/admin loads the dashboard', async ({ page }) => {
    await login(page, memberUser.email!)
    await page.goto(`/${compA.slug}/admin`)
    // The per-comp admin page renders headings unique to that layout
    // (the "Dashboard" nav link).
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('super admin', () => {
  test('visiting /admin renders the super dashboard with nav buttons', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local')
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'crossfit123456')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/admin')

    await expect(page.getByRole('link', { name: 'Competitions' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage Users' })).toBeVisible()
  })

  test('super can visit any comp admin page (even one they have no CompetitionAdmin row for)', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local')
    await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? 'crossfit123456')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/admin', { timeout: 10_000 })

    await page.goto(`/${compB.slug}/admin`)
    // Dashboard nav link (href="/{slug}/admin") is unique to the comp-admin layout.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 10_000 })
  })
})
