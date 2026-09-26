import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { SetupPage } from './SetupPage'

// v1: src/app/[slug]/admin/setup/page.tsx, 642 lines in one file. The sections
// are tested where they live; what is tested here is the wiring — which
// endpoint each write reaches, and where a refused write is reported.

const { apiGet, apiPost, apiPut, apiPatch, apiDel, apiUpload } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDel: vi.fn(), apiUpload: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPut, apiPatch, apiDel, apiUpload }))

const DIVISIONS = [
  { id: 1, name: 'RX', order: 1 },
  { id: 2, name: 'Scaled', order: 2 },
  { id: 3, name: 'Masters', order: 5 },
]
const ROLES = [{ id: 7, name: 'Judge' }]
const LOCATIONS = [{ id: 4, name: 'Main Floor' }]
const SETTINGS = {
  showBib: true,
  tiebreakWorkoutId: null,
  leaderboardVisibility: 'per_workout',
  tvLeaderboardPercentages: { RX: 40 },
  tvLeaderboardOrder: { RX: 1 },
  judgePassword: 'rug702',
  judgeMaxConsecutive: 3,
}

function serve(over: { divisions?: unknown } = {}) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/divisions')) return Promise.resolve(over.divisions ?? DIVISIONS)
    if (path.startsWith('/api/volunteer-roles')) return Promise.resolve(ROLES)
    if (path.startsWith('/api/workout-locations')) return Promise.resolve(LOCATIONS)
    if (path.startsWith('/api/settings')) return Promise.resolve(SETTINGS)
    if (path === '/api/logo') return Promise.resolve({ url: null })
    return Promise.resolve(null)
  })
}

function mount() {
  return renderRoutes(
    <Route path=":slug/admin/setup" element={<SetupPage />} />,
    ['/summer/admin/setup'],
  )
}

/** RX names a row in the divisions table and a row in the TV table, so a row is
 *  reached through the region it is in. */
const region = (name: string) => within(screen.getByRole('region', { name }))

/** Every name is typed in a sheet, and a sheet holds one box, so the sheet it
 *  is in is the whole address. */
const sheet = (name: string) => within(screen.getByRole('dialog', { name }))

/** Open the sheet the button names, type the name, and send it. */
async function add(noun: string, name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Add ${noun}` }))
  fireEvent.change(sheet(`Add ${noun}`).getByRole('textbox'), { target: { value: name } })
  fireEvent.click(sheet(`Add ${noun}`).getByRole('button', { name: `Add ${noun}` }))
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiPost.mockResolvedValue({})
  apiPut.mockResolvedValue({})
  apiPatch.mockResolvedValue(SETTINGS)
  apiDel.mockResolvedValue({})
  apiUpload.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
})

it('reads everything the screen sets, for the competition in the address', async () => {
  mount()
  await screen.findAllByText('RX')  // divisions table and TV table both name it
  expect(apiGet).toHaveBeenCalledWith('/api/divisions?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/volunteer-roles?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/workout-locations?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/settings?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/logo')
})

it('names the screen and what it is for', async () => {
  mount()
  expect(await screen.findByRole('heading', { name: 'Setup', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('Competition structure and roles')).toBeInTheDocument()
})

// Six regions on one address, and a list that reaches the sixth without
// scrolling past the five before it.
it('offers a way to each region without scrolling to it', async () => {
  mount()
  const nav = within(await screen.findByRole('navigation', { name: 'Setup sections' }))
  expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual([
    'Settings', 'Logo', 'TV leaderboard', 'Divisions', 'Locations', 'Volunteer roles',
  ])
  expect(nav.getByRole('link', { name: 'Volunteer roles' })).toHaveAttribute('href', '#setup-roles')
  expect(document.getElementById('setup-roles')).toBeInTheDocument()
})

// An unanswered read is not an empty list: "No divisions yet" while the
// divisions are still loading invites re-creating what exists, and the flash
// from empty to full reads as the screen redrawing under the hand.
it('shows placeholders while the reads are in flight, not empty lists', () => {
  apiGet.mockImplementation(() => new Promise(() => {}))
  mount()
  expect(screen.queryByText('No divisions yet')).not.toBeInTheDocument()
  expect(screen.queryByText('No locations yet')).not.toBeInTheDocument()
  expect(screen.queryByText('No volunteer roles yet')).not.toBeInTheDocument()
  expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0)
})

it('adds a division after the last one in the running order', async () => {
  mount()
  await screen.findAllByText('RX')  // divisions table and TV table both name it
  await add('division', 'Teens')
  await waitFor(() =>
    expect(apiPost).toHaveBeenCalledWith('/api/divisions', { slug: 'summer', name: 'Teens', order: 6 }))
})

// Defect 23: v1 moved a division by trading order values with whoever held the
// place it wanted, so moving the first to third left the old third at first.
// A move shifts — everything between it and its new place moves up one.
it('moves a division by shifting the ones it passes, not by trading with one', async () => {
  mount()
  fireEvent.change(await screen.findByRole('combobox', { name: 'Position of RX' }), { target: { value: '3' } })
  await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/api/divisions/1?slug=summer', { order: 5 }))
  expect(apiPut).toHaveBeenCalledWith('/api/divisions/2?slug=summer', { order: 1 })
  expect(apiPut).toHaveBeenCalledWith('/api/divisions/3?slug=summer', { order: 2 })
})

it('deletes a division once the question has been answered', async () => {
  mount()
  await screen.findAllByText('RX')  // divisions table and TV table both name it
  fireEvent.click(within(region('Divisions').getByRole('row', { name: /RX/ })).getByRole('button', { name: 'Delete' }))
  await screen.findByRole('alertdialog')
  fireEvent.click(screen.getByRole('button', { name: 'Delete division' }))
  await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/divisions/1?slug=summer'))
})

it('adds a workout location', async () => {
  mount()
  await screen.findByText('Main Floor')
  await add('location', 'Turf Field')
  await waitFor(() =>
    expect(apiPost).toHaveBeenCalledWith('/api/workout-locations', { slug: 'summer', name: 'Turf Field' }))
})

it('adds a volunteer role', async () => {
  mount()
  await screen.findByText('Judge')
  await add('volunteer role', 'Timer')
  await waitFor(() =>
    expect(apiPost).toHaveBeenCalledWith('/api/volunteer-roles', { slug: 'summer', name: 'Timer' }))
})

it('writes a setting the moment it is toggled', async () => {
  mount()
  fireEvent.click(await screen.findByRole('switch', { name: 'Show Bib Numbers' }))
  await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/api/settings', { slug: 'summer', showBib: false }))
})

it('writes the TV settings against the same endpoint', async () => {
  mount()
  fireEvent.change(await screen.findByRole('combobox', { name: 'TV position of Scaled' }), { target: { value: '2' } })
  await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/api/settings', {
    slug: 'summer',
    tvLeaderboardOrder: { RX: 1, Scaled: 2 },
  }))
})

// The TV settings are keyed by division name, so with no divisions there is
// nothing to set. v1 hid the section outright; it now says why it is empty and
// where the divisions come from, which is the same rule every other empty list
// on this screen follows.
it('says why the TV section is empty rather than hiding it', async () => {
  serve({ divisions: [] })
  mount()
  expect(await screen.findByRole('heading', { name: 'TV Leaderboard' })).toBeInTheDocument()
  expect(screen.getByText('No divisions to show')).toBeInTheDocument()
})

it('uploads a logo', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Competition Logo' })
  const file = new File(['x'], 'logo.png', { type: 'image/png' })
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
  await waitFor(() => expect(apiUpload).toHaveBeenCalled())
  expect((apiUpload.mock.calls[0][1] as FormData).get('logo')).toBe(file)
})

// v1 funnelled every write through one `run(label, op)` and put the label in
// front of the message. One banner, at the top of the screen, dismissable.
it('says which write was refused, and why', async () => {
  mount()
  await screen.findAllByText('RX')  // divisions table and TV table both name it
  apiPost.mockRejectedValue(new Error('Division already exists'))
  await add('division', 'RX')

  const banner = await screen.findByRole('alert')
  expect(banner).toHaveTextContent('Add division: Division already exists')

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})

// A failed read is not an empty list: "No divisions yet" invites the admin to
// re-create divisions that exist. Each section says its own read failed.
it('says the reads failed rather than pretending the lists are empty', async () => {
  apiGet.mockRejectedValue(new Error('boom'))
  mount()
  expect(await screen.findByText('Could not load the divisions')).toBeInTheDocument()
  expect(screen.getByText('Could not load the locations')).toBeInTheDocument()
  expect(screen.getByText('Could not load the volunteer roles')).toBeInTheDocument()
  expect(screen.getByText('Could not load the settings')).toBeInTheDocument()
  expect(screen.getByText('Could not load the TV leaderboard')).toBeInTheDocument()
  expect(screen.getByText('Could not load the logo')).toBeInTheDocument()
  expect(screen.queryByText('No divisions yet')).not.toBeInTheDocument()
  expect(screen.queryByText('No locations yet')).not.toBeInTheDocument()
  expect(screen.queryByText('No volunteer roles yet')).not.toBeInTheDocument()
})

it('keeps the sections whose reads landed when one read fails', async () => {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/divisions')) return Promise.reject(new Error('boom'))
    if (path.startsWith('/api/volunteer-roles')) return Promise.resolve(ROLES)
    if (path.startsWith('/api/workout-locations')) return Promise.resolve(LOCATIONS)
    if (path.startsWith('/api/settings')) return Promise.resolve(SETTINGS)
    return Promise.resolve({ url: null })
  })
  mount()
  expect(await screen.findByText('Could not load the divisions')).toBeInTheDocument()
  expect(await screen.findByText('Main Floor')).toBeInTheDocument()
})

// The sheet says it is working for a rename as well as an add — the busy flag
// covers both writes, not only the one that adds.
it('says the sheet is working while a rename is in flight', async () => {
  let release!: () => void
  apiPut.mockImplementation(() => new Promise((resolve) => { release = () => resolve({}) }))
  mount()
  await screen.findAllByText('RX')  // divisions table and TV table both name it
  fireEvent.click(within(region('Divisions').getByRole('row', { name: /RX/ })).getByRole('button', { name: 'Edit' }))
  fireEvent.change(sheet('RX').getByRole('textbox'), { target: { value: 'RX Pro' } })
  fireEvent.click(sheet('RX').getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(sheet('RX').getByRole('button', { name: 'Save' })).toHaveAttribute('aria-busy', 'true'))
  release()
})

// Defect 25 end to end: the banner is not the only thing a refusal leaves
// behind — the name stays in the box it was typed in, ready to be corrected.
it('leaves the refused name in the sheet it was typed in', async () => {
  mount()
  await screen.findAllByText('RX')  // divisions table and TV table both name it
  apiPost.mockRejectedValue(new Error('Division already exists'))
  await add('division', 'RX')

  await screen.findByRole('alert')
  expect(sheet('Add division').getByRole('textbox')).toHaveValue('RX')
})

// COM-109. A pasted list of divisions reaches the create route once per new
// name, on the end of the running order.
async function importMany(noun: string, plural: string, list: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Add ${noun}` }))
  fireEvent.click(sheet(`Add ${noun}`).getByRole('radio', { name: 'Import many' }))
  fireEvent.change(sheet(`Add ${noun}`).getByRole('textbox'), { target: { value: list } })
  fireEvent.click(sheet(`Add ${noun}`).getByRole('button', { name: `Import ${plural}` }))
}

it('imports a list of divisions', async () => {
  mount()
  await screen.findAllByText('RX')
  await importMany('division', 'divisions', 'Teens\nRX\nMasters 50+')
  await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
  expect(apiPost).toHaveBeenNthCalledWith(1, '/api/divisions', { slug: 'summer', name: 'Teens', order: 6 })
  expect(apiPost).toHaveBeenNthCalledWith(2, '/api/divisions', { slug: 'summer', name: 'Masters 50+', order: 7 })
})

it('says so when every listed division already exists', async () => {
  mount()
  await screen.findAllByText('RX')
  await importMany('division', 'divisions', 'RX\nscaled')
  expect(await screen.findByRole('alert')).toHaveTextContent('Import divisions: Nothing new to import')
  expect(apiPost).not.toHaveBeenCalled()
})

// COM-110. Same for roles: one create per name not already on the list.
it('imports a list of volunteer roles', async () => {
  mount()
  await screen.findAllByText('RX')
  await importMany('volunteer role', 'volunteer roles', 'Role\nTimer\njudge\nScorekeeper')
  await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
  expect(apiPost).toHaveBeenNthCalledWith(1, '/api/volunteer-roles', { slug: 'summer', name: 'Timer' })
  expect(apiPost).toHaveBeenNthCalledWith(2, '/api/volunteer-roles', { slug: 'summer', name: 'Scorekeeper' })
})
