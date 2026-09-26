import { test, expect } from '@playwright/test'
import { adminToken, apiAs } from './api'
import type { ApiAs } from './api'
import { deleteCompetition, expectNoErrorBanner, login } from './fixtures'
import type { Competition } from './fixtures'

/**
 * The admin screens driven the way an organiser drives them, which is the half
 * happy-path.spec.ts seeds past. This is where a write that lost its slug, or
 * a form that clears itself whether or not the write landed, shows up.
 *
 * Ported from v1's e2e/admin-crud.spec.ts, and two of its three addresses have
 * moved: v1 kept athletes and divisions on their own pages, and v3 serves them
 * from /{slug}/admin/people and /{slug}/admin/setup — which is the route table
 * v1 itself ended on, not a v3 invention.
 *
 * A row is no longer a form either. Both screens open a Sheet beside the list,
 * so every step below names the dialog it is typing into.
 */

test.describe('admin CRUD through the screens', () => {
  const slug = `crud-${Date.now()}`
  let competitionId: number | null = null
  let call: ApiAs

  test.beforeAll(async () => {
    call = apiAs(await adminToken())
    const comp = await call('POST', '/api/competitions', { name: `CRUD ${slug}`, slug }) as Competition
    competitionId = comp.id
  })

  test.afterAll(async () => {
    if (competitionId != null) await deleteCompetition(call, competitionId)
  })

  test('athletes: add, rename and remove', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/people`)

    await page.getByRole('button', { name: 'Add athlete' }).click()
    const adding = page.getByRole('dialog', { name: 'Add athlete' })
    // Inputs are located by role, not label: MDS Field appends an aria-hidden
    // "*" to a required label ("Name*"), and Sheet's close button carries an
    // aria-label ("Close division") that getByLabel substring-matches too.
    await adding.getByRole('textbox', { name: 'Name' }).fill('Bugsy Testuser')
    await adding.getByRole('textbox', { name: 'Bib #' }).fill('777')
    await adding.getByRole('button', { name: 'Add athlete' }).click()
    // Exact, or the row checkbox's hidden "Select Bugsy Testuser" label also matches.
    await expect(page.getByText('Bugsy Testuser', { exact: true })).toBeVisible({ timeout: 10_000 })

    // The rename is the regression this spec exists for: v1's PUT dropped the
    // slug and answered 404, and the row went back to its old name in silence.
    const row = page.getByRole('row').filter({ hasText: 'Bugsy Testuser' })
    await row.getByRole('button', { name: 'Edit' }).click()
    const editing = page.getByRole('dialog', { name: 'Bugsy Testuser' })
    await editing.getByRole('textbox', { name: 'Name' }).fill('Bugsy Renamed')
    await editing.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Bugsy Renamed', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expectNoErrorBanner(page)

    const renamed = page.getByRole('row').filter({ hasText: 'Bugsy Renamed' })
    await renamed.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove athlete' }).click()
    await expect(page.getByText('Bugsy Renamed')).toHaveCount(0, { timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('divisions: add, rename and delete', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/setup`)

    // Locations and roles keep the same shape on this page, so every step is
    // scoped to the divisions section rather than to the first Edit it finds.
    const divisions = page.locator('#setup-divisions')

    await divisions.getByRole('button', { name: 'Add division' }).click()
    const adding = page.getByRole('dialog', { name: 'Add division' })
    await adding.getByRole('textbox', { name: 'Division' }).fill('BugDivision')
    await adding.getByRole('button', { name: 'Add division' }).click()
    await expect(divisions.getByText('BugDivision')).toBeVisible({ timeout: 10_000 })

    await divisions.getByRole('row').filter({ hasText: 'BugDivision' })
      .getByRole('button', { name: 'Edit' }).click()
    const editing = page.getByRole('dialog', { name: 'BugDivision' })
    await editing.getByRole('textbox', { name: 'Division' }).fill('BugDivRenamed')
    await editing.getByRole('button', { name: 'Save' }).click()
    await expect(divisions.getByText('BugDivRenamed')).toBeVisible({ timeout: 10_000 })

    await divisions.getByRole('row').filter({ hasText: 'BugDivRenamed' })
      .getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete division' }).click()
    await expect(divisions.getByText('BugDivRenamed')).toHaveCount(0, { timeout: 10_000 })
    await expectNoErrorBanner(page)
  })

  test('workouts: a duplicate number is reported, not swallowed', async ({ page }) => {
    await login(page)
    await page.goto(`/${slug}/admin/workouts`)

    await page.getByRole('button', { name: 'Add workout' }).click()
    const form = page.getByRole('dialog', { name: 'Add workout' })
    await form.getByRole('spinbutton', { name: 'Workout #' }).fill('42')
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill('DupTest A')
    await form.getByRole('button', { name: 'Create Workout' }).click()
    await expect(page.getByRole('link', { name: /WOD 42: DupTest A/ })).toBeVisible({ timeout: 10_000 })

    // The same number again: a 409 the screen has to read out, rather than a
    // second workout or a form that appears to have done nothing.
    await page.getByRole('button', { name: 'Add workout' }).click()
    await form.getByRole('spinbutton', { name: 'Workout #' }).fill('42')
    await form.getByRole('textbox', { name: 'Name', exact: true }).fill('DupTest B')
    await form.getByRole('button', { name: 'Create Workout' }).click()

    // Scoped to the form: the failure is reported twice on purpose — a global
    // toast (also role=alert) fires for every unhandled mutation failure, and
    // the dialog holds its own copy where the number being retyped is.
    const banner = form.getByRole('alert')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await expect(banner).toContainText(/number 42 already exists/i)
    await expect(page.getByRole('link', { name: /DupTest B/ })).toHaveCount(0)
  })
})
