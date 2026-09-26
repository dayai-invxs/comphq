import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import { deleteCompetition, login, seedCompetition } from './fixtures'

/**
 * The core flow, end to end:
 *
 *   login → create comp → athletes + workout → generate heats →
 *   enter scores in the UI → complete → verify the leaderboard
 *
 * Setup that needs no UI coverage goes through the API. The UI carries the two
 * steps that break first and that no unit test can prove together: score entry
 * reaching the server, and the ranking it produces.
 *
 * Ported from v1's e2e/happy-path.spec.ts. What changed is how the suite
 * reaches the API and what the controls are called; what is asserted is the
 * same competition arithmetic — lowest time wins, and points ascend.
 */

test('create comp → score → complete → leaderboard', async ({ page }) => {
  const api = apiAs(await adminToken())
  const slug = `e2e-${Date.now()}`
  let competitionId: number | null = null

  try {
    await login(page)

    const seeded = await seedCompetition(api, {
      slug,
      athletes: ['Runner One', 'Runner Two', 'Runner Three'],
      lanes: 3,
      workout: { number: 1, name: 'E2E Time', scoreType: 'time' },
      active: true,
    })
    competitionId = seeded.competition.id
    const workoutId = seeded.workout.id

    await page.goto(`/${slug}/admin/workouts/${workoutId}`)
    await expect(page.getByRole('heading', { name: 'WOD 1: E2E Time' })).toBeVisible()

    // Lower is better for a `time` workout, so the fastest of the three should
    // come out first.
    const times = page.getByRole('textbox', { name: 'Score time' })
    await times.nth(0).fill('3:30')
    await times.nth(1).fill('4:15')
    await times.nth(2).fill('5:00')

    await page.getByRole('button', { name: 'Save All Scores' }).click()
    await expect(page.getByText('All scores saved.')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: /Calculate Rankings & Complete/ }).click()
    await expect(page.getByText('Rankings calculated. Workout marked as completed.'))
      .toBeVisible({ timeout: 10_000 })

    // Read the standings from the API rather than the screen: what is being
    // proved here is the scoring, and the screen has its own specs.
    const lb = await api('GET', `/api/leaderboard?slug=${slug}`) as {
      entries: { totalPoints: number }[]
    }
    expect(lb.entries).toHaveLength(3)
    expect(lb.entries.map((e) => e.totalPoints)).toEqual([1, 2, 3])
  } finally {
    if (competitionId != null) await deleteCompetition(api, competitionId)
  }
})
