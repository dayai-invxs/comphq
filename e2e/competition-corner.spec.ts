import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The Competition Corner import on the setup screen, against the live event
 * the unit tests hold a snapshot of (19948). The Edge Function fetches the
 * event server side, so nothing here can be routed in the browser: this is
 * the one spec that needs competitioncorner.net reachable.
 *
 * The heat sheets on a live event can change, so the counts are left to the
 * unit tests. What is checked here is the round trip: everything applies, and
 * a second preview of the same event finds nothing left to change.
 */

const EVENT = 'https://competitioncorner.net/events/19948/details'

test.describe('Competition Corner import', () => {
  const slug = `cc-${Date.now()}`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `CC ${slug}`, slug }) as Competition
    competitionId = comp.id
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
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
})
