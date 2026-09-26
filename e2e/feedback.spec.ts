import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The feedback seam, driven from the screens: every write below either shows
 * its success toast or reports its refusal — none may land in silence, and
 * none may fail in silence.
 *
 * The bulk delete is the regression this spec exists for: the frontend sent
 * `{ ids }` where the handler's schema demands `{ slug, ids }`, so "Delete
 * selected" answered 400 on every competition. No unit test could see it —
 * the frontend suites mock the API and the backend suites are called
 * correctly — which is exactly the seam only a browser against the real
 * handlers exercises.
 */

test.describe('feedback through the screens', () => {
  const slug = `feedback-${Date.now()}`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `Feedback ${slug}`, slug }) as Competition
    competitionId = comp.id
    await call('POST', '/api/athletes', { slug, name: 'Bulk One' })
    await call('POST', '/api/athletes', { slug, name: 'Bulk Two' })
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  test('a settings toggle answers with a toast, not silence', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    await page.getByRole('switch', { name: 'Show Bib Numbers' }).click()
    await expect(page.getByText('Setting saved')).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('delete selected removes every selected athlete', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/people`)
    await expect(page.getByText('Bulk One', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('checkbox', { name: 'Select Bulk One' }).check()
    await page.getByRole('checkbox', { name: 'Select Bulk Two' }).check()
    await page.getByRole('button', { name: 'Delete 2 selected' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete 2' }).click()

    await expect(page.getByText('Bulk One')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByText('Bulk Two')).toHaveCount(0)
    await expectNoErrorBanner(page)
  })
})
