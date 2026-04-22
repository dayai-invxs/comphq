import { test, expect, type Page } from '@playwright/test'

/**
 * UI-driven CRUD coverage for the admin pages that weren't exercised by
 * happy-path (which seeds via API). Catches regressions like "the edit
 * button on athletes/divisions drops the slug query param and gets a 404".
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'crossfit123456'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/admin')
}

test.describe('admin CRUD via UI', () => {
  const slug = `crud-${Date.now()}`
  let competitionId: number | null = null

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await login(page)
    const cookies = await ctx.cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const res = await page.request.fetch('/api/competitions', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
      data: JSON.stringify({ name: `CRUD ${slug}`, slug }),
    })
    expect(res.ok(), `Create comp: ${res.status()}`).toBeTruthy()
    const comp = await res.json()
    competitionId = comp.id
    await ctx.close()
  })

  test.afterAll(async ({ browser }) => {
    if (competitionId == null) return
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await login(page)
    const cookies = await ctx.cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    await page.request.fetch(`/api/competitions/${competitionId}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader },
    })
    await ctx.close()
  })

  test('athletes: add → edit → delete via UI', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/athletes`)

    // Add
    await page.getByPlaceholder('Name').fill('Bugsy Testuser')
    await page.getByPlaceholder('Bib #').first().fill('777')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Bugsy Testuser')).toBeVisible({ timeout: 10_000 })

    // Edit — rename via the edit button (regression: used to 404 because
    // the PUT dropped the slug query param).
    await page.getByRole('button', { name: 'Edit' }).click()
    // The editing row is the only input[type="text"] inside <tbody>; the
    // top "Add" form lives outside tbody.
    const nameInput = page.locator('tbody input[type="text"]').first()
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Bugsy Renamed')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Bugsy Renamed')).toBeVisible({ timeout: 10_000 })
    // No visible error banner
    // Our page's own error banner (as opposed to Next.js dev overlay)
    await expect(page.locator('[role="alert"].bg-red-950')).toHaveCount(0)

    // Delete (confirm dialog)
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Bugsy Renamed')).toHaveCount(0)
    // Our page's own error banner (as opposed to Next.js dev overlay)
    await expect(page.locator('[role="alert"].bg-red-950')).toHaveCount(0)
  })

  test('divisions: add → edit → delete via UI', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/divisions`)

    // Add
    await page.getByPlaceholder(/^1$|^2$|^RX/i).first().fill('9')
    await page.getByPlaceholder('e.g. RX, Scaled, Masters').fill('BugDivision')
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText('BugDivision')).toBeVisible({ timeout: 10_000 })

    // Edit
    await page.getByRole('button', { name: 'Edit' }).click()
    const nameBox = page.locator('tbody input[type="text"]').first()
    await nameBox.fill('BugDivRenamed')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('BugDivRenamed')).toBeVisible({ timeout: 10_000 })

    // Delete
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('BugDivRenamed')).toHaveCount(0)
  })

  test('workouts: duplicate number surfaces a friendly error (not a silent 500)', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/workouts`)

    // The workouts form labels aren't wired via htmlFor; target by position
    // within the form grid (Workout # is first number input, Name is first
    // text input in the form).
    const workoutNumber = page.locator('form input[type="number"]').first()
    const workoutName = page.locator('form input[type="text"]').first()

    // First workout with number 42 — should succeed.
    await workoutNumber.fill('42')
    await workoutName.fill('DupTest A')
    await page.getByRole('button', { name: 'Create Workout' }).click()
    await expect(page.getByRole('link', { name: /WOD 42: DupTest A/ })).toBeVisible({ timeout: 10_000 })

    // Second workout with the same number — should surface the 409 message
    // in the page's error banner instead of silently failing.
    await workoutNumber.fill('42')
    await workoutName.fill('DupTest B')
    await page.getByRole('button', { name: 'Create Workout' }).click()

    const banner = page.locator('[role="alert"].bg-red-950')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await expect(banner).toContainText(/number 42 already exists/i)
    // Second workout was NOT created.
    await expect(page.getByRole('link', { name: /DupTest B/ })).toHaveCount(0)
  })
})
