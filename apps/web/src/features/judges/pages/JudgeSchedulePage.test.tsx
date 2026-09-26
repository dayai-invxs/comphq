import { Route } from 'react-router'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { JudgeSchedulePage } from './JudgeSchedulePage'

const { apiGet, useSession } = vi.hoisted(() => ({ apiGet: vi.fn(), useSession: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/session', () => ({ useSession }))

const WALKOUT = Date.parse('2026-08-26T08:58:00.000Z')
const START = Date.parse('2026-08-26T09:00:00.000Z')

const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const heat = (heatNumber: number, judges: [number, string][], times = true) => ({
  heatNumber,
  heatTimeMs: times ? START : null,
  walkoutTimeMs: times ? WALKOUT : null,
  assignments: judges.map(([judgeId, judgeName], i) => ({ judgeId, judgeName, lane: i + 1 })),
})

const SCHEDULE = {
  judges: [
    { id: 1, name: 'Jo Judge' },
    { id: 2, name: 'Kim Kane' },
  ],
  workouts: [
    {
      id: 7,
      number: 1,
      name: 'Fran',
      locationName: 'Floor A',
      heats: [
        heat(1, [[1, 'Jo Judge'], [2, 'Kim Kane']]),
        heat(2, [[1, 'Jo Judge']]),
        heat(3, [[1, 'Jo Judge']]),
      ],
    },
  ],
}

function serve(schedule: unknown = SCHEDULE, settings: unknown = { judgeMaxConsecutive: 2 }) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/judge-schedule')) {
      return schedule instanceof Error ? Promise.reject(schedule) : Promise.resolve(schedule)
    }
    if (path.startsWith('/api/settings')) return Promise.resolve(settings)
    return Promise.resolve({ url: null })
  })
}

function mount() {
  return renderRoutes(<Route path=":slug" element={<JudgeSchedulePage />} />, ['/summer'])
}

/** The lanes of one heat, which is what a judge reads to find their own row. */
async function lanes(number: number) {
  return within(await screen.findByRole('list', { name: `Heat ${number} judges` }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.setItem('judgeUnlocked', '1')
  useSession.mockReturnValue({ user: null, loading: false, signOut: vi.fn() })
  serve()
})

describe('JudgeSchedulePage', () => {
  it('asks for the judge password before showing anything', async () => {
    sessionStorage.clear()
    mount()
    expect(await screen.findByRole('heading', { name: 'Judge Access' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Judges' })).not.toBeInTheDocument()
  })

  it('reads the schedule for the slug in the address', async () => {
    mount()
    await lanes(1)
    expect(apiGet).toHaveBeenCalledWith('/api/judge-schedule?slug=summer')
  })

  it('announces that it is loading until the first answer arrives', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  // A station screen: one job, and one way out of it.
  it('carries no competition navigation, only a way back', async () => {
    mount()
    await lanes(1)
    expect(screen.queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to competition' })).toBeInTheDocument()
  })

  it('counts the judges', async () => {
    mount()
    expect(await screen.findByText('2 judges')).toBeInTheDocument()
  })

  it('counts one judge in the singular', async () => {
    serve({ judges: [{ id: 1, name: 'Jo Judge' }], workouts: [] })
    mount()
    expect(await screen.findByText('1 judge')).toBeInTheDocument()
  })

  it('says where to add judges when there are none', async () => {
    serve({ judges: [], workouts: [] })
    mount()
    expect(await screen.findByText('No judges yet')).toBeInTheDocument()
  })

  it('says so when the judges exist but nobody is assigned', async () => {
    serve({ judges: [{ id: 1, name: 'Jo Judge' }], workouts: [] })
    mount()
    expect(await screen.findByText('No assignments yet')).toBeInTheDocument()
  })

  it('reports a failed read rather than an empty screen', async () => {
    serve(new Error('judge-schedule is down'))
    mount()
    expect(await screen.findByText('judge-schedule is down')).toBeInTheDocument()
  })

  it('names the workout and where it is being run', async () => {
    mount()
    expect(await screen.findByRole('region', { name: 'Workout 1: Fran' })).toBeInTheDocument()
    expect(screen.getByText('Floor A')).toBeInTheDocument()
  })

  it('lists each heat with its walk out and start times', async () => {
    mount()
    await lanes(1)
    expect(screen.getAllByText(`Walk out ${fmt(WALKOUT)}`)).toHaveLength(3)
    expect(screen.getAllByText(`Start ${fmt(START)}`)).toHaveLength(3)
  })

  it('names the judge at each lane, in lane order', async () => {
    mount()
    const rows = (await lanes(1)).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['Lane 1Jo Judge', 'Lane 2Kim Kane'])
  })

  // COM-118. "Lane 1" is printed on screen, not a bare 1 with the word kept
  // for screen readers only.
  it('prints the lane label in full', async () => {
    mount()
    const label = within((await lanes(1)).getAllByRole('listitem')[0]).getByText('Lane 1')
    expect(label.innerHTML).toBe('Lane 1')
  })

  // Three heats in a row against a limit of two: the third is the one to fix.
  it('flags the heat that runs a judge past the limit', async () => {
    mount()
    expect((await lanes(3)).getByText('Over 2 in a row')).toBeInTheDocument()
    expect((await lanes(2)).queryByText(/in a row/)).not.toBeInTheDocument()
  })

  // The run is a fact about the judge's day, not about what is on screen.
  it('keeps flagging a run the search has broken up', async () => {
    mount()
    await lanes(1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search judge' }), { target: { value: 'jo' } })
    expect(screen.queryByText('Kim Kane')).not.toBeInTheDocument()
    expect((await lanes(3)).getByText('Over 2 in a row')).toBeInTheDocument()
  })

  it('drops the heats and workouts a search does not match', async () => {
    mount()
    await lanes(1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search judge' }), { target: { value: 'kim' } })
    expect(screen.getByText('Kim Kane')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Heat 2 judges' })).not.toBeInTheDocument()
  })

  it('says so when a search matches nobody', async () => {
    mount()
    await lanes(1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search judge' }), { target: { value: 'zeb' } })
    expect(await screen.findByText('Nobody by that name')).toBeInTheDocument()
  })

  it('offers no search when there are no judges to search for', async () => {
    serve({ judges: [], workouts: [] })
    mount()
    await screen.findByText('No judges yet')
    expect(screen.queryByRole('searchbox', { name: 'Search judge' })).not.toBeInTheDocument()
  })
})
