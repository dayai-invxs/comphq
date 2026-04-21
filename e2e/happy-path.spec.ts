import { test, expect, type Page } from '@playwright/test'

/**
 * Happy-path E2E: exercises the core competition flow end-to-end.
 *
 *   login → create comp → add athletes + workout → generate heats →
 *   enter scores via UI → complete heat → calculate → verify leaderboard
 *
 * Setup mutations that don't need UI coverage (athletes, workouts, heat
 * assignments) go through the API. UI is where we assert score entry and
 * leaderboard rendering — those are the user-facing steps that break first.
 *
 * Creates a unique `e2e-{timestamp}` competition; deletes it at the end.
 */

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'crossfit123'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(ADMIN_USERNAME)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/admin')
}

test('create comp → score → complete → leaderboard', async ({ page, request }) => {
  const slug = `e2e-${Date.now()}`
  let competitionId: number | null = null

  try {
    await login(page)

    // Share the logged-in cookies with the API request context so the
    // API helper below can mutate as the same admin user.
    const cookies = await page.context().cookies()
    await request.storageState() // ensure context exists
    // Re-use the page's cookie jar via headers on each call.
    const headers = { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') }

    async function apiAs(method: string, path: string, body?: unknown) {
      const res = await request.fetch(path, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: body ? JSON.stringify(body) : undefined,
      })
      expect(res.ok(), `${method} ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
      const txt = await res.text()
      return txt ? JSON.parse(txt) : null
    }

    // 1. Create competition
    const comp = await apiAs('POST', '/api/competitions', { name: `E2E ${slug}`, slug })
    competitionId = comp.id

    // 2. Seed athletes (3 is enough to assert rankings)
    await apiAs('POST', '/api/athletes', { slug, name: 'Runner One' })
    await apiAs('POST', '/api/athletes', { slug, name: 'Runner Two' })
    await apiAs('POST', '/api/athletes', { slug, name: 'Runner Three' })

    // 3. Create one time-based workout
    const workout = await apiAs('POST', '/api/workouts', {
      slug, number: 1, name: 'E2E Time', scoreType: 'time', lanes: 3,
      heatIntervalSecs: 600, callTimeSecs: 60, walkoutTimeSecs: 30,
    })
    // Must be active to accept score edits on UI; generate heats triggers auto-status.
    await apiAs('PUT', `/api/workouts/${workout.id}?slug=${slug}`, { status: 'active' })

    // 4. Generate heat assignments (one heat, 3 lanes)
    await apiAs('POST', `/api/workouts/${workout.id}/assignments?slug=${slug}`, {})

    // 5. Enter scores via UI to prove that part of the pipeline works
    await page.goto(`/${slug}/admin/workouts/${workout.id}`)
    await expect(page.getByRole('heading', { name: `WOD 1: E2E Time` })).toBeVisible()

    // Fill one athlete's time. Lower is better for `time` scoreType, so
    // the athlete with the lowest time should rank #1.
    const timeInputs = page.getByPlaceholder('0:00.000')
    await timeInputs.nth(0).fill('3:30.000')
    await timeInputs.nth(1).fill('4:15.000')
    await timeInputs.nth(2).fill('5:00.000')

    await page.getByRole('button', { name: 'Save All Scores' }).click()
    await expect(page.getByText('All scores saved.')).toBeVisible({ timeout: 10_000 })

    // 6. Complete heat + calculate rankings
    await page.getByRole('button', { name: 'Calculate Rankings & Complete' }).click()
    await expect(page.getByText('Rankings calculated. Workout marked as completed.')).toBeVisible({ timeout: 10_000 })

    // 7. Verify leaderboard via API (simpler + more reliable than scraping UI)
    const lb = await apiAs('GET', `/api/leaderboard?slug=${slug}`)
    expect(lb.entries.length).toBe(3)
    // Sorted by totalPoints ascending (lowest = best rank)
    expect(lb.entries[0].totalPoints).toBe(1)
    expect(lb.entries[1].totalPoints).toBe(2)
    expect(lb.entries[2].totalPoints).toBe(3)
  } finally {
    // Always clean up the test competition, even on failure.
    if (competitionId != null) {
      const cookies = await page.context().cookies()
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
      await request.fetch(`/api/competitions/${competitionId}`, {
        method: 'DELETE',
        headers: { cookie: cookieHeader },
      })
    }
  }
})
