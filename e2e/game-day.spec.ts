import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login, seedCompetition } from './fixtures'

/**
 * The screens that run the floor on the day: the athlete-control ticks, the
 * equipment checks behind the shared gate, the public schedule a spectator
 * scans into, and the exports the organiser leaves with.
 *
 * One seeded competition serves all of them: an active workout with generated
 * heats, a start time so the schedule has times to print, and one equipment
 * item so the kit list has contents.
 */

const GATE_PASSWORD = 'gameday-spec-pass'

test.describe('game day screens', () => {
  const slug = `gameday-${Date.now()}`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const seeded = await seedCompetition(call, {
      slug,
      // Six over three lanes is two heats: the schedule prints the first as
      // the NOW strip with its lanes open, and the second as a row to expand.
      athletes: ['Runner One', 'Runner Two', 'Runner Three', 'Runner Four', 'Runner Five', 'Runner Six'],
      lanes: 3,
      workout: { number: 1, name: 'Floor WOD', scoreType: 'time' },
      active: true,
    })
    competitionId = seeded.competition.id

    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await call('PUT', `/api/workouts/${seeded.workout.id}?slug=${slug}`, { startTime })
    await call('POST', `/api/workouts/${seeded.workout.id}/equipment?slug=${slug}`, { item: 'Barbell' })
    await call('PATCH', '/api/settings', { slug, judgePassword: GATE_PASSWORD })
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  test('control: corral and walk-out ticks, then reset clears every one', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/control`)

    // click + polled assert, not check(): the tick is a cache-first write and
    // the box is a controlled input, so the flip is not synchronous with the
    // click the way check() demands.
    const corral = page.getByRole('checkbox', { name: 'Corral heat 1' })
    const walkout = page.getByRole('checkbox', { name: 'Walk Out heat 1' })
    await corral.click()
    await expect(corral).toBeChecked({ timeout: 10_000 })
    await walkout.click()
    await expect(walkout).toBeChecked({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Reset' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset checks' }).click()
    await expect(corral).not.toBeChecked({ timeout: 10_000 })
    await expect(walkout).not.toBeChecked()
    await expectNoErrorBanner(page)
  })

  test('control: a heat start time can be edited in place', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/control`)

    await page.getByRole('button', { name: 'Edit heat 1 start time' }).click()
    await page.getByLabel('Heat 1 start time').fill('10:30')
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await save.click()

    // The editor closes only when the write lands. Asserted on the Save button
    // rather than the input's label: the closed display carries the same one.
    await expect(save).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByText('10:30 AM').first()).toBeVisible()
    await expectNoErrorBanner(page)
  })

  test('equipment: gate, tick a heat, read the kit, reset', async ({ browser }) => {
    const anon = await browser.newContext()
    const page = await anon.newPage()
    await page.goto(`/${slug}/equipment`)

    await page.getByRole('textbox', { name: 'Password' }).fill(GATE_PASSWORD)
    await page.getByRole('button', { name: 'Enter' }).click()

    // No divisions seeded, so the per-heat check is the "No Division" one.
    // click + polled assert: same cache-first tick as the control screen.
    const check = page.getByRole('checkbox', { name: 'No Division' }).first()
    await check.click()
    await expect(check).toBeChecked({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Show kit' }).first().click()
    await expect(page.getByText('Barbell').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Reset' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset checks' }).click()
    await expect(check).not.toBeChecked({ timeout: 10_000 })

    await anon.close()
  })

  test('public schedule: the NOW heat shows its lanes, the next one expands', async ({ page }) => {
    // The schedule hides heats already walked out, and the control test above
    // ticked heat 1 — clear the slate first.
    await call('PATCH', '/api/checks', { slug, type: 'athlete', checks: {} })
    await page.goto(`/${slug}`)

    // The first pending heat is the NOW strip, lanes already open.
    await expect(page.getByRole('list', { name: 'Heat 1 lanes' }))
      .toContainText('Runner One', { timeout: 10_000 })

    const row = page.getByRole('button', { name: /Heat 2/ })
    await row.click()
    await expect(page.getByRole('list', { name: 'Heat 2 lanes' })).toContainText('Runner')
  })

  test('dashboard: both exports hand over a file', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin`)

    const csv = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export (CSV)' }).click()
    expect((await csv).suggestedFilename()).toMatch(/\.csv$/)

    const zip = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export (ZIP)' }).click()
    expect((await zip).suggestedFilename()).toMatch(/\.zip$/)
    await expectNoErrorBanner(page)
  })
})
