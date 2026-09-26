import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The competition-users screen: the accounts an organiser hands to their crew.
 * users-admin.spec.ts covers the site-wide account list; this is the per-
 * competition membership — add, promote, demote, remove.
 *
 * Adding a user here creates a real auth account, and removing them from the
 * competition does not delete it — so the spec deletes the account through the
 * site-users API afterwards, or every run leaves one behind.
 */

test.describe('competition users', () => {
  const slug = `cu-${Date.now()}`
  const email = `e2e-cu-${Date.now()}@test.local`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `CompUsers ${slug}`, slug }) as Competition
    competitionId = comp.id
  })

  test.afterAll(async () => {
    const users = await call('GET', '/api/users') as { id: string; email: string }[]
    const created = users.find((u) => u.email === email)
    if (created) await call('DELETE', `/api/users/${created.id}`)
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  test('add a user, promote, demote and remove them', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/users`)

    await page.getByRole('button', { name: 'Add user' }).first().click()
    const adding = page.getByRole('dialog', { name: 'Add user' })
    await adding.getByRole('textbox', { name: 'Email' }).fill(email)
    await adding.getByRole('textbox', { name: 'Password' }).fill('crew-pass-e2e-123')
    // Exact: the sheet's close button is "Close add user", which substring-matches.
    await adding.getByRole('button', { name: 'Add User', exact: true }).click()
    await expect(page.getByText('User added')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(email)).toBeVisible()

    await page.getByRole('button', { name: `Upgrade ${email}` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Upgrade' }).click()
    await expect(page.getByText('Role changed')).toBeVisible({ timeout: 10_000 })
    // The button flipping to the demote label is the visible proof the row is
    // an admin now.
    const demote = page.getByRole('button', { name: `Downgrade ${email}` })
    await expect(demote).toBeVisible()

    // Demoting someone else asks for no confirmation — the dialog is reserved
    // for promotions and for demoting yourself.
    await demote.click()
    await expect(page.getByRole('button', { name: `Upgrade ${email}` })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: `Remove ${email}` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove user' }).click()
    await expect(page.getByText('User removed')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(email)).toHaveCount(0)
    await expectNoErrorBanner(page)
  })
})
