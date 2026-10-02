import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The Competition Corner import on the setup screen, against live events. The
 * browser reads the event from competitioncorner.net (Cloudflare refuses the
 * Edge Functions) and posts it, so this spec needs competitioncorner.net
 * reachable from the browser. Run it with VITE_FUNCTIONS_URL pointed at the
 * hosted functions to cover the deployed path, not only local ones.
 *
 * The heat sheets on a live event can change, so the counts are left to the
 * unit tests. What is checked here is the round trip: everything applies, and
 * a second preview of the same event finds nothing left to change.
 *
 * The browser keeps its own user agent here. The "Desktop Chrome" profile
 * claims Windows while the client hints say HeadlessChrome, and Cloudflare's
 * bot check refuses that mismatch (no CORS header, so fetch fails outright).
 */

test.use({
  userAgent: async ({ browser }, provide) => {
    const context = await browser.newContext()
    const own = await (await context.newPage()).evaluate(() => navigator.userAgent)
    await context.close()
    await provide(own)
  },
})

const EVENT = 'https://competitioncorner.net/events/19948/details'
/** A golf scramble announced before its schedule: one division, no workouts or heats. */
const UNSCHEDULED = 'https://competitioncorner.net/events/21974/details'

test.describe('Competition Corner import', () => {
  // A fresh competition per test: a preview offers to remove imported rows the
  // pasted event lacks, so one test's import would show up in the next.
  let slug: string
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeEach(async () => {
    call = apiAs(await adminToken())
    slug = `cc-${Date.now()}`
    const comp = await call('POST', '/api/competitions', { name: `CC ${slug}`, slug }) as Competition
    competitionId = comp.id
  })

  test.afterEach(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
    competitionId = null
  })

  test('imports an event, then finds nothing left to change', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    const section = page.locator('#setup-competition-corner')
    await section.getByRole('textbox', { name: 'Event link' }).fill(EVENT)
    await section.getByRole('button', { name: 'Preview changes' }).click()

    const divisions = section.getByRole('group', { name: /Divisions/ })
    await expect(divisions.getByText('Rx - Individual Women')).toBeVisible({ timeout: 30_000 })

    // A workout whose source type has no match here cannot be applied untyped.
    for (const pick of await section.getByRole('combobox', { name: /^Score type for / }).all()) {
      await pick.selectOption('time')
    }

    await section.getByRole('button', { name: /^Apply \d+ changes?$/ }).click()
    await expect(section.getByText(/^Applied \d+ changes? from Rugged Rumble/)).toBeVisible({ timeout: 30_000 })

    const names = (await call('GET', `/api/divisions?slug=${slug}`) as { name: string }[]).map((d) => d.name)
    expect(names).toContain('Rx - Individual Women')
    expect(names).toContain('Intermediate - Individual Men')

    // Re-sync: rows matched by their Competition Corner id, so nothing moved.
    await section.getByRole('button', { name: 'Preview changes' }).click()
    await expect(section.getByText(/^Already matches Rugged Rumble/)).toBeVisible({ timeout: 30_000 })
  })

  test('explains an event with no schedule yet and imports its divisions', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    const section = page.locator('#setup-competition-corner')
    await section.getByRole('textbox', { name: 'Event link' }).fill(UNSCHEDULED)
    await section.getByRole('button', { name: 'Preview changes' }).click()

    await expect(section.getByText(/only divisions can be imported/)).toBeVisible({ timeout: 30_000 })
    await expect(section.getByRole('group', { name: /Divisions/ }).getByText('Scramble Team')).toBeVisible()
    await expect(section.getByRole('group', { name: /Workouts/ })).toHaveCount(0)

    await section.getByRole('button', { name: 'Apply 1 change' }).click()
    await expect(section.getByText(/^Applied 1 change from /)).toBeVisible({ timeout: 30_000 })
    const names = (await call('GET', `/api/divisions?slug=${slug}`) as { name: string }[]).map((d) => d.name)
    expect(names).toEqual(['Scramble Team'])
  })

  test('says when the event does not exist', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    const section = page.locator('#setup-competition-corner')
    await section.getByRole('textbox', { name: 'Event link' }).fill('https://competitioncorner.net/events/99999999')
    await section.getByRole('button', { name: 'Preview changes' }).click()

    await expect(section.getByRole('alert')).toHaveText('Competition Corner has no event 99999999. Check the link.', { timeout: 30_000 })
  })
})
