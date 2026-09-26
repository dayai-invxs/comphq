import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login, seedCompetition } from './fixtures'

/**
 * The judge chain, end to end: a volunteer with the "Judge" role, assigned to
 * lanes on the workout screen, read back on the judge-schedule screen behind
 * the shared password gate.
 *
 * The gate is the one auth in the app that is not a session: a password from
 * settings, checked in the page, remembered in sessionStorage. It is driven
 * from a fresh browser context, because a signed-in session skips it.
 */

const GATE_PASSWORD = 'judges-spec-pass'

test.describe('judge assignment and schedule', () => {
  const slug = `judges-${Date.now()}`
  let competitionId: number | null = null
  let workoutId: number
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const seeded = await seedCompetition(call, {
      slug,
      athletes: ['A One', 'A Two', 'A Three', 'A Four', 'A Five', 'A Six'],
      lanes: 3,
      workout: { number: 1, name: 'Judged', scoreType: 'time' },
      active: true,
    })
    competitionId = seeded.competition.id
    workoutId = seeded.workout.id

    const role = await call('POST', '/api/volunteer-roles', { slug, name: 'Judge' }) as { id: number }
    await call('POST', '/api/volunteers', { slug, name: 'Judy Judge', roleId: role.id })
    await call('POST', '/api/volunteers', { slug, name: 'Jules Judge', roleId: role.id })
    await call('PATCH', '/api/settings', { slug, judgePassword: GATE_PASSWORD })
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  test('auto-assign fills the lanes, clear empties them', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/workouts/${workoutId}`)

    await page.getByRole('button', { name: 'Auto-Assign Judges' }).click()
    // Clear Judges only renders while assignments exist — it appearing is the
    // proof the auto-assign landed.
    const clear = page.getByRole('button', { name: 'Clear Judges' })
    await expect(clear).toBeVisible({ timeout: 10_000 })

    await clear.click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear judges' }).click()
    await expect(clear).toHaveCount(0, { timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('a manual lane pick shows up on the judge schedule', async ({ page, browser }) => {
    await login(page)
    await page.goto(`/${slug}/admin/workouts/${workoutId}`)

    await page.locator('#heat-1').getByRole('combobox', { name: 'Judge for lane 1' })
      .selectOption({ label: 'Judy Judge' })
    await expectNoErrorBanner(page)

    // The gate, from a context that holds no session.
    const anon = await browser.newContext()
    const gatePage = await anon.newPage()
    await gatePage.goto(`/${slug}/judges`)

    await gatePage.getByRole('textbox', { name: 'Password' }).fill('wrong-pass')
    await gatePage.getByRole('button', { name: 'Enter' }).click()
    await expect(gatePage.getByText('Incorrect password')).toBeVisible({ timeout: 10_000 })

    await gatePage.getByRole('textbox', { name: 'Password' }).fill(GATE_PASSWORD)
    await gatePage.getByRole('button', { name: 'Enter' }).click()
    await expect(gatePage.getByText('Judy Judge')).toBeVisible({ timeout: 10_000 })

    // The search narrows to the judge asked for.
    await gatePage.getByRole('searchbox', { name: 'Search judge' }).fill('Jules')
    await expect(gatePage.getByText('Judy Judge')).toHaveCount(0)

    await anon.close()
  })
})
