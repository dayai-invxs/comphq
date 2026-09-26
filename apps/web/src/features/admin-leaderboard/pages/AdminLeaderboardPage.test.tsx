import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { AdminLeaderboardPage } from './AdminLeaderboardPage'

const { apiGet, apiPatch } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPatch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet, apiPatch }))

const score = (points: number, display: string, tiebreakDisplay: string | null = null, partBPoints?: number) =>
  ({ points, display, tiebreakDisplay, ...(partBPoints === undefined ? {} : { partBPoints }) })

// Bob and Cy placed identically in both workouts, so they share second and the
// next athlete takes fourth. Dee sat one out, which is where the half point in
// a total comes from. Eve scored nothing. Fin is in no division.
const DATA = {
  workouts: [
    { id: 11, number: 1, name: 'Fran', scoreType: 'time', status: 'completed' },
    { id: 12, number: 2, name: 'Grace', scoreType: 'reps', status: 'completed' },
  ],
  halfWeightIds: [12],
  entries: [
    {
      athleteId: 1, athleteName: 'Ada Ant', divisionName: 'Rx', totalPoints: 2,
      workoutScores: { 11: score(1, '3:01', '1:20'), 12: score(1, '120 reps') },
    },
    {
      athleteId: 2, athleteName: 'Bob Brown', divisionName: 'Rx', totalPoints: 4,
      workoutScores: { 11: score(2, '3:30'), 12: score(2, '110 reps', null, 3) },
    },
    {
      athleteId: 3, athleteName: 'Cy Cat', divisionName: 'Rx', totalPoints: 4,
      workoutScores: { 11: score(2, '3:30'), 12: score(2, '110 reps') },
    },
    {
      athleteId: 4, athleteName: 'Dee Doe', divisionName: 'Rx', totalPoints: 6.5,
      workoutScores: { 11: score(4, '4:10'), 12: null },
    },
    {
      athleteId: 5, athleteName: 'Eve Ell', divisionName: 'Rx', totalPoints: 0,
      workoutScores: { 11: null, 12: null },
    },
    {
      athleteId: 6, athleteName: 'Fin Fox', divisionName: null, totalPoints: 3,
      workoutScores: { 11: score(3, '3:45'), 12: null },
    },
  ],
}

function serve(data: unknown = DATA) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/leaderboard')) return Promise.resolve(data)
    return Promise.resolve(null)
  })
}

function mount() {
  return renderRoutes(
    <Route path=":slug/admin/leaderboard" element={<AdminLeaderboardPage />} />,
    ['/summer/admin/leaderboard'],
  )
}

async function table(name: string) {
  return within(await screen.findByRole('table', { name }))
}

// DataTable repeats each column's header inside its own cell, hidden, so a row
// still reads as a labelled card once the table folds on a narrow screen.
function cellText(row: HTMLElement, index: number) {
  const cell = within(row).getAllByRole('cell')[index] as HTMLElement
  return [...cell.childNodes]
    .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent)
    .join('')
}

async function rows(name = 'Rx standings') {
  return (await table(name)).getAllByRole('row').slice(1)
}

/** Walks the confirm step and opens the editor on one athlete's placing. */
async function edit(athlete: string, workout: number) {
  const row = (await rows()).find((r) => within(r).queryByText(athlete))!
  fireEvent.click(within(row).getByRole('button', { name: new RegExp(`edit WOD ${workout} points for ${athlete}`) }))
  fireEvent.click(await screen.findByRole('button', { name: 'Yes' }))
  return screen.getByRole('spinbutton', { name: 'Points' })
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiPatch.mockResolvedValue(undefined)
})

describe('AdminLeaderboardPage', () => {
  it('reads the standings for the slug in the address', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    expect(apiGet).toHaveBeenCalledWith('/api/leaderboard?slug=summer')
  })

  it('says how many workouts count, and which way the scale runs', async () => {
    mount()
    expect(
      await screen.findByText('Based on 2 completed workouts · Lower points = better'),
    ).toBeInTheDocument()
  })

  it('counts one workout in the singular', async () => {
    serve({ ...DATA, workouts: [DATA.workouts[0]] })
    mount()
    expect(await screen.findByText(/Based on 1 completed workout ·/)).toBeInTheDocument()
  })

  it('says so when nothing has been completed', async () => {
    serve({ workouts: [], entries: [], halfWeightIds: [] })
    mount()
    expect(await screen.findByText('No completed workouts yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('gives each division its own table, division-less athletes last', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    expect(screen.getAllByRole('table').map((t) => t.getAttribute('aria-label')))
      .toEqual(['Rx standings', 'No Division standings'])
  })

  // Ties share a placing and skip the ones they took; an athlete with nothing
  // scored is unranked rather than last.
  it('ranks the way the board does', async () => {
    mount()
    expect((await rows()).map((r) => cellText(r, 0))).toEqual(['1', '2', '2', '4', '—'])
  })

  it('marks a half-weighted workout in its column header', async () => {
    mount()
    const headers = (await table('Rx standings')).getAllByRole('columnheader')
    expect(headers[2]).toHaveTextContent('WOD 1')
    expect(headers[2]).not.toHaveTextContent('½')
    expect(headers[3]).toHaveTextContent('WOD 2½')
  })

  it('shows a half-weighted total to one decimal and leaves an unscored total blank', async () => {
    mount()
    const all = await rows()
    expect(cellText(all[3], 4)).toContain('6.5')
    expect(cellText(all[4], 4)).toContain('—')
  })

  // Overriding a placing rewrites the standings, so v1 asked first.
  it('asks before opening the editor, and lets the answer be no', async () => {
    mount()
    const row = (await rows())[0]
    fireEvent.click(within(row).getByRole('button', { name: /edit WOD 1 points for Ada Ant/ }))
    expect(await screen.findByText('Change points?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    await waitFor(() => expect(screen.queryByText('Change points?')).not.toBeInTheDocument())
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('opens the editor on the placing it was asked about', async () => {
    mount()
    expect(await edit('Bob Brown', 1)).toHaveValue(2)
  })

  it('sends the new placing for that athlete and that workout', async () => {
    mount()
    const input = await edit('Bob Brown', 1)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/workouts/11/scores?slug=summer', {
        slug: 'summer',
        athleteId: 2,
        points: 5,
      }),
    )
  })

  it('saves on Enter and closes the editor', async () => {
    mount()
    const input = await edit('Bob Brown', 1)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(apiPatch).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument())
  })

  it('abandons the edit on Escape', async () => {
    mount()
    const input = await edit('Bob Brown', 1)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument())
    expect(apiPatch).not.toHaveBeenCalled()
  })

  // Placings start at 1. v1 refused anything else by leaving the editor open.
  it('refuses a placing below 1, and an empty one', async () => {
    mount()
    const input = await edit('Bob Brown', 1)
    for (const value of ['0', '', 'abc']) {
      fireEvent.change(input, { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    }
    expect(apiPatch).not.toHaveBeenCalled()
    expect(screen.getByRole('spinbutton', { name: 'Points' })).toBeInTheDocument()
  })

  it('surfaces a refused override instead of pretending it landed', async () => {
    apiPatch.mockRejectedValue(new Error('Forbidden'))
    mount()
    const input = await edit('Bob Brown', 1)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden')
  })

  // An editor that closes on a refused save looks exactly like one that saved.
  it('keeps the editor open when the override is refused', async () => {
    apiPatch.mockRejectedValue(new Error('Forbidden'))
    mount()
    const input = await edit('Bob Brown', 1)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('spinbutton', { name: 'Points' })).toBeInTheDocument()
  })

  it('shows a shimmer rather than the word Loading', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  // A failed read is not an empty board.
  it('says the read failed rather than pretending nothing is completed', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the leaderboard')).toBeInTheDocument()
    expect(screen.queryByText('No completed workouts yet.')).not.toBeInTheDocument()
  })

  it('does not offer an editor where no score was entered', async () => {
    mount()
    const dee = (await rows())[3]
    expect(within(dee).getByText('DNS')).toBeInTheDocument()
    expect(within(dee).getAllByRole('button')).toHaveLength(1)
  })
})
