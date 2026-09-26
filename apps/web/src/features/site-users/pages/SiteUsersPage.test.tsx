import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { renderRoutes } from '@/test/harness'
import { SiteUsersPage } from './SiteUsersPage'

const { apiGet, apiPost, apiPatch, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPatch, apiDel }))

const COMPS = [
  { id: 4, name: 'Summer Throwdown', slug: 'summer' },
  { id: 9, name: 'Rugged Rumble', slug: 'rugged' },
]

const USERS = [
  { id: 'u-1', email: 'ada@example.com', isSuper: true, competitions: [] },
  { id: 'u-2', email: 'bob@example.com', isSuper: false, competitions: [COMPS[0]] },
  { id: 'u-3', email: null, isSuper: false, competitions: [] },
]

function serve(users: unknown = USERS) {
  apiGet.mockImplementation((path: string) => {
    if (path === '/api/users') return Promise.resolve(users)
    if (path === '/api/competitions') return Promise.resolve(COMPS)
    return Promise.resolve(null)
  })
}

function mount() {
  return renderRoutes(<Route path="/admin/users" element={<SiteUsersPage />} />, ['/admin/users'])
}

/** Every account carries the same three controls, so one is reached through
    the row its name is drawn in. */
async function row(name: string) {
  const named = await screen.findByText(name)
  return within(named.closest('tr') as HTMLElement)
}

const addSheet = () => within(screen.getByRole('dialog', { name: 'Add user' }))
const editSheet = () => within(screen.getByRole('dialog', { name: 'Edit access' }))

async function openAdd() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add user' }))
  return addSheet()
}

async function openEdit(name: string, handle: string) {
  fireEvent.click((await row(name)).getByRole('button', { name: `Edit ${handle}` }))
  return editSheet()
}

// Field marks a required control with a star inside the label, so the
// accessible name is `Email*` rather than `Email`.
function type(scope: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(scope.getByLabelText(new RegExp(`^${label}`)), { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiPost.mockResolvedValue({ ok: true })
  apiPatch.mockResolvedValue({ ok: true })
  apiDel.mockResolvedValue({ ok: true })
})

describe('the roster', () => {
  it('names every account, and says so when one has no email', async () => {
    mount()
    await screen.findByText('ada@example.com')
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    expect(screen.getByText('(no email)')).toBeInTheDocument()
  })

  it('marks a super admin, whose access is every competition', async () => {
    mount()
    const ada = await row('ada@example.com')
    expect(ada.getByText('super')).toBeInTheDocument()
    expect(ada.getByText('all competitions')).toBeInTheDocument()
  })

  it('lists the competitions a member may administer', async () => {
    mount()
    expect((await row('bob@example.com')).getByText('Summer Throwdown')).toBeInTheDocument()
  })

  it('says when an account can administer nothing', async () => {
    mount()
    expect((await row('(no email)')).getByText('no competition access')).toBeInTheDocument()
  })

  // Three controls per row that read Reset pw, Edit and Delete name nothing on
  // their own, and there is a set of them per account.
  it('says which account each control acts on', async () => {
    mount()
    const bob = await row('bob@example.com')
    expect(bob.getByRole('button', { name: 'Edit bob@example.com' })).toBeInTheDocument()
    expect(bob.getByRole('button', { name: 'Delete bob@example.com' })).toBeInTheDocument()
    expect(bob.getByRole('button', { name: 'Reset password for bob@example.com' })).toBeInTheDocument()
  })

  it('holds the lists place while the read is out', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // The whole resource is behind requireSiteAdmin, so the first read is also
  // the access check.
  it('says a refusal is about being a super admin, not a broken page', async () => {
    apiGet.mockRejectedValue(new HttpError(403, 'Forbidden'))
    mount()
    await screen.findByText('Super-admin access required')
    expect(screen.getByRole('link', { name: '← Back to admin' })).toHaveAttribute('href', '/admin')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows any other failure as itself', async () => {
    apiGet.mockRejectedValue(new HttpError(500, 'Database is down'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is down')
  })
})

describe('adding an account', () => {
  // v1 unfolded the form above the roster, so the list this screen is for sat
  // below a form nobody had asked for.
  it('opens only when asked, and leaves the roster on screen', async () => {
    mount()
    await screen.findByText('bob@example.com')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openAdd()
    expect(addSheet().getByLabelText(/^Email/)).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
  })

  // v1's rule, kept: the server rejects anything shorter, so the button says
  // so before the round trip.
  it('will not submit without an email and twelve characters of password', async () => {
    mount()
    const form = await openAdd()
    const submit = () => addSheet().getByRole('button', { name: 'Add User' })
    expect(submit()).toBeDisabled()
    type(form, 'Email', 'new@example.com')
    type(form, 'Password', 'short')
    expect(submit()).toBeDisabled()
    type(form, 'Password', 'twelve-chars')
    expect(submit()).toBeEnabled()
  })

  it('drops the competition picker when the account is to be a super admin', async () => {
    mount()
    const form = await openAdd()
    expect(form.getByLabelText('Summer Throwdown (summer)')).toBeInTheDocument()
    fireEvent.click(form.getByLabelText(/^Super admin/))
    expect(addSheet().queryByLabelText('Summer Throwdown (summer)')).not.toBeInTheDocument()
  })

  it('sends the ticked competitions with the new account', async () => {
    mount()
    const form = await openAdd()
    type(form, 'Email', '  new@example.com  ')
    type(form, 'Password', 'twelve-chars')
    fireEvent.click(addSheet().getByLabelText('Rugged Rumble (rugged)'))
    fireEvent.click(addSheet().getByRole('button', { name: 'Add User' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/users', {
      email: 'new@example.com', password: 'twelve-chars', isSuper: false, competitionIds: [9],
    }))
  })

  // The submit sits in the sheet's footer, outside the form element, so it is
  // tied back to it by name rather than by nesting.
  it('submits from the footer, which is outside the form', async () => {
    mount()
    await openAdd()
    expect(addSheet().getByRole('button', { name: 'Add User' })).toHaveAttribute('form', 'add-user')
  })

  it('closes the form once the account exists', async () => {
    mount()
    const form = await openAdd()
    type(form, 'Email', 'new@example.com')
    type(form, 'Password', 'twelve-chars')
    fireEvent.click(addSheet().getByRole('button', { name: 'Add User' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the form open and says why when the server refuses', async () => {
    apiPost.mockRejectedValue(new Error('Email already registered'))
    mount()
    const form = await openAdd()
    type(form, 'Email', 'ada@example.com')
    type(form, 'Password', 'twelve-chars')
    fireEvent.click(addSheet().getByRole('button', { name: 'Add User' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')
    expect(addSheet().getByLabelText(/^Email/)).toHaveValue('ada@example.com')
  })

  // The refusal belongs to the values that caused it, and those are gone once
  // the sheet is shut.
  it('does not reopen under the last refusal', async () => {
    apiPost.mockRejectedValue(new Error('Email already registered'))
    mount()
    const form = await openAdd()
    type(form, 'Email', 'ada@example.com')
    type(form, 'Password', 'twelve-chars')
    fireEvent.click(addSheet().getByRole('button', { name: 'Add User' }))
    await screen.findByRole('alert')
    fireEvent.click(addSheet().getByRole('button', { name: 'Cancel' }))
    await openAdd()
    expect(addSheet().queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('editing an account', () => {
  it('opens with the access the account already has', async () => {
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    expect(edit.getByLabelText('Summer Throwdown (summer)')).toBeChecked()
    expect(edit.getByLabelText('Rugged Rumble (rugged)')).not.toBeChecked()
  })

  // v1 opened the editor inside the row, pushing every account below it down
  // the page. The list is what the screen is for, so it stays where it was.
  it('names the account being edited, and keeps the roster on screen', async () => {
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    expect(edit.getByText('bob@example.com')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  // PATCH replaces the set, so what is sent is what the account keeps.
  it('sends every competition that is still ticked, not the change', async () => {
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    fireEvent.click(edit.getByLabelText('Rugged Rumble (rugged)'))
    fireEvent.click(editSheet().getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/api/users/u-2', {
      isSuper: false, competitionIds: [4, 9],
    }))
  })

  it('sends no competitions for an account being made super', async () => {
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    fireEvent.click(edit.getByLabelText('Super admin'))
    fireEvent.click(editSheet().getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/api/users/u-2', {
      isSuper: true, competitionIds: [],
    }))
  })

  it('closes once the change is saved', async () => {
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    fireEvent.click(edit.getByLabelText('Rugged Rumble (rugged)'))
    fireEvent.click(editSheet().getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('leaves without saving when it is dismissed', async () => {
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    fireEvent.click(edit.getByLabelText('Rugged Rumble (rugged)'))
    fireEvent.click(editSheet().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('says what the server refused, in the sheet that asked', async () => {
    apiPatch.mockRejectedValue(new Error('Cannot demote the last super admin'))
    mount()
    const edit = await openEdit('bob@example.com', 'bob@example.com')
    fireEvent.click(edit.getByLabelText('Super admin'))
    fireEvent.click(editSheet().getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot demote the last super admin')
    expect(editSheet().getByLabelText('Super admin')).toBeChecked()
  })

  // An account with no email is still an account, and the id is the only
  // handle it has.
  it('edits an account that has no email', async () => {
    mount()
    const edit = await openEdit('(no email)', 'u-3')
    expect(edit.getByLabelText('Super admin')).not.toBeChecked()
  })
})

describe('the row actions', () => {
  it('asks before deleting, then deletes by id', async () => {
    mount()
    fireEvent.click((await row('bob@example.com')).getByRole('button', { name: 'Delete bob@example.com' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/bob@example.com/)).toBeInTheDocument()
    expect(apiDel).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }))
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/users/u-2'))
  })

  // v1 acknowledged the mail with window.alert. The message is the same; it
  // no longer blocks the page to say it.
  it('mails a reset link and says where it went', async () => {
    mount()
    fireEvent.click((await row('bob@example.com')).getByRole('button', { name: 'Reset password for bob@example.com' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/users/u-2/reset-password', {}))
    expect(await screen.findByText('Password reset email sent to bob@example.com.')).toBeInTheDocument()
  })

  // v1 returned early on an account with no email; the server would have
  // nowhere to send it either.
  it('offers no reset for an account with no email', async () => {
    mount()
    expect((await row('(no email)')).queryByRole('button', { name: /^Reset password/ }))
      .not.toBeInTheDocument()
  })

  it('says so when the reset mail could not be sent', async () => {
    apiPost.mockRejectedValue(new Error('Mailer is down'))
    mount()
    fireEvent.click((await row('bob@example.com')).getByRole('button', { name: 'Reset password for bob@example.com' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mailer is down')
  })
})
