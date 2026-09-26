import { Route } from 'react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { PeoplePage } from './PeoplePage'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet, apiPost: vi.fn(), apiPut: vi.fn(), apiDel: vi.fn() }))

// v1: the frame of src/app/[slug]/admin/people/page.tsx — the count under the
// title, the one banner both tabs report through, and the two tabs themselves.
// What each tab draws is its own spec's business, so both are stubbed here.

type TabStub = { adding: boolean }

vi.mock('../components/AthletesTab/AthletesTab', () => ({
  AthletesTab: ({ athletes, divisions, adding }: TabStub & { athletes: unknown[]; divisions: unknown[] }) => (
    <div data-testid="athletes-tab">
      {athletes.length} rows, {divisions.length} divisions{adding ? ', adding' : ''}
    </div>
  ),
}))
vi.mock('../components/VolunteersTab/VolunteersTab', () => ({
  VolunteersTab: ({ volunteers, roles, adding }: TabStub & { volunteers: unknown[]; roles: unknown[] }) => (
    <div data-testid="volunteers-tab">
      {volunteers.length} rows, {roles.length} roles{adding ? ', adding' : ''}
    </div>
  ),
}))

const ATHLETES = [
  { id: 1, name: 'Ann', bibNumber: '7', divisionId: 3, division: null, withdrawn: false },
  { id: 2, name: 'Bo', bibNumber: null, divisionId: null, division: null, withdrawn: false },
]
const DIVISIONS = [{ id: 3, name: 'Rx', order: 1 }]
const VOLUNTEERS = [{ id: 8, name: 'Jo', roleId: 5, role: null }]
const ROLES = [{ id: 5, name: 'Judge' }]

function serve() {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/athletes')) return Promise.resolve(ATHLETES)
    if (path.startsWith('/api/divisions')) return Promise.resolve(DIVISIONS)
    if (path.startsWith('/api/volunteer-roles')) return Promise.resolve(ROLES)
    if (path.startsWith('/api/volunteers')) return Promise.resolve(VOLUNTEERS)
    return Promise.reject(new Error(`unexpected GET ${path}`))
  })
}

function mount() {
  return renderRoutes(
    <Route path=":slug/admin/people" element={<PeoplePage />} />,
    ['/rugged-rumble/admin/people'],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('what the screen says it holds', () => {
  it('counts both rosters under the title', async () => {
    mount()
    expect(await screen.findByText('2 athletes · 1 volunteers')).toBeInTheDocument()
  })

  it('reads both rosters for the competition in the address bar', async () => {
    mount()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/athletes?slug=rugged-rumble'))
  })

  it('counts each roster on its own tab', async () => {
    mount()
    expect(await screen.findByRole('tab', { name: 'Athletes (2)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Volunteers (1)' })).toBeInTheDocument()
  })
})

describe('the two tabs', () => {
  it('opens on the athletes, and hands them what it read', async () => {
    mount()
    await waitFor(() =>
      expect(screen.getByTestId('athletes-tab')).toHaveTextContent('2 rows, 1 divisions'))
    expect(screen.queryByTestId('volunteers-tab')).not.toBeInTheDocument()
  })

  it('swaps in the volunteers when asked for them', async () => {
    mount()
    fireEvent.click(await screen.findByRole('tab', { name: 'Volunteers (1)' }))
    expect(await screen.findByTestId('volunteers-tab')).toHaveTextContent('1 rows, 1 roles')
    expect(screen.queryByTestId('athletes-tab')).not.toBeInTheDocument()
  })
})

// One button above both rosters, rather than an add form permanently open
// inside each of them. Which roster it adds to is whichever one is on screen.
describe('adding to whichever roster is open', () => {
  it('names the tab it is pointed at', async () => {
    mount()
    expect(await screen.findByRole('button', { name: 'Add athlete' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('tab', { name: 'Volunteers (1)' }))
    expect(await screen.findByRole('button', { name: 'Add volunteer' })).toBeInTheDocument()
  })

  it('opens the editor on the roster that is showing', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Add athlete' }))
    expect(screen.getByTestId('athletes-tab')).toHaveTextContent('adding')
  })

  // The sheet belongs to the tab that is mounted, and changing tabs unmounts
  // it — so a half-typed athlete does not reappear as a volunteer.
  it('closes the editor when the other roster is asked for', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Add athlete' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Volunteers (1)' }))
    expect(await screen.findByTestId('volunteers-tab')).not.toHaveTextContent('adding')
  })
})

describe('when a read fails', () => {
  it('names the step that failed and lets the banner be dismissed', async () => {
    apiGet.mockRejectedValue(new Error('Database is away'))
    mount()
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Load: Database is away')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
