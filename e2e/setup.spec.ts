import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The setup screen beyond divisions (admin-crud.spec.ts owns those): the
 * locations and volunteer-role lists, the judge settings that gate the judge
 * screens, the TV board's per-division knobs, and the logo.
 *
 * The logo is install-global — stored against competitionId 0 — so the spec
 * uploads and removes in one test and leaves the install as it found it.
 */

// A 1x1 transparent PNG, the smallest thing the upload endpoint accepts.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('competition setup', () => {
  const slug = `setup-${Date.now()}`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `Setup ${slug}`, slug }) as Competition
    competitionId = comp.id
    // The TV section only renders knobs when a division exists.
    await call('POST', '/api/divisions', { slug, name: 'Rx', order: 1 })
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  test('locations: add, rename and delete', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    await page.getByRole('button', { name: 'Add location' }).click()
    const adding = page.getByRole('dialog', { name: 'Add location' })
    await adding.getByRole('textbox', { name: 'Location' }).fill('Floor A')
    await adding.getByRole('button', { name: 'Add location' }).click()
    await expect(page.getByText('Location added')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Floor A', { exact: true })).toBeVisible()

    await page.getByRole('row').filter({ hasText: 'Floor A' })
      .getByRole('button', { name: 'Edit' }).click()
    const editing = page.getByRole('dialog', { name: 'Floor A' })
    await editing.getByRole('textbox', { name: 'Location' }).fill('Main Floor')
    await editing.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Location saved')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('row').filter({ hasText: 'Main Floor' })
      .getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete location' }).click()
    await expect(page.getByText('Location deleted')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Main Floor', { exact: true })).toHaveCount(0)
    await expectNoErrorBanner(page)
  })

  test('volunteer roles: add, rename and delete', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    await page.getByRole('button', { name: 'Add volunteer role' }).click()
    const adding = page.getByRole('dialog', { name: 'Add volunteer role' })
    await adding.getByRole('textbox', { name: 'Role' }).fill('Scorekeeper')
    await adding.getByRole('button', { name: 'Add volunteer role' }).click()
    await expect(page.getByText('Role added')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('row').filter({ hasText: 'Scorekeeper' })
      .getByRole('button', { name: 'Edit' }).click()
    const editing = page.getByRole('dialog', { name: 'Scorekeeper' })
    await editing.getByRole('textbox', { name: 'Role' }).fill('Timer')
    await editing.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Role saved')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('row').filter({ hasText: 'Timer' })
      .getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete volunteer role' }).click()
    await expect(page.getByText('Role deleted')).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('judge settings reach the server', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    const password = page.getByRole('textbox', { name: 'Judge Screen Password' })
    await password.fill('setup-spec-pass')
    await password.blur()
    await expect(page.getByText('Setting saved')).toBeVisible({ timeout: 10_000 })

    // Read it back from the API: the toast proves the write was reported, this
    // proves it landed.
    const settings = await call('GET', `/api/settings?slug=${slug}`) as { judgePassword: string }
    expect(settings.judgePassword).toBe('setup-spec-pass')
    await expectNoErrorBanner(page)
  })

  test('tv board: a division knob saves', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    await page.getByRole('combobox', { name: 'TV position of Rx' }).selectOption({ index: 1 })
    await expect(page.getByText('Setting saved')).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('logo: upload shows the mark, remove clears it', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })
    await expect(page.getByText('Logo uploaded')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('img', { name: 'Competition logo' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByText('Logo removed')).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)
  })
})
