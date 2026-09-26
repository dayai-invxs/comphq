import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The volunteers half of the people screen (athletes are admin-crud.spec.ts's).
 * Roles are seeded through the API — the setup screen owns their CRUD — so
 * this spec is about the roster: one at a time, in bulk by paste, and the
 * replace flow that hands one volunteer's duties to another.
 */

test.describe('volunteers roster', () => {
  const slug = `vols-${Date.now()}`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `Vols ${slug}`, slug }) as Competition
    competitionId = comp.id
    await call('POST', '/api/volunteer-roles', { slug, name: 'Judge' })
    await call('POST', '/api/volunteer-roles', { slug, name: 'Media' })
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  async function openVolunteers(page: import('@playwright/test').Page) {
    await login(page)
    await page.goto(`/${slug}/admin/people`)
    await page.getByRole('tab', { name: /Volunteers/ }).click()
  }

  test('add one with a role, rename and reassign, remove', async ({ page }) => {
    await openVolunteers(page)

    await page.getByRole('button', { name: 'Add volunteer' }).click()
    const adding = page.getByRole('dialog', { name: 'Add volunteer' })
    await adding.getByRole('textbox', { name: 'Name' }).fill('Val Unteer')
    await adding.getByRole('combobox', { name: 'Role' }).selectOption({ label: 'Judge' })
    await adding.getByRole('button', { name: 'Add volunteer' }).click()
    await expect(page.getByText('Val Unteer', { exact: true })).toBeVisible({ timeout: 10_000 })

    const row = page.getByRole('row').filter({ hasText: 'Val Unteer' })
    await expect(row).toContainText('Judge')

    await row.getByRole('button', { name: 'Edit' }).click()
    const editing = page.getByRole('dialog', { name: 'Val Unteer' })
    await editing.getByRole('textbox', { name: 'Name' }).fill('Val Renamed')
    await editing.getByRole('combobox', { name: 'Role' }).selectOption({ label: 'Media' })
    await editing.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Val Renamed', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('row').filter({ hasText: 'Val Renamed' })).toContainText('Media')

    const renamed = page.getByRole('row').filter({ hasText: 'Val Renamed' })
    await renamed.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove volunteer' }).click()
    await expect(page.getByText('Val Renamed')).toHaveCount(0, { timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('import many lands every pasted line with its named or default role', async ({ page }) => {
    await openVolunteers(page)

    await page.getByRole('button', { name: 'Add volunteer' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add volunteer' })
    await sheet.getByRole('radio', { name: 'Import many' }).click()
    await sheet.getByRole('combobox', { name: /Default role/ }).selectOption({ label: 'Judge' })
    await sheet.getByRole('textbox', { name: /One per line/ }).fill('Imp One\nImp Two, judge\nImp Three')
    await sheet.getByRole('button', { name: 'Import volunteers' }).click()

    for (const name of ['Imp One', 'Imp Two', 'Imp Three']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Judge')
    }
    await expectNoErrorBanner(page)
  })

  test('bulk delete removes every selected volunteer', async ({ page }) => {
    await openVolunteers(page)
    await expect(page.getByText('Imp One', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('checkbox', { name: 'Select Imp One' }).check()
    await page.getByRole('checkbox', { name: 'Select Imp Two' }).check()
    await page.getByRole('button', { name: 'Delete 2 selected' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete 2' }).click()

    await expect(page.getByText('Imp One')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByText('Imp Two')).toHaveCount(0)
    await expect(page.getByText('Imp Three', { exact: true })).toBeVisible()
    await expectNoErrorBanner(page)
  })

  test('replace hands one volunteer over to another', async ({ page }) => {
    await openVolunteers(page)
    await expect(page.getByText('Imp Three', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Add volunteer' }).click()
    const adding = page.getByRole('dialog', { name: 'Add volunteer' })
    await adding.getByRole('textbox', { name: 'Name' }).fill('Swap Target')
    await adding.getByRole('button', { name: 'Add volunteer' }).click()
    await expect(page.getByText('Swap Target', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('row').filter({ hasText: 'Imp Three' })
      .getByRole('button', { name: 'Edit' }).click()
    const editing = page.getByRole('dialog', { name: 'Imp Three' })
    await editing.getByRole('combobox', { name: /Replace Imp Three with/ })
      .selectOption({ label: 'Swap Target' })
    await editing.getByRole('button', { name: 'Replace' }).click()

    await expect(editing).toHaveCount(0, { timeout: 10_000 })
    await expectNoErrorBanner(page)
  })
})
