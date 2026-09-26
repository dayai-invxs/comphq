import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { AdminHomePage } from './AdminHomePage'

const { apiGet, apiPost, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiDel }))

const COMPS = [
  { id: 4, name: 'Summer Throwdown', slug: 'summer' },
  { id: 9, name: 'Rugged Rumble 2026', slug: 'rugged-rumble-2026' },
]

function mount() {
  return renderRoutes(<Route path="/admin" element={<AdminHomePage />} />, ['/admin'])
}

/** Every competition carries the same three controls, so one is reached
    through the row its name is drawn in. */
async function row(name: string) {
  const named = await screen.findByText(name)
  return within(named.closest('tr') as HTMLElement)
}

const sheet = () => within(screen.getByRole('dialog', { name: 'New competition' }))

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'New competition' }))
}

// Field marks a required control with a star inside the label, so the
// accessible name is `URL Slug*` rather than `URL Slug`.
function type(label: string, value: string) {
  fireEvent.change(sheet().getByLabelText(new RegExp(`^${label}`)), { target: { value } })
}

function field(label: string) {
  return sheet().getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement
}

const create = () => fireEvent.click(sheet().getByRole('button', { name: 'Create Competition' }))

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue(COMPS)
  apiPost.mockResolvedValue({ id: 12, name: 'New One', slug: 'new-one' })
  apiDel.mockResolvedValue(undefined)
})

describe('the list', () => {
  it('names every competition the site has', async () => {
    mount()
    await screen.findByText('Summer Throwdown')
    expect(screen.getByText('Rugged Rumble 2026')).toBeInTheDocument()
  })

  it('leads to the admin side, and to the public side separately', async () => {
    mount()
    const r = await row('Summer Throwdown')
    expect(r.getByRole('link', { name: 'Summer Throwdown' })).toHaveAttribute('href', '/summer/admin')
    expect(r.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/summer/admin')
    expect(r.getByRole('link', { name: 'Competition Schedule' })).toHaveAttribute('href', '/summer')
  })

  it('shows the slug, which is the address people are given', async () => {
    mount()
    expect((await row('Summer Throwdown')).getByText('/summer')).toBeInTheDocument()
  })

  // A delete control that reads only "Delete" is one of two on this screen and
  // names nothing on its own.
  it('names the competition each delete would remove', async () => {
    mount()
    expect((await row('Summer Throwdown')).getByRole('button', { name: 'Delete Summer Throwdown' }))
      .toBeInTheDocument()
  })

  it('holds the lists place while the read is out', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // v1 drew nothing at all where the list would be, so a first visit looked
  // like a screen that had failed to load.
  it('says what a competition is when the site has none', async () => {
    apiGet.mockResolvedValue([])
    mount()
    expect(await screen.findByText('No competitions yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New competition' })).toHaveLength(2)
  })

  // A failed read is not an empty install.
  it('says the read failed rather than pretending the site has none', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the competitions')).toBeInTheDocument()
    expect(screen.queryByText('No competitions yet')).not.toBeInTheDocument()
  })
})

describe('the new competition form', () => {
  // v1 drew the form open under the list, so the list this screen is for sat
  // above a form nobody had asked for.
  it('opens only when asked, and leaves the list on screen', async () => {
    mount()
    await screen.findByText('Summer Throwdown')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openForm()
    expect(sheet().getByLabelText(/^Competition Name/)).toBeInTheDocument()
    expect(screen.getByText('Summer Throwdown')).toBeInTheDocument()
  })

  it('derives the slug from the name as it is typed', async () => {
    mount()
    await openForm()
    type('Competition Name', '  Rugged Rumble 2026! ')
    expect(field('URL Slug').value).toBe('rugged-rumble-2026')
  })

  // v1 rewrites the slug on every keystroke in the name, hand-edit or not.
  // Ported as-is: the name is typed before the slug is corrected, so the
  // overwrite is invisible in practice.
  it('overwrites a hand-edited slug when the name changes again, as v1 does', async () => {
    mount()
    await openForm()
    type('Competition Name', 'Summer')
    type('URL Slug', 'summer-2026')
    type('Competition Name', 'Summer Throwdown')
    expect(field('URL Slug').value).toBe('summer-throwdown')
  })

  it('takes a slug that is nothing like the name', async () => {
    mount()
    await openForm()
    type('Competition Name', 'Summer')
    type('URL Slug', 'the-big-one')
    expect(field('URL Slug').value).toBe('the-big-one')
  })

  it('refuses to submit until both fields carry something', async () => {
    mount()
    await openForm()
    const submit = () => sheet().getByRole('button', { name: 'Create Competition' })
    expect(submit()).toBeDisabled()
    type('Competition Name', '   ')
    expect(submit()).toBeDisabled()
    type('Competition Name', 'Summer')
    expect(submit()).toBeEnabled()
  })

  it('sends the trimmed name with the slug', async () => {
    mount()
    await openForm()
    type('Competition Name', '  Summer Throwdown  ')
    create()
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/competitions', {
      name: 'Summer Throwdown', slug: 'summer-throwdown',
    }))
  })

  // The server cleans the slug it was sent, so where to go next is its answer
  // rather than the one in the form.
  it('goes to the new competitions admin, on the slug the server settled on', async () => {
    apiPost.mockResolvedValue({ id: 12, name: 'Summer', slug: 'summer-cleaned' })
    mount()
    await openForm()
    type('Competition Name', 'Summer')
    create()
    await waitFor(() => expect(currentPath()).toBe('/summer-cleaned/admin'))
  })

  it('shows what the server refused and stays on the form', async () => {
    apiPost.mockRejectedValue(new Error('Slug must be alphanumeric (dashes allowed internally)'))
    mount()
    await openForm()
    type('Competition Name', 'Summer')
    create()
    await screen.findByRole('alert')
    expect(sheet().getByRole('alert')).toHaveTextContent('Slug must be alphanumeric')
    expect(currentPath()).toBe('/admin')
  })

  // The refusal belongs to the values that caused it, and those are gone once
  // the sheet is shut.
  it('does not reopen under the last refusal', async () => {
    apiPost.mockRejectedValue(new Error('Slug must be alphanumeric (dashes allowed internally)'))
    mount()
    await openForm()
    type('Competition Name', 'Summer')
    create()
    await screen.findByRole('alert')
    fireEvent.click(sheet().getByRole('button', { name: 'Cancel' }))
    await openForm()
    expect(sheet().queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('deleting a competition', () => {
  async function askToDelete(name: string) {
    fireEvent.click((await row(name)).getByRole('button', { name: `Delete ${name}` }))
    return screen.findByRole('alertdialog')
  }

  it('asks before deleting, naming the competition', async () => {
    mount()
    const dialog = await askToDelete('Summer Throwdown')
    expect(within(dialog).getByText(/Summer Throwdown/)).toBeInTheDocument()
    expect(apiDel).not.toHaveBeenCalled()
  })

  it('deletes by id once the question is answered', async () => {
    mount()
    const dialog = await askToDelete('Summer Throwdown')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete competition' }))
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/competitions/4'))
  })

  it('deletes nothing when the question is declined', async () => {
    mount()
    const dialog = await askToDelete('Summer Throwdown')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(apiDel).not.toHaveBeenCalled()
  })

  // v1 dropped the row from the page whatever the server answered, so a
  // refused delete looked like it had worked. Here the refusal is the answer.
  it('says so when the server refuses, rather than dropping the row', async () => {
    apiDel.mockRejectedValue(new Error('Forbidden'))
    mount()
    const dialog = await askToDelete('Summer Throwdown')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete competition' }))
    await within(dialog).findByRole('alert')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Forbidden')
    expect(screen.getByText('Summer Throwdown')).toBeInTheDocument()
  })
})
