import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import { deleteCompetition, dragRowToRow, fetchAssignments, login, seedCompetition } from './fixtures'
import type { ApiAs } from './api'

/**
 * Dragging a lane, which is the one interaction in the app with no keyboard
 * equivalent and no unit test that can prove it end to end.
 *
 *   - same-heat reorder persists, and the heat renumbers 1..N
 *   - a cross-heat move persists, and both heats renumber
 *   - on a coarse pointer the grip is the only thing that drags
 *   - a refused reorder says so and leaves the database alone
 *
 * GSAP Draggable listens on pointer events, so the mouse.down/move/up sequence
 * in dragRowToRow drives it. `.dragTo()` dispatches HTML5 drag events and
 * would move nothing — see the note there.
 *
 * Ported from v1's e2e/heat-reorder.spec.ts. The lane maths and the assertions
 * are v1's, unchanged: this is the interaction the redesign was told to carry
 * across untouched.
 */

const SIX_ATHLETES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']

/** Six athletes over three lanes is two heats, which a cross-heat move needs. */
async function seedReorderFixture(api: ApiAs) {
  const slug = `e2e-reorder-${Date.now()}`
  const { competition, workout } = await seedCompetition(api, {
    slug,
    athletes: SIX_ATHLETES,
    lanes: 3,
    workout: { number: 1, name: 'Reorder Test', scoreType: 'time' },
  })
  return { slug, compId: competition.id, workoutId: workout.id }
}

test.describe('heat list drag-and-drop', () => {
  test('same-heat reorder persists', async ({ page }) => {
    const api = apiAs(await adminToken())
    const { slug, compId, workoutId } = await seedReorderFixture(api)

    try {
      await login(page)
      await page.goto(`/${slug}/admin/workouts/${workoutId}`)
      await expect(page.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

      const before = await fetchAssignments(api, slug, workoutId)
      const firstId = before.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)[0].id

      const rows = page.locator('tr[data-assignment-id]')
      await dragRowToRow(page, rows.nth(0), rows.nth(1))

      // Polled rather than waited on: the mutation lands at its own pace and a
      // fixed sleep is how a suite starts flaking.
      await expect.poll(async () => {
        const poll = await fetchAssignments(api, slug, workoutId)
        return poll.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)[0]?.id
      }, { timeout: 10_000 }).not.toBe(firstId)

      const after = await fetchAssignments(api, slug, workoutId)
      const heat1 = after.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
      expect(heat1.map((a) => a.lane)).toEqual(heat1.map((_, i) => i + 1))
    } finally {
      await deleteCompetition(api, compId)
    }
  })

  test('a cross-heat move renumbers both heats', async ({ page }) => {
    const api = apiAs(await adminToken())
    const { slug, compId, workoutId } = await seedReorderFixture(api)

    try {
      await login(page)
      await page.goto(`/${slug}/admin/workouts/${workoutId}`)
      await expect(page.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

      const before = await fetchAssignments(api, slug, workoutId)
      const heat1Count = before.filter((a) => a.heatNumber === 1).length
      const heat2Count = before.filter((a) => a.heatNumber === 2).length

      // Heat 1's first row onto heat 2's last row.
      const rows = page.locator('tr[data-assignment-id]')
      await dragRowToRow(page, rows.nth(0), rows.nth(heat1Count + heat2Count - 1))

      await expect.poll(async () => {
        const poll = await fetchAssignments(api, slug, workoutId)
        return poll.filter((a) => a.heatNumber === 1).length
      }, { timeout: 10_000 }).toBe(heat1Count - 1)

      const after = await fetchAssignments(api, slug, workoutId)
      const afterH1 = after.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
      const afterH2 = after.filter((a) => a.heatNumber === 2).sort((a, b) => a.lane - b.lane)
      expect(afterH2).toHaveLength(heat2Count + 1)
      expect(afterH1.map((a) => a.lane)).toEqual(afterH1.map((_, i) => i + 1))
      expect(afterH2.map((a) => a.lane)).toEqual(afterH2.map((_, i) => i + 1))
    } finally {
      await deleteCompetition(api, compId)
    }
  })

  // A coarse pointer is a thumb resting on a row it means to scroll, so there
  // the row does not drag and a grip appears that does.
  test('on a touch device the grip is what drags', async ({ browser }) => {
    const api = apiAs(await adminToken())
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const mobilePage = await mobileCtx.newPage()

    try {
      const { slug, compId, workoutId } = await seedReorderFixture(api)

      try {
        await login(mobilePage)
        await mobilePage.goto(`/${slug}/admin/workouts/${workoutId}`)
        await expect(mobilePage.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

        const handles = mobilePage.locator('[aria-label="Drag to reorder"]')
        await expect(handles.first()).toBeVisible()

        const before = await fetchAssignments(api, slug, workoutId)
        const firstId = before.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)[0].id

        const rows = mobilePage.locator('tr[data-assignment-id]')
        await dragRowToRow(mobilePage, handles.nth(0), rows.nth(1))

        await expect.poll(async () => {
          const poll = await fetchAssignments(api, slug, workoutId)
          return poll.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)[0]?.id
        }, { timeout: 10_000 }).not.toBe(firstId)

        const after = await fetchAssignments(api, slug, workoutId)
        const heat1 = after.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
        expect(heat1.map((a) => a.lane)).toEqual(heat1.map((_, i) => i + 1))
      } finally {
        await deleteCompetition(api, compId)
      }
    } finally {
      await mobileCtx.close()
    }
  })

  test('a refused reorder is reported and changes nothing', async ({ page }) => {
    const api = apiAs(await adminToken())
    const { slug, compId, workoutId } = await seedReorderFixture(api)

    try {
      await login(page)
      await page.goto(`/${slug}/admin/workouts/${workoutId}`)
      await expect(page.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

      const before = await fetchAssignments(api, slug, workoutId)

      await page.route('**/assignments/reorder*', (route) =>
        route.fulfill({ status: 500, body: 'simulated server error', contentType: 'text/plain' }))

      const rows = page.locator('tr[data-assignment-id]')
      await dragRowToRow(page, rows.nth(0), rows.nth(1))

      await expect(page.getByText(/Reorder failed/i)).toBeVisible({ timeout: 10_000 })

      const after = await fetchAssignments(api, slug, workoutId)
      const key = (a: { id: number; heatNumber: number; lane: number }) => `${a.id}:${a.heatNumber}:${a.lane}`
      expect(new Set(after.map(key))).toEqual(new Set(before.map(key)))
    } finally {
      await deleteCompetition(api, compId)
    }
  })
})
