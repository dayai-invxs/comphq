import { test, expect, type Page } from '@playwright/test'

/**
 * /admin/users page — super-admin flows.
 *
 * Assumes admin@test.local is configured as a super in the linked Supabase
 * project (which the roles_v2 migration sets up automatically from the
 * prior admin@test.local user).
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

test('super admin can open /admin/users and see themselves listed', async ({ page }) => {
  await login(page)
  await page.goto('/admin/users')

  // Heading renders for super admins (non-supers see "access required" instead).
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()

  // The logged-in super admin should appear in the user list with a "super" badge.
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible()
  await expect(page.getByText('super', { exact: true }).first()).toBeVisible()
})

test('super admin can add and then remove a throwaway user', async ({ page }) => {
  await login(page)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()

  const testEmail = `e2e-throwaway-${Date.now()}@test.local`
  const testPassword = 'throwaway-password-12345'

  // Open the add-user form.
  await page.getByRole('button', { name: 'Add User', exact: true }).click()

  // Fill + submit.
  await page.getByLabel('Email').fill(testEmail)
  await page.getByLabel('Password (12+ chars)').fill(testPassword)
  await page.getByRole('button', { name: 'Add User' }).last().click()

  // Wait for the new user row to appear.
  await expect(page.getByText(testEmail)).toBeVisible({ timeout: 10_000 })

  // Clean up: delete the test user. Accept the confirm dialog.
  page.once('dialog', (d) => d.accept())
  // The per-row container has border-b; scope the Delete click to the row
  // whose first child span contains the test email.
  const userRow = page.locator('div.border-b', { has: page.getByText(testEmail, { exact: true }) })
  await userRow.getByRole('button', { name: 'Delete' }).click()

  // Row disappears.
  await expect(page.getByText(testEmail)).toBeHidden({ timeout: 10_000 })
})
