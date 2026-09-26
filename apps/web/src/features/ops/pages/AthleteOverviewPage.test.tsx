import { Route } from 'react-router'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { fmtHeatTime } from '@/lib/heatTime'
import { AthleteOverviewPage } from './AthleteOverviewPage'

// The screen answers two questions and the tests follow them: "where is this
// one athlete", which the search resolves, and "what is on the floor", which
// is what it shows when nobody has been asked about.

const { apiGet, useRealtimeInvalidation } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/useRealtimeInvalidation', () => ({ useRealtimeInvalidation }))

const START = Date.parse('2026-08-26T09:00:00.000Z')

const entry = (
  athleteId: number,
  athleteName: string,
  lane: number,
  over: { divisionName?: string | null; bibNumber?: string | null; scoreDisplay?: string | null; tiebreakDisplay?: string | null } = {},
) => ({
  athleteId,
  athleteName,
  lane,
  divisionName: over.divisionName ?? 'Rx',
  bibNumber: over.bibNumber ?? null,
  scoreDisplay: over.scoreDisplay ?? null,
  tiebreakDisplay: over.tiebreakDisplay ?? null,
})

const OPS = {
  showBib: false,
  workouts: [
    {
      id: 7,
      number: 1,
      name: 'Fran',
      status: 'active',
      locationName: 'Floor A',
      startTime: '2026-08-26T09:00:00.000Z',
      heatIntervalSecs: 600,
      timeBetweenHeatsSecs: 0,
      callTimeSecs: 300,
      walkoutTimeSecs: 120,
      heatStartOverrides: {},
      heats: [
        {
          heatNumber: 1,
          isComplete: true,
          entries: [
            entry(2, 'Bob Brown', 3, { scoreDisplay: '4:10', tiebreakDisplay: '1:30' }),
            entry(1, 'Ada Ant', 1, { bibNumber: '12', scoreDisplay: '3:01' }),
          ],
        },
        {
          heatNumber: 2,
          isComplete: false,
          entries: [entry(3, 'Cy Cat', 1, { divisionName: 'Scaled', scoreDisplay: '5:00' })],
        },
      ],
    },
    {
      id: 8,
      number: 2,
      name: 'Grace',
      status: 'draft',
      locationName: null,
      startTime: null,
      heatIntervalSecs: 600,
      timeBetweenHeatsSecs: 0,
      callTimeSecs: 300,
      walkoutTimeSecs: 120,
      heatStartOverrides: {},
      heats: [],
    },
    {
      id: 9,
      number: 3,
      name: 'Helen',
      status: 'active',
      locationName: 'Floor B',
      startTime: '2026-08-26T11:00:00.000Z',
      heatIntervalSecs: 600,
      timeBetweenHeatsSecs: 0,
      callTimeSecs: 300,
      walkoutTimeSecs: 120,
      heatStartOverrides: {},
      heats: [
        { heatNumber: 1, isComplete: false, entries: [entry(1, 'Ada Ant', 4, { bibNumber: '12' })] },
      ],
    },
  ],
}

function serve(ops: unknown = OPS) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(ops)
    return Promise.resolve({ url: null })
  })
}

function mount() {
  return renderRoutes(<Route path=":slug" element={<AthleteOverviewPage />} />, ['/summer'])
}

function search(term: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search athlete' }), { target: { value: term } })
}

async function heatTable(number: number, workout = 'Workout 1: Fran') {
  const panel = await screen.findByRole('region', { name: workout })
  return within(panel).getByRole('table', { name: `Heat ${number} lanes` })
}

/** The panel a resolved athlete's day is drawn in. */
async function timeline(name: string) {
  return within(await screen.findByRole('region', { name })).getAllByRole('listitem')
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('AthleteOverviewPage', () => {
  it('reads the ops state for the slug in the address', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    expect(apiGet).toHaveBeenCalledWith('/api/ops?slug=summer')
  })

  it('announces that it is loading until the first answer arrives', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('says so when the competition has no workouts', async () => {
    serve({ showBib: false, workouts: [] })
    mount()
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument()
  })

  // A failed read is not an empty floor, and it must not shimmer for ever.
  it('says the read failed rather than shimmering for ever', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the heats')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  // The schedule shows what is running; this screen is the whole competition,
  // draft workouts included.
  it('shows every workout whatever its status, with the status beside it', async () => {
    mount()
    expect(await screen.findByRole('region', { name: 'Workout 1: Fran' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workout 2: Grace' })).toBeInTheDocument()
    expect(screen.getAllByText('Active')).toHaveLength(2)
    expect(screen.getByText('INactive')).toBeInTheDocument()
  })

  it('says when a workout has no heats yet', async () => {
    mount()
    expect(await screen.findByText('No heats assigned.')).toBeInTheDocument()
  })

  it('names the heat, its start, its divisions, and marks a finished one done', async () => {
    mount()
    const panel = within(await screen.findByRole('region', { name: 'Workout 1: Fran' }))
    expect(panel.getByText('Heat 1')).toBeInTheDocument()
    expect(panel.getByText(fmtHeatTime(START))).toBeInTheDocument()
    expect(panel.getByText('Rx')).toBeInTheDocument()
    expect(panel.getByText(fmtHeatTime(START + 600_000))).toBeInTheDocument()
    expect(panel.getAllByText('Done')).toHaveLength(1)
  })

  it('lists the athletes of a heat by lane', async () => {
    mount()
    const rows = within(await heatTable(1)).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['1', '3'])
  })

  // A score is only the truth once the heat is over.
  it('shows the score and tiebreak of a finished heat and nothing for a running one', async () => {
    mount()
    expect(within(await heatTable(1)).getByText('3:01')).toBeInTheDocument()
    expect(within(await heatTable(1)).getByText(/TB 1:30/)).toBeInTheDocument()
    expect(within(await heatTable(2)).queryByText('5:00')).not.toBeInTheDocument()
  })

  it('leaves the bib column out when the competition does not use bibs', async () => {
    mount()
    expect(within(await heatTable(1)).queryByRole('columnheader', { name: 'Bib' })).not.toBeInTheDocument()
  })

  it('shows bib numbers when the competition uses them', async () => {
    serve({ ...OPS, showBib: true })
    mount()
    const table = await heatTable(1)
    expect(within(table).getByRole('columnheader', { name: 'Bib' })).toBeInTheDocument()
    expect(within(table).getByText('12')).toBeInTheDocument()
  })

  // One match is an answer, not a shortlist.
  it('resolves a search that names one athlete straight to their day', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('ada')
    const stops = await timeline('Ada Ant')
    expect(stops).toHaveLength(2)
    expect(stops[0]).toHaveTextContent('Workout 1 · Fran')
    expect(stops[0]).toHaveTextContent('Heat 1 · Lane 1')
    expect(stops[0]).toHaveTextContent('Floor A')
  })

  it('puts an athlete’s stops in the order they run them', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('ada')
    const stops = await timeline('Ada Ant')
    expect(stops[0]).toHaveTextContent(fmtHeatTime(START))
    expect(stops[1]).toHaveTextContent(fmtHeatTime(Date.parse('2026-08-26T11:00:00.000Z')))
    expect(stops[1]).toHaveTextContent('Workout 3 · Helen')
  })

  // COM-115
  it('shows when an athlete is due in the corral and at walk out', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('ada')
    const stops = await timeline('Ada Ant')
    expect(stops[0]).toHaveTextContent(`Corral ${fmtHeatTime(START - 300_000)}`)
    expect(stops[0]).toHaveTextContent(`Walk out ${fmtHeatTime(START - 120_000)}`)
  })

  it('names the athlete by division and bib', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('ada')
    expect(within(await screen.findByRole('region', { name: 'Ada Ant' })).getByText('Rx · Bib 12')).toBeInTheDocument()
  })

  it('finds an athlete by bib number', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('12')
    expect(await screen.findByRole('region', { name: 'Ada Ant' })).toBeInTheDocument()
  })

  it('offers a shortlist when a search names more than one', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('a')
    const list = within(await screen.findByRole('region', { name: '2 matches' }))
    expect(list.getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Ada Ant'),
      expect.stringContaining('Cy Cat'),
    ])
  })

  it('opens the athlete picked out of the shortlist', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('a')
    fireEvent.click(screen.getByRole('button', { name: /Cy Cat/ }))
    expect(await screen.findByRole('region', { name: 'Cy Cat' })).toBeInTheDocument()
  })

  it('says so, and offers a way out, when it does not know the name', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('zeb')
    expect(await screen.findByText('Nobody by that name')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show the floor' }))
    expect(await screen.findByRole('region', { name: 'Workout 1: Fran' })).toBeInTheDocument()
  })

  it('gives the floor back when the athlete is cleared', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    search('ada')
    await screen.findByRole('region', { name: 'Ada Ant' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByRole('region', { name: 'Workout 1: Fran' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ada Ant' })).not.toBeInTheDocument()
  })

  it('refreshes on a live event for this competition', async () => {
    mount()
    await screen.findAllByText('Ada Ant')
    expect(useRealtimeInvalidation).toHaveBeenCalledWith([
      ['ops', 'summer'],
      ['schedule', 'summer'],
      ['leaderboard', 'summer'],
    ])
  })
})
