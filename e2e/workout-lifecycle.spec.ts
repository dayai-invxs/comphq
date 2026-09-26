import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login } from './fixtures'
import type { Competition, Workout } from './fixtures'

/**
 * A workout's whole life through the admin screens, in the order an organiser
 * lives it: settings, activation, heats, equipment, scoring heat by heat,
 * completion, the points override on the leaderboard, and the three ways back
 * down — clear, reset, delete.
 *
 * happy-path.spec.ts proves the scoring arithmetic; this spec proves the
 * controls around it. The tests share one competition and run in file order,
 * each stage leaving the state the next one starts from.
 */

test.describe('workout lifecycle', () => {
  const slug = `wod-${Date.now()}`
  let competitionId: number | null = null
  let workoutId: number
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `WodLife ${slug}`, slug }) as Competition
    competitionId = comp.id
    for (const name of ['Runner One', 'Runner Two', 'Runner Three']) {
      await call('POST', '/api/athletes', { slug, name })
    }
    await call('POST', '/api/workout-locations', { slug, name: 'Main Floor' })
    // Draft, and no assignments: generating heats is this spec's job.
    const workout = await call('POST', '/api/workouts', {
      slug,
      number: 1,
      name: 'Lifecycle',
      scoreType: 'time',
      lanes: 3,
      heatIntervalSecs: 600,
      callTimeSecs: 60,
      walkoutTimeSecs: 30,
    }) as Workout
    workoutId = workout.id
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  async function open(page: import('@playwright/test').Page) {
    await login(page)
    await page.goto(`/${slug}/admin/workouts/${workoutId}`)
    // Level-pinned: once completed, a "Leaderboard — WOD 1" h2 joins the page.
    await expect(page.getByRole('heading', { level: 1, name: /WOD 1/ })).toBeVisible({ timeout: 10_000 })
  }

  test('edit settings: rename and place the workout', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: 'Edit Settings' }).click()
    await page.getByRole('textbox', { name: 'Name' }).fill('Lifecycle WOD')
    await page.getByRole('combobox', { name: 'Location' }).selectOption({ label: 'Main Floor' })
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'WOD 1: Lifecycle WOD' })).toBeVisible()
    await expectNoErrorBanner(page)
  })

  test('activate, generate heats, unlock and regenerate', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: 'Activate' }).click()
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Generate (Random / Division Order)' }).click()
    await expect(page.getByText('Heat assignments generated.')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#heat-1')).toBeVisible()

    // Heats lock once generated; regenerating is a deliberate two-step.
    await page.getByRole('button', { name: 'Unlock to Regenerate' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Unlock' }).click()
    await page.getByRole('button', { name: 'Generate (Random / Division Order)' }).click()
    await expect(page.getByText('Heat assignments generated.')).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('equipment list: add an item, remove it', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: 'Equipment' }).click()
    await page.getByRole('textbox', { name: 'Equipment item' }).fill('Barbell')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Barbell', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Remove Barbell' }).click()
    await expect(page.getByText('Barbell', { exact: true })).toHaveCount(0, { timeout: 10_000 })
  })

  test('score a heat, complete it, reopen it', async ({ page }) => {
    await open(page)

    const heat = page.locator('#heat-1')
    const times = heat.getByRole('textbox', { name: 'Score time' })
    await times.nth(0).fill('2:10')
    await times.nth(1).fill('2:30')
    await times.nth(2).fill('2:50')

    await heat.getByRole('button', { name: 'Save Heat' }).click()
    await expect(page.getByText('Heat 1 scores saved.')).toBeVisible({ timeout: 10_000 })

    await heat.getByRole('button', { name: 'Complete Heat' }).click()
    await expect(page.getByText('Heat 1 completed. Rankings updated.')).toBeVisible({ timeout: 10_000 })

    await heat.getByRole('button', { name: 'Completed' }).click()
    await expect(page.getByText('Heat 1 reopened.')).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('complete the workout, then override a placing on the board', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: /Calculate Rankings & Complete/ }).click()
    await expect(page.getByText('Rankings calculated. Workout marked as completed.'))
      .toBeVisible({ timeout: 10_000 })

    await page.goto(`/${slug}/admin/leaderboard`)
    await page.getByRole('button', { name: 'edit WOD 1 points for Runner One' }).click()
    await page.getByRole('button', { name: 'Yes' }).click()
    await page.getByRole('spinbutton', { name: 'Points' }).fill('5')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('button', { name: 'edit WOD 1 points for Runner One' }))
      .toContainText('5', { timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('clear all scores puts the workout back to active', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: 'Clear All Scores' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear all scores' }).click()
    await expect(page.getByText('All scores cleared.')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible()
  })

  test('reset returns the workout to draft', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset workout' }).click()
    await expect(page.getByText('Workout reset. All scores cleared and heats reopened.'))
      .toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible()
  })

  test('delete removes the workout and returns to the list', async ({ page }) => {
    await open(page)

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete workout' }).click()

    await page.waitForURL(`**/${slug}/admin/workouts`, { timeout: 10_000 })
    await expect(page.getByRole('link', { name: /Lifecycle WOD/ })).toHaveCount(0)
    await expectNoErrorBanner(page)
  })
})
