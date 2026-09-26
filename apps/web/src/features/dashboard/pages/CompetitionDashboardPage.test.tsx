import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { CompetitionDashboardPage } from './CompetitionDashboardPage'

const { apiGet, apiDownload } = vi.hoisted(() => ({ apiGet: vi.fn(), apiDownload: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet, apiDownload }))

const WORKOUTS = [
  { id: 11, number: 1, name: 'Fran', status: 'completed', lanes: 8 },
  { id: 12, number: 2, name: 'Grace', status: 'active', lanes: 6 },
  { id: 13, number: 3, name: 'Helen', status: 'draft', lanes: 6 },
]

// Eve is withdrawn. v1 counted her anyway — the count is the roster, not the
// field.
const ATHLETES = [
  { id: 1, name: 'Ada Ant', withdrawn: false },
  { id: 2, name: 'Bob Brown', withdrawn: false },
  { id: 3, name: 'Eve Ell', withdrawn: true },
]

function serve(workouts: unknown = WORKOUTS, athletes: unknown = ATHLETES) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/workouts')) return Promise.resolve(workouts)
    if (path.startsWith('/api/athletes')) return Promise.resolve(athletes)
    return Promise.resolve({ url: null })
  })
}

function mount() {
  return renderRoutes(
    <Route path=":slug/admin" element={<CompetitionDashboardPage />} />,
    ['/summer/admin'],
  )
}

// A count and the thing it counts are one fact, so the tile is read whole. It
// is a group rather than a region, because `Workouts` is also the panel below
// it and two landmarks of one name cannot be told apart.
const stat = (label: string) => screen.getByRole('group', { name: label })

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiDownload.mockResolvedValue(undefined)
})

describe('the counts', () => {
  it('reads the roster and the workouts for the slug in the address', async () => {
    mount()
    await screen.findByRole('link', { name: /Fran/ })
    expect(apiGet).toHaveBeenCalledWith('/api/workouts?slug=summer')
    expect(apiGet).toHaveBeenCalledWith('/api/athletes?slug=summer')
  })

  it('counts the roster, withdrawn athletes included, and the workouts', async () => {
    mount()
    await screen.findByRole('link', { name: /Fran/ })
    expect(within(stat('Athletes')).getByText('3')).toBeInTheDocument()
    expect(within(stat('Workouts')).getByText('3')).toBeInTheDocument()
  })

  // v1 printed 0 while the read was still out, which says the competition is
  // empty and is then corrected. An unknown count is drawn as a space.
  it('does not call the competition empty while the reads are still out', () => {
    mount()
    expect(within(stat('Athletes')).queryByText('0')).not.toBeInTheDocument()
    expect(stat('Athletes')).toHaveAttribute('aria-busy', 'true')
  })

  it('counts zero once the read comes back empty', async () => {
    serve([], [])
    mount()
    expect(await within(stat('Athletes')).findByText('0')).toBeInTheDocument()
  })
})

describe('the workout list', () => {
  it('lists each workout with its lanes and status', async () => {
    mount()
    const fran = within((await screen.findByRole('link', { name: /Fran/ })).closest('tr') as HTMLElement)
    expect(fran.getByText('8')).toBeInTheDocument()
    expect(fran.getByText('Completed')).toBeInTheDocument()

    const helen = within((await screen.findByRole('link', { name: /Helen/ })).closest('tr') as HTMLElement)
    expect(helen.getByText('INactive')).toBeInTheDocument()
  })

  it('opens a workout from its row', async () => {
    mount()
    fireEvent.click(await screen.findByRole('link', { name: /Grace/ }))
    await waitFor(() => expect(currentPath()).toBe('/summer/admin/workouts/12'))
  })

  // v1 hid the section entirely, so a fresh competition showed a dashboard
  // with nothing under the counts and no hint of what was missing.
  it('says what is missing when there are no workouts, rather than hiding', async () => {
    serve([])
    mount()
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Workouts' })).not.toBeInTheDocument()
  })
})

describe('the ways out', () => {
  it('links to the two screens the dashboard is a way into', () => {
    mount()
    expect(screen.getByRole('link', { name: 'Manage athletes' })).toHaveAttribute('href', '/summer/admin/people')
    expect(screen.getAllByRole('link', { name: 'Manage workouts' })[0]).toHaveAttribute('href', '/summer/admin/workouts')
  })
})

describe('the exports', () => {
  it('says what each export contains before it is pressed', () => {
    mount()
    expect(
      screen.getByText('CSV: one file of results. ZIP: per-table CSVs plus a JSON manifest.'),
    ).toBeInTheDocument()
  })

  // v1's exports were anchors. Cross-origin they need the auth headers only a
  // fetch can carry, so the button asks the seam for the file.
  it('exports through the seam rather than an anchor the session cannot reach', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Export (CSV)' }))
    expect(apiDownload).toHaveBeenCalledWith('/api/export?slug=summer')
    // One export at a time: the ZIP button unlocks when the CSV has landed.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export (ZIP)' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Export (ZIP)' }))
    expect(apiDownload).toHaveBeenCalledWith('/api/export/zip?slug=summer')
  })

  it('says so when an export is refused instead of failing silently', async () => {
    apiDownload.mockRejectedValue(new Error('Forbidden'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Export (CSV)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden')
  })

  // The message outlives the press that caused it, so it can be put away.
  it('lets the refusal be dismissed', async () => {
    apiDownload.mockRejectedValue(new Error('Forbidden'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Export (CSV)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('locks the export buttons while a file is being fetched', async () => {
    let release!: () => void
    apiDownload.mockImplementation(() => new Promise<void>((r) => { release = () => r() }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Export (CSV)' }))
    expect(screen.getByRole('button', { name: 'Export (CSV)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export (ZIP)' })).toBeDisabled()
    release()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export (CSV)' })).toBeEnabled())
  })

  // A failed read is not an empty competition.
  it('says the reads failed rather than pretending the competition is empty', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the workouts')).toBeInTheDocument()
    expect(screen.queryByText('No workouts yet')).not.toBeInTheDocument()
  })
})
