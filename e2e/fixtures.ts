import { expect, type Page } from '@playwright/test'
import { adminEmail, adminPassword } from './env'
import type { ApiAs } from './api'

// The two things every spec does before it can assert anything: sign a browser
// in, and put a competition in the database to act on.

export type Competition = { id: number; slug: string }
export type Workout = { id: number; number: number; name: string }
export type Assignment = {
  id: number
  heatNumber: number
  lane: number
  athlete: { id: number; name: string }
}

/**
 * Signs in through the form, which is the only way the SPA gets a session —
 * supabase-js writes it to the page's own storage and every later request
 * carries it. Waits for `**\/admin` because a super lands on /admin and a
 * member is bounced on to /{slug}/admin; both match, and either is signed in.
 */
export async function login(
  page: Page,
  email: string = adminEmail(),
  password: string = adminPassword(),
) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  // Role, not label: getByLabel substring-matches the "Show password" toggle.
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/admin', { timeout: 10_000 })
}

/**
 * A competition with athletes, one workout and its generated heats — the
 * smallest thing the admin screens have anything to draw. Athlete count and
 * lane count decide how many heats come out: six athletes over three lanes is
 * two heats, which is what a cross-heat drag needs.
 */
export async function seedCompetition(api: ApiAs, options: {
  slug: string
  athletes: string[]
  lanes: number
  workout: { number: number; name: string; scoreType: string }
  /** A workout only accepts score edits while it is active. */
  active?: boolean
}): Promise<{ competition: Competition; workout: Workout }> {
  const { slug, athletes, lanes, workout: w, active = false } = options

  const competition = await api('POST', '/api/competitions', {
    name: `E2E ${slug}`,
    slug,
  }) as Competition

  for (const name of athletes) {
    await api('POST', '/api/athletes', { slug, name })
  }

  const workout = await api('POST', '/api/workouts', {
    slug,
    number: w.number,
    name: w.name,
    scoreType: w.scoreType,
    lanes,
    heatIntervalSecs: 600,
    callTimeSecs: 60,
    walkoutTimeSecs: 30,
  }) as Workout

  if (active) await api('PUT', `/api/workouts/${workout.id}?slug=${slug}`, { status: 'active' })
  await api('POST', `/api/workouts/${workout.id}/assignments?slug=${slug}`, {})

  return { competition, workout }
}

/**
 * Deletes cascade to divisions, athletes, workouts, assignments and scores.
 * A failure here is raised rather than swallowed: the test database is shared,
 * and a silent leak is cleaned by hand on somebody else's run.
 */
export async function deleteCompetition(api: ApiAs, id: number) {
  try {
    await api('DELETE', `/api/competitions/${id}`)
  } catch (e) {
    throw new Error(`Failed to clean up e2e competition id=${id}`, { cause: e })
  }
}

export function fetchAssignments(api: ApiAs, slug: string, workoutId: number): Promise<Assignment[]> {
  return api('GET', `/api/workouts/${workoutId}/assignments?slug=${slug}`) as Promise<Assignment[]>
}

/**
 * Drives GSAP Draggable, which listens on pointer events. Playwright's
 * `dragTo()` dispatches HTML5 drag events and would not move a lane at all.
 * The drop lands past the target row's midpoint, which inserts after it.
 */
export async function dragRowToRow(
  page: Page,
  sourceLocator: ReturnType<Page['locator']>,
  targetLocator: ReturnType<Page['locator']>,
) {
  // Raw mouse events do not auto-scroll the way click() does, and a bounding
  // box below the fold dispatches the whole drag into empty viewport — which
  // is exactly where a phone-sized viewport puts the heat table.
  await sourceLocator.scrollIntoViewIfNeeded()
  await targetLocator.scrollIntoViewIfNeeded()
  const source = await sourceLocator.boundingBox()
  const target = await targetLocator.boundingBox()
  if (!source || !target) throw new Error('Could not measure drag source/target')

  const sx = source.x + source.width / 2
  const sy = source.y + source.height / 2
  const tx = target.x + target.width / 2
  const ty = target.y + target.height * 0.8

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  // Several intermediate moves, so Draggable reads a drag rather than a click.
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / steps, sy + ((ty - sy) * i) / steps, { steps: 2 })
  }
  await page.mouse.up()
}

/** No screen in the app may report a failure the spec did not ask for. */
export async function expectNoErrorBanner(page: Page) {
  await expect(page.getByRole('alert')).toHaveCount(0)
}
