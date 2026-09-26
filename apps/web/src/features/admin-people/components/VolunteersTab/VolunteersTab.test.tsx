import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VolunteersTab } from './VolunteersTab'
import type { Volunteer, VolunteerRole } from '../../usePeople'

const { apiDel, apiPost, apiPut } = vi.hoisted(() => ({
  apiDel: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiDel, apiPost, apiPut }))

// v1: the volunteers half of src/app/[slug]/admin/people/page.tsx. What only
// the volunteers have is a role, and a filter on it.

const ROLES: VolunteerRole[] = [{ id: 5, name: 'Judge' }, { id: 6, name: 'Marshal' }]
const VOLUNTEERS: Volunteer[] = [
  { id: 8, name: 'Jo Jones', roleId: 5, role: ROLES[0] },
  { id: 9, name: 'Kit King', roleId: null, role: null },
]

function draw(over: { volunteers?: Volunteer[]; roles?: VolunteerRole[]; adding?: boolean; loading?: boolean } = {}) {
  const run = vi.fn(async (_label: string, op: () => Promise<unknown>) => {
    try { return await op() } catch { return undefined }
  })
  const reload = vi.fn(async () => {})
  const onCloseAdd = vi.fn()
  render(
    <VolunteersTab
      slug="rugged-rumble"
      volunteers={over.volunteers ?? VOLUNTEERS}
      roles={over.roles ?? ROLES}
      loading={over.loading ?? false}
      setLoading={vi.fn()}
      run={run as never}
      reload={reload}
      setVolunteers={vi.fn()}
      adding={over.adding ?? false}
      onCloseAdd={onCloseAdd}
    />,
  )
  return { run, reload, onCloseAdd }
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

/** The editor, which is a sheet beside the roster rather than the row itself. */
const sheet = (name: string) => within(screen.getByRole('dialog', { name }))
/** A question, which is not the same thing as an editor. */
const asked = (name: string) => within(screen.getByRole('alertdialog', { name }))
const openEditor = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: 'Edit' }))

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({})
  apiPut.mockResolvedValue({})
  apiDel.mockResolvedValue({})
})

describe('the roster it draws', () => {
  // An empty list mid-read is not "No volunteers yet".
  it('shows a shimmer rather than an empty list while the reads are out', () => {
    draw({ volunteers: [], loading: true })
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText('No volunteers yet')).not.toBeInTheDocument()
  })

  it('lists each volunteer with the role they hold', () => {
    draw()
    expect(within(row('Jo Jones')).getByText('Judge')).toBeInTheDocument()
    expect(within(row('Kit King')).getByText('—')).toBeInTheDocument()
  })

  it('drops the role column when the competition defined none', () => {
    draw({ roles: [] })
    expect(screen.queryByRole('columnheader', { name: 'Role' })).not.toBeInTheDocument()
  })

  it('says what to do rather than drawing an empty table', () => {
    draw({ volunteers: [] })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No volunteers yet')).toBeInTheDocument()
  })

  it('narrows the list to one role', () => {
    draw()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), { target: { value: '5' } })
    expect(row('Jo Jones')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Kit King/ })).not.toBeInTheDocument()
  })

  it('narrows the list to the volunteers holding no role at all', () => {
    draw()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), { target: { value: '__none__' } })
    expect(row('Kit King')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Jo Jones/ })).not.toBeInTheDocument()
  })

  it('searches and filters together', () => {
    draw()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), { target: { value: '5' } })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kit' } })
    expect(screen.queryByRole('row', { name: /Jo Jones/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Kit King/ })).not.toBeInTheDocument()
  })
})

describe('adding volunteers', () => {
  it('opens on the page asking to add, and not before', () => {
    draw()
    expect(screen.queryByRole('dialog', { name: 'Add volunteer' })).not.toBeInTheDocument()
  })

  it('sends one volunteer under the role that was picked', async () => {
    const { onCloseAdd } = draw({ adding: true })
    const form = sheet('Add volunteer')
    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Lee Lang' } })
    fireEvent.change(form.getByLabelText('Role'), { target: { value: '6' } })
    press('Add volunteer')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/volunteers', {
      slug: 'rugged-rumble', name: 'Lee Lang', roleId: 6,
    }))
    expect(onCloseAdd).toHaveBeenCalled()
  })

  // COM-107. A second column names the role; a comma inside a name needs
  // quotes, as in any CSV.
  it('gives each imported line the role it names', async () => {
    draw({ adding: true })
    const form = sheet('Add volunteer')
    fireEvent.click(form.getByRole('radio', { name: 'Import many' }))
    fireEvent.change(form.getByLabelText(/^Default role/), { target: { value: '6' } })
    fireEvent.change(form.getByRole('textbox', { name: /One per line/ }), {
      target: { value: '"Doe, Jane", judge\n\nLee Lang\n' },
    })
    press('Import volunteers')
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
    expect(apiPost.mock.calls[0][1]).toEqual({ slug: 'rugged-rumble', name: 'Doe, Jane', roleId: 5 })
    expect(apiPost.mock.calls[1][1]).toEqual({ slug: 'rugged-rumble', name: 'Lee Lang', roleId: 6 })
  })

  it('names a role that does not exist and imports nothing', async () => {
    draw({ adding: true })
    const form = sheet('Add volunteer')
    fireEvent.click(form.getByRole('radio', { name: 'Import many' }))
    fireEvent.change(form.getByRole('textbox', { name: /One per line/ }), {
      target: { value: 'Lee Lang, Timer' },
    })
    expect(form.getByRole('alert')).toHaveTextContent('No role named Timer')
    press('Import volunteers')
    await new Promise((r) => setTimeout(r, 0))
    expect(apiPost).not.toHaveBeenCalled()
  })
})

describe('changing one volunteer', () => {
  it('opens the editor holding the role that volunteer already has', () => {
    draw()
    openEditor('Jo Jones')
    expect(sheet('Jo Jones').getByLabelText('Role')).toHaveValue('5')
  })

  it('saves the name and role that were typed', async () => {
    draw()
    openEditor('Jo Jones')
    fireEvent.change(sheet('Jo Jones').getByLabelText('Role'), { target: { value: '6' } })
    press('Save')
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/api/volunteers/8?slug=rugged-rumble', {
      name: 'Jo Jones', roleId: 6,
    }))
  })

  it('asks once before removing', async () => {
    draw()
    fireEvent.click(within(row('Kit King')).getByRole('button', { name: 'Remove' }))
    expect(apiDel).not.toHaveBeenCalled()
    expect(asked('Remove volunteer?').getByText(/Kit King/)).toBeInTheDocument()
    press('Remove volunteer')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/volunteers/9?slug=rugged-rumble'))
  })

  it('says so in the dialog that asked when the removal is refused', async () => {
    draw()
    apiDel.mockRejectedValue(new Error('Kit is judging heat 4'))
    fireEvent.click(within(row('Kit King')).getByRole('button', { name: 'Remove' }))
    press('Remove volunteer')
    expect(await screen.findByRole('alert')).toHaveTextContent('Remove volunteer: Kit is judging heat 4')
  })

  it('replaces one volunteer with another, named by the role they hold', async () => {
    draw()
    openEditor('Jo Jones')
    const form = sheet('Jo Jones')
    const picker = form.getByRole('combobox', { name: 'Replace Jo Jones with' })
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody', 'Kit King'])
    fireEvent.change(picker, { target: { value: '9' } })
    fireEvent.click(form.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/volunteers/8/swap?slug=rugged-rumble', { newVolunteerId: 9 }))
  })

  it('never offers to withdraw one', () => {
    draw()
    openEditor('Jo Jones')
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
  })
})

describe('changing several at once', () => {
  it('deletes the selected volunteers once the question is answered', async () => {
    draw()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every volunteer' }))
    press('Delete 2 selected')
    expect(apiDel).not.toHaveBeenCalled()
    press('Delete 2')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/volunteers', { slug: 'rugged-rumble', ids: [8, 9] }))
  })
})
