import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { CompetitionUsersPage } from './CompetitionUsersPage'

const { apiGet, apiPost, apiPatch, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPatch, apiDel }))

const ME = { id: 'me-1', email: 'me@example.com', isSuper: false }
const USERS = [
  { userId: 'me-1', email: 'me@example.com', role: 'admin' },
  { userId: 'u-2', email: 'bob@example.com', role: 'user' },
  { userId: 'u-3', email: null, role: 'admin' },
]

function serve(users: unknown = USERS) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/comp-users')) return Promise.resolve(users)
    if (path === '/api/me') return Promise.resolve(ME)
    return Promise.resolve(null)
  })
}

function mount() {
  return renderRoutes(
    <Route path=":slug/admin/users" element={<CompetitionUsersPage />} />,
    ['/summer/admin/users'],
  )
}

/** Everyone on the list carries the same two controls, so one person is
    reached through the row their name is drawn in. */
async function row(name: string) {
  const named = await screen.findByText(name)
  return within(named.closest('tr') as HTMLElement)
}

const sheet = () => within(screen.getByRole('dialog', { name: 'Add user' }))

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add user' }))
}

// Field marks a required control with a star inside the label, so the
// accessible name is `Email*` rather than `Email`.
function type(label: string, value: string) {
  fireEvent.change(sheet().getByLabelText(new RegExp(`^${label}`)), { target: { value } })
}

async function fillAndAdd(email: string, password: string) {
  type('Email', email)
  type('Password', password)
  fireEvent.click(sheet().getByRole('button', { name: 'Add User' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiPost.mockResolvedValue({})
  apiPatch.mockResolvedValue({})
  apiDel.mockResolvedValue({})
})

describe('the roster', () => {
  it('reads the roster for the competition in the address', async () => {
    mount()
    await screen.findByText('bob@example.com')
    expect(apiGet).toHaveBeenCalledWith('/api/comp-users?slug=summer')
  })

  it('names a user by email, and by id when there is no email', async () => {
    mount()
    expect(await screen.findByText('u-3')).toBeInTheDocument()
  })

  it('says which role each user holds', async () => {
    mount()
    expect((await row('bob@example.com')).getByText('User')).toBeInTheDocument()
    expect((await row('me@example.com')).getByText('Admin')).toBeInTheDocument()
  })

  // Two controls per row that read only "Upgrade to Admin" and "Remove" name
  // nothing on their own, and there is one pair of them per person.
  it('says whose access each control would change', async () => {
    mount()
    const bob = await row('bob@example.com')
    expect(bob.getByRole('button', { name: 'Upgrade bob@example.com' })).toBeInTheDocument()
    expect(bob.getByRole('button', { name: 'Remove bob@example.com' })).toBeInTheDocument()
  })

  it('holds the lists place while the read is out', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // v1 answered a competition with no users with one grey sentence, which
  // says nothing about what adding one would do.
  it('says what a user is when the competition has none', async () => {
    serve([])
    mount()
    expect(await screen.findByText('No users yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add user' })).toHaveLength(2)
  })
})

describe('adding a user', () => {
  // v1 unfolded the form above the roster, so the list this screen is for sat
  // below a form nobody had asked for.
  it('opens only when asked, and leaves the roster on screen', async () => {
    mount()
    await screen.findByText('bob@example.com')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openForm()
    expect(sheet().getByLabelText(/^Email/)).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
  })

  it('adds a user with the role that was chosen', async () => {
    mount()
    await openForm()
    type('Email', 'ada@example.com')
    type('Password', 'correcthorsebattery')
    fireEvent.change(sheet().getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(sheet().getByRole('button', { name: 'Add User' }))
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/comp-users', {
        slug: 'summer',
        email: 'ada@example.com',
        password: 'correcthorsebattery',
        role: 'admin',
      }),
    )
  })

  it('adds at the lesser role unless the greater one is picked', async () => {
    mount()
    await openForm()
    await fillAndAdd('ada@example.com', 'correcthorsebattery')
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/comp-users', expect.objectContaining({ role: 'user' })),
    )
  })

  it('closes the form once the user is added', async () => {
    mount()
    await openForm()
    await fillAndAdd('ada@example.com', 'correcthorsebattery')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // The submit sits in the sheet's footer, outside the form element, so it is
  // tied back to it by name rather than by nesting.
  it('submits from the footer, which is outside the form', async () => {
    mount()
    await openForm()
    expect(sheet().getByRole('button', { name: 'Add User' })).toHaveAttribute('form', 'add-comp-user')
  })

  it('shows what the server refused and keeps the form open', async () => {
    apiPost.mockRejectedValue(new Error('Password must be at least 12 characters'))
    mount()
    await openForm()
    await fillAndAdd('ada@example.com', 'short')
    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 12 characters')
    expect(sheet().getByLabelText(/^Email/)).toHaveValue('ada@example.com')
  })

  // The refusal belongs to the values that caused it, and those are gone once
  // the sheet is shut.
  it('does not reopen under the last refusal', async () => {
    apiPost.mockRejectedValue(new Error('Password must be at least 12 characters'))
    mount()
    await openForm()
    await fillAndAdd('ada@example.com', 'short')
    await screen.findByRole('alert')
    fireEvent.click(sheet().getByRole('button', { name: 'Cancel' }))
    await openForm()
    expect(sheet().queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('changing a role', () => {
  // Handing someone the power to manage users is worth a question.
  it('asks before upgrading someone to admin', async () => {
    mount()
    fireEvent.click((await row('bob@example.com')).getByRole('button', { name: 'Upgrade bob@example.com' }))
    expect(await screen.findByText(/Upgrade bob@example.com/)).toBeInTheDocument()
    expect(apiPatch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/comp-users/u-2', { slug: 'summer', role: 'admin' }),
    )
  })

  it('lets the question be answered no', async () => {
    mount()
    fireEvent.click((await row('bob@example.com')).getByRole('button', { name: 'Upgrade bob@example.com' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText(/Upgrade bob@example.com/)).not.toBeInTheDocument())
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('asks before you take your own admin rights away', async () => {
    mount()
    fireEvent.click((await row('me@example.com')).getByRole('button', { name: 'Downgrade me@example.com' }))
    expect(await screen.findByText(/You will lose the ability to manage users/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Downgrade' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/comp-users/me-1', { slug: 'summer', role: 'user' }),
    )
  })

  // v1 asks about an upgrade and about downgrading yourself, and about nothing
  // else: taking someone else's admin away goes straight through. Ported as-is.
  it('downgrades another admin without asking, as v1 does', async () => {
    mount()
    fireEvent.click((await row('u-3')).getByRole('button', { name: 'Downgrade u-3' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/comp-users/u-3', { slug: 'summer', role: 'user' }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // A failed read is not an empty roster.
  it('says the read failed rather than pretending nobody has access', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the users')).toBeInTheDocument()
    expect(screen.queryByText('No users yet')).not.toBeInTheDocument()
  })

  // The unasked path has no dialog to report into, so the page itself says why
  // the role did not change.
  it('says why when an unasked role change is refused', async () => {
    apiPatch.mockRejectedValue(new Error('Not yours to change'))
    mount()
    fireEvent.click((await row('u-3')).getByRole('button', { name: 'Downgrade u-3' }))
    expect(await screen.findByText(/Not yours to change/)).toBeInTheDocument()
  })
})

describe('removing a user', () => {
  it('asks before removing someone from the competition', async () => {
    mount()
    fireEvent.click((await row('bob@example.com')).getByRole('button', { name: 'Remove bob@example.com' }))
    expect(await screen.findByText(/Remove bob@example.com from this competition/)).toBeInTheDocument()
    expect(apiDel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove user' }))
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/comp-users/u-2?slug=summer'))
  })

  // The route refuses this one server-side; the message is the server's, and
  // it is reported in the dialog that asked rather than anywhere else.
  it('surfaces a refused removal', async () => {
    apiDel.mockRejectedValue(new Error('Cannot remove yourself'))
    mount()
    fireEvent.click((await row('me@example.com')).getByRole('button', { name: 'Remove me@example.com' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove user' }))
    expect(await screen.findByText(/Cannot remove yourself/)).toBeInTheDocument()
  })

  it('keeps the row when the removal is refused', async () => {
    apiDel.mockRejectedValue(new Error('Cannot remove yourself'))
    mount()
    fireEvent.click((await row('me@example.com')).getByRole('button', { name: 'Remove me@example.com' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove user' }))
    await screen.findByText(/Cannot remove yourself/)
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
  })
})
