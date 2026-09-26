import { Route } from 'react-router'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { setViewport } from '@/test/matchMedia'
import { LeaderboardPage } from './LeaderboardPage'

const { apiGet, useRealtimeInvalidation } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/useRealtimeInvalidation', () => ({ useRealtimeInvalidation }))

const score = (points: number, display: string, tiebreakDisplay: string | null = null, partBPoints?: number) =>
  ({ points, display, tiebreakDisplay, ...(partBPoints === undefined ? {} : { partBPoints }) })

// Ada leads. Bob and Cy hold the same placing in every workout, so they share
// second and the next athlete takes fourth. Dee sat one out, which is what
// puts a half point in a total. Eve entered and scored nothing. Fin is in no
// division at all.
const DATA = {
  workouts: [
    { id: 11, number: 1, name: 'Fran', scoreType: 'time', status: 'completed' },
    { id: 12, number: 2, name: 'Grace', scoreType: 'reps', status: 'completed' },
  ],
  halfWeightIds: [12],
  tiebreakWorkoutId: 11,
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
    return Promise.resolve({ url: null })
  })
}

function mount() {
  return renderRoutes(<Route path=":slug/leaderboard" element={<LeaderboardPage />} />, ['/summer/leaderboard'])
}

async function table(name: string) {
  return within(await screen.findByRole('table', { name }))
}

function cell(row: HTMLElement, index: number) {
  return within(row).getAllByRole('cell')[index] as HTMLElement
}

function cellText(row: HTMLElement, index: number) {
  return cell(row, index).textContent ?? ''
}

async function rows(name = 'Rx standings') {
  return (await table(name)).getAllByRole('row').slice(1)
}

async function ranks(name = 'Rx standings') {
  return (await rows(name)).map((r) => cellText(r, 0))
}

async function names(name = 'Rx standings') {
  return (await rows(name)).map((r) => cellText(r, 1))
}

function choose(name: string, value: string) {
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })
}

/** The division switch is a radio group: the reader picks, not a menu. */
function pickDivision(label: string) {
  fireEvent.click(screen.getByRole('radio', { name: label }))
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('LeaderboardPage', () => {
  it('reads the standings for the slug in the address', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    expect(apiGet).toHaveBeenCalledWith('/api/leaderboard?slug=summer')
    expect(useRealtimeInvalidation).toHaveBeenCalledWith([['leaderboard', 'summer']])
  })

  it('says how many workouts count, and which way the scale runs', async () => {
    mount()
    expect(await screen.findByText('2 workouts · Lower points = better')).toBeInTheDocument()
  })

  it('counts one workout in the singular', async () => {
    serve({ ...DATA, workouts: [DATA.workouts[0]] })
    mount()
    expect(await screen.findByText('1 workout · Lower points = better')).toBeInTheDocument()
  })

  it('announces that it is loading before saying anything about the standings', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('says so when nothing has been scored', async () => {
    serve({ workouts: [], entries: [], halfWeightIds: [] })
    mount()
    expect(await screen.findByText('No standings yet')).toBeInTheDocument()
  })

  // A failed read is not an empty board: "No standings yet" on a refused
  // request tells a spectator the competition has no scores when the truth is
  // the screen could not ask.
  it('says the read failed rather than pretending the board is empty', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the leaderboard')).toBeInTheDocument()
    expect(screen.queryByText('No standings yet')).not.toBeInTheDocument()
  })

  // Ties share a placing and the placings after them are skipped, which is the
  // rule the API ranks by (v1 quirk, locked in scoring.test.ts).
  it('shares a placing between athletes tied in every workout', async () => {
    mount()
    expect(await ranks()).toEqual(['1', '2', '2', '4', '—'])
  })

  it('groups by division, and puts the athletes without one last', async () => {
    mount()
    const headings = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(headings).toEqual(['Rx', 'No Division'])
  })

  it('names a workout column per workout, marking the half-weight one', async () => {
    mount()
    const headers = (await table('Rx standings')).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Rank', 'Athlete', 'WOD 1', 'WOD 2 ½', 'Total Pts'])
  })

  it('shows the placing, the score behind it and the tiebreak', async () => {
    mount()
    const row = (await table('Rx standings')).getByRole('row', { name: /Ada Ant/ })
    const wod1 = within(cell(row, 2))
    expect(wod1.getByText('#1')).toBeInTheDocument()
    expect(wod1.getByText('3:01')).toBeInTheDocument()
    expect(wod1.getByText('TB 1:20')).toBeInTheDocument()
  })

  it('shows a Part B placing beside the Part A one', async () => {
    mount()
    const row = (await table('Rx standings')).getByRole('row', { name: /Bob Brown/ })
    expect(within(cell(row, 3)).getByText('/ B#3')).toBeInTheDocument()
  })

  it('marks a workout an athlete did not start', async () => {
    mount()
    const row = (await table('Rx standings')).getByRole('row', { name: /Dee Doe/ })
    expect(within(cell(row, 3)).getByText('DNS')).toBeInTheDocument()
  })

  // halfWeight halves the points of a workout, so a total is not always whole.
  it('shows a half point as a half point and a whole one as a whole number', async () => {
    mount()
    const rx = await table('Rx standings')
    expect(within(rx.getByRole('row', { name: /Dee Doe/ })).getByText('6.5')).toBeInTheDocument()
    expect(within(rx.getByRole('row', { name: /Ada Ant/ })).getByText('2')).toBeInTheDocument()
  })

  it('leaves the total blank for an athlete who has scored nothing', async () => {
    mount()
    const row = (await table('Rx standings')).getByRole('row', { name: /Eve Ell/ })
    expect(within(cell(row, 4)).getByText('—')).toBeInTheDocument()
  })

  it('repeats the tiebreak workout score under the total', async () => {
    mount()
    const row = (await table('Rx standings')).getByRole('row', { name: /Ada Ant/ })
    expect(within(cell(row, 4)).getByText('TB 3:01')).toBeInTheDocument()
  })

  it('narrows to one division', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    pickDivision('Rx')
    expect(screen.queryByRole('table', { name: 'No Division standings' })).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Rx standings' })).toBeInTheDocument()
  })

  it('offers every division and an all, in the order the standings name them', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    const options = within(screen.getByRole('radiogroup', { name: 'Division' }))
      .getAllByRole('radio')
      .map((r) => r.getAttribute('aria-label') ?? (r as HTMLInputElement).value)
    expect(options).toHaveLength(3)
  })

  it('offers no division switch when there is only one division', async () => {
    serve({ ...DATA, entries: DATA.entries.filter((e) => e.divisionName === 'Rx') })
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    expect(screen.queryByRole('radiogroup', { name: 'Division' })).not.toBeInTheDocument()
  })

  it('says so when a filter leaves nothing to show', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search athlete' }), { target: { value: 'zzz' } })
    expect(await screen.findByText('No athletes match')).toBeInTheDocument()
  })

  // Picking a workout drops the other columns and the overall total with them:
  // a total across workouts means nothing when only one is being read.
  it('narrows to one workout, and sorts by it', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    choose('Workout', '12')
    const headers = (await table('Rx standings')).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Rank', 'Athlete', 'WOD 2 ½'])
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('12')
  })

  it('sorts by a workout, scored athletes first and the rest by name', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    choose('Sort', '12')
    expect(await names()).toEqual(['Ada Ant', 'Bob Brown', 'Cy Cat', 'Dee Doe', 'Eve Ell'])
  })

  it('searches by athlete name', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search athlete' }), { target: { value: 'cy' } })
    expect(await names()).toEqual(['Cy Cat'])
  })

  // A table does not fold on a narrow screen any more: it keeps its columns
  // and pans, which scrolls the two cells every other cell is read against —
  // the placing and the name — off the side of the phone. So the phone is
  // given the columns it can hold, and the workout switch above the table is
  // how a reader on a phone reads one workout's scores.
  describe('on a phone', () => {
    it('shows the placing, the athlete and the total, and no workout column', async () => {
      setViewport(375)
      mount()
      const headers = (await table('Rx standings')).getAllByRole('columnheader').map((h) => h.textContent)
      expect(headers).toEqual(['Rank', 'Athlete', 'Total Pts'])
    })

    it('shows the workout a reader has narrowed to', async () => {
      setViewport(375)
      mount()
      await screen.findByRole('table', { name: 'Rx standings' })
      choose('Workout', '11')
      const headers = (await table('Rx standings')).getAllByRole('columnheader').map((h) => h.textContent)
      expect(headers).toEqual(['Rank', 'Athlete', 'WOD 1'])
    })

    it('gives the columns back when the phone is turned on its side', async () => {
      setViewport(375)
      mount()
      await screen.findByRole('table', { name: 'Rx standings' })
      act(() => setViewport(900))
      const headers = (await table('Rx standings')).getAllByRole('columnheader').map((h) => h.textContent)
      expect(headers).toEqual(['Rank', 'Athlete', 'WOD 1', 'WOD 2 ½', 'Total Pts'])
    })
  })

  it('offers to clear the filters only once one is set', async () => {
    mount()
    await screen.findByRole('table', { name: 'Rx standings' })
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    choose('Workout', '12')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('combobox', { name: 'Workout' })).toHaveValue('all')
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('overall')
    expect(await screen.findByRole('heading', { name: 'No Division' })).toBeInTheDocument()
  })
})
