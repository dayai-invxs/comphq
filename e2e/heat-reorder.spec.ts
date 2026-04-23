import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * E2E for heat-list drag-and-drop.
 *
 * Covers:
 *   - desktop: whole-row drag, same-heat reorder persists
 *   - desktop: cross-heat move persists, source + dest both renumber 1..N
 *   - mobile: handle-only drag via coarse pointer viewport
 *
 * GSAP Draggable listens on pointer events, so Playwright's mouse.down/
 * move/up sequence drives it correctly. The `.dragTo()` helper uses HTML5
 * drag events and would NOT trigger Draggable — don't reach for it.
 *
 * Seeds a disposable competition per test and tears it down in a finally
 * block, mirroring e2e/happy-path.spec.ts.
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

type ApiAs = (method: string, path: string, body?: unknown) => Promise<unknown>

async function apiClient(page: Page, request: APIRequestContext): Promise<ApiAs> {
  const cookies = await page.context().cookies()
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  return async (method, path, body) => {
    const res = await request.fetch(path, {
      method,
      headers: { cookie, 'Content-Type': 'application/json' },
      data: body ? JSON.stringify(body) : undefined,
    })
    expect(res.ok(), `${method} ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
    const txt = await res.text()
    return txt ? JSON.parse(txt) : null
  }
}

async function seedFixture(api: ApiAs) {
  const slug = `e2e-reorder-${Date.now()}`
  const comp = await api('POST', '/api/competitions', { name: `E2E Reorder ${slug}`, slug }) as { id: number }
  // 6 athletes → 2 heats of 3 lanes.
  for (let i = 1; i <= 6; i++) {
    await api('POST', '/api/athletes', { slug, name: `R${i}` })
  }
  const workout = await api('POST', '/api/workouts', {
    slug, number: 1, name: 'Reorder Test', scoreType: 'time',
    lanes: 3, heatIntervalSecs: 300, callTimeSecs: 60, walkoutTimeSecs: 30,
  }) as { id: number }
  await api('POST', `/api/workouts/${workout.id}/assignments?slug=${slug}`, {})
  return { slug, compId: comp.id, workoutId: workout.id }
}

async function cleanup(api: ApiAs, compId: number) {
  // DON'T swallow — a silent cleanup failure leaves fixture rows in the
  // shared DB and the next run has to clean them by hand. Surface the
  // error so CI catches it instead of quietly leaking.
  try {
    await api('DELETE', `/api/competitions/${compId}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to clean up e2e competition id=${compId}: ${msg}`)
  }
}

async function dragRowToRow(page: Page, sourceLocator: ReturnType<Page['locator']>, targetLocator: ReturnType<Page['locator']>) {
  const source = await sourceLocator.boundingBox()
  const target = await targetLocator.boundingBox()
  if (!source || !target) throw new Error('Could not measure drag source/target')

  const sx = source.x + source.width / 2
  const sy = source.y + source.height / 2
  // Drop so that pointer is past the midpoint of the target row (inserts after).
  const tx = target.x + target.width / 2
  const ty = target.y + target.height * 0.8

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  // Several intermediate moves so GSAP registers a drag vs. a click.
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / steps, sy + ((ty - sy) * i) / steps, { steps: 2 })
  }
  await page.mouse.up()
}

async function fetchAssignments(api: ApiAs, slug: string, workoutId: number) {
  return api('GET', `/api/workouts/${workoutId}/assignments?slug=${slug}`) as Promise<
    Array<{ id: number; heatNumber: number; lane: number; athlete: { name: string } }>
  >
}

test.describe('heat list drag-and-drop', () => {
  test('desktop: same-heat reorder persists', async ({ page, request }) => {
    await login(page)
    const api = await apiClient(page, request)
    const { slug, compId, workoutId } = await seedFixture(api)

    try {
      await page.goto(`/${slug}/admin/workouts/${workoutId}`)
      await expect(page.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

      const before = await fetchAssignments(api, slug, workoutId)
      const firstId = before.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)[0].id

      const rows = page.locator('tr[data-assignment-id]')
      await dragRowToRow(page, rows.nth(0), rows.nth(1))

      // Poll until the originally-first row is no longer at lane 1 in heat 1.
      await expect.poll(
        async () => {
          const poll = await fetchAssignments(api, slug, workoutId)
          const h1 = poll.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
          return h1[0]?.id
        },
        { timeout: 10_000 },
      ).not.toBe(firstId)

      const after = await fetchAssignments(api, slug, workoutId)
      const heat1 = after.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
      expect(heat1.map((a) => a.lane)).toEqual(heat1.map((_, i) => i + 1))
    } finally {
      await cleanup(api, compId)
    }
  })

  test('desktop: cross-heat move renumbers source + dest', async ({ page, request }) => {
    await login(page)
    const api = await apiClient(page, request)
    const { slug, compId, workoutId } = await seedFixture(api)

    try {
      await page.goto(`/${slug}/admin/workouts/${workoutId}`)
      await expect(page.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

      const before = await fetchAssignments(api, slug, workoutId)
      const heat1Count = before.filter((a) => a.heatNumber === 1).length
      const heat2Count = before.filter((a) => a.heatNumber === 2).length

      const rows = page.locator('tr[data-assignment-id]')
      // Drag heat1's first row onto heat2's last row.
      // With 3 lanes per heat, heat2's rows are indices 3..5.
      await dragRowToRow(page, rows.nth(0), rows.nth(heat1Count + heat2Count - 1))

      // Poll the server until the reorder has landed instead of a fixed wait
      // — the mutation completes at its own pace and fixed sleeps flake.
      await expect.poll(
        async () => {
          const poll = await fetchAssignments(api, slug, workoutId)
          return poll.filter((a) => a.heatNumber === 1).length
        },
        { timeout: 10_000 },
      ).toBe(heat1Count - 1)

      const after = await fetchAssignments(api, slug, workoutId)
      const afterH1 = after.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
      const afterH2 = after.filter((a) => a.heatNumber === 2).sort((a, b) => a.lane - b.lane)
      expect(afterH2).toHaveLength(heat2Count + 1)
      expect(afterH1.map((a) => a.lane)).toEqual(afterH1.map((_, i) => i + 1))
      expect(afterH2.map((a) => a.lane)).toEqual(afterH2.map((_, i) => i + 1))
    } finally {
      await cleanup(api, compId)
    }
  })

  // Emulate a coarse-pointer device via CDP so matchMedia('(pointer: coarse)')
  // returns true and the grip handle renders.
  test('mobile: drag via handle only', async ({ request, browser }) => {
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    })
    const mobilePage = await mobileCtx.newPage()
    try {
      await login(mobilePage)
      const api = await apiClient(mobilePage, request)
      const { slug, compId, workoutId } = await seedFixture(api)

      try {
        await mobilePage.goto(`/${slug}/admin/workouts/${workoutId}`)
        await expect(mobilePage.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

        const handles = mobilePage.locator('[aria-label="Drag to reorder"]')
        await expect(handles.first()).toBeVisible()

        const before = await fetchAssignments(api, slug, workoutId)
        const firstId = before.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)[0].id

        const rows = mobilePage.locator('tr[data-assignment-id]')
        const source = handles.nth(0)
        await dragRowToRow(mobilePage, source, rows.nth(1))

        await expect.poll(
          async () => {
            const poll = await fetchAssignments(api, slug, workoutId)
            const h1 = poll.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
            return h1[0]?.id
          },
          { timeout: 10_000 },
        ).not.toBe(firstId)

        const after = await fetchAssignments(api, slug, workoutId)
        const heat1 = after.filter((a) => a.heatNumber === 1).sort((a, b) => a.lane - b.lane)
        expect(heat1.map((a) => a.lane)).toEqual(heat1.map((_, i) => i + 1))
      } finally {
        await cleanup(api, compId)
      }
    } finally {
      await mobileCtx.close()
    }
  })

  test('desktop: failed reorder surfaces error banner and does not change order', async ({ page, request }) => {
    await login(page)
    const api = await apiClient(page, request)
    const { slug, compId, workoutId } = await seedFixture(api)

    try {
      await page.goto(`/${slug}/admin/workouts/${workoutId}`)
      await expect(page.getByRole('heading', { name: /WOD 1:/ })).toBeVisible()

      const before = await fetchAssignments(api, slug, workoutId)

      // Intercept the reorder PUT and force a 500 so we exercise the error path.
      await page.route('**/assignments/reorder*', (route) =>
        route.fulfill({ status: 500, body: 'simulated server error', contentType: 'text/plain' }),
      )

      const rows = page.locator('tr[data-assignment-id]')
      await dragRowToRow(page, rows.nth(0), rows.nth(1))

      await expect(page.getByText(/Reorder failed/i)).toBeVisible({ timeout: 10_000 })

      // DB state must be unchanged (same ids, same heat/lane as before).
      const after = await fetchAssignments(api, slug, workoutId)
      const key = (a: { id: number; heatNumber: number; lane: number }) => `${a.id}:${a.heatNumber}:${a.lane}`
      expect(new Set(after.map(key))).toEqual(new Set(before.map(key)))
    } finally {
      await cleanup(api, compId)
    }
  })
})
