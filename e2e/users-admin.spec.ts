import { test, expect } from '@playwright/test'
import { adminEmail } from './env'
import { serviceClient } from './api'
import { login } from './fixtures'

/**
 * /admin/users — the site-wide account list, which only a super may open.
 *
 * Assumes the admin account is a super in the linked project; the roles
 * migration makes it one.
 *
 * Ported from v1's e2e/users-admin.spec.ts. v1 added a user through a form
 * that unfolded above the list and deleted through a browser confirm(); v3
 * opens a Sheet and asks in a dialog, so those steps name what they are typing
 * into and what they are confirming.
 */

const admin = serviceClient()

/** Used in the finally block, so a throwaway account is removed even when the UI step never ran. */
async function findUserId(email: string): Promise<string | null> {
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const users = data?.users ?? []
    const match = users.find((u) => u.email === email)
    if (match) return match.id
    if (users.length < 1000) return null
    page++
  }
}

test('a super sees the account list, and themselves in it', async ({ page }) => {
  await login(page)
  await page.goto('/admin/users')

  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
  await expect(page.getByText(adminEmail())).toBeVisible()
  await expect(page.getByText('super', { exact: true }).first()).toBeVisible()
})

test('a super can add an account and remove it again', async ({ page }) => {
  const testEmail = `e2e-throwaway-${Date.now()}@test.local`
  const testPassword = 'throwaway-password-12345'

  try {
    await login(page)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Add user' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add user' })
    await sheet.getByLabel(/^Email/).fill(testEmail)
    await sheet.getByLabel(/^Password/).fill(testPassword)
    // Exact, or the sheet's "Close add user" button also matches.
    await sheet.getByRole('button', { name: 'Add User', exact: true }).click()

    await expect(page.getByText(testEmail)).toBeVisible({ timeout: 10_000 })

    // Removed through the screen, which is also what proves the delete works.
    await page.getByRole('button', { name: `Delete ${testEmail}` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete user' }).click()
    // Exact, or the confirm dialog's "Delete user <email>?" text also matches.
    await expect(page.getByText(testEmail, { exact: true })).toBeHidden({ timeout: 10_000 })
  } finally {
    // Belt and braces: an assertion that failed before the delete step would
    // otherwise leave the account behind in a shared project.
    const id = await findUserId(testEmail)
    if (id) await admin.auth.admin.deleteUser(id)
  }
})
