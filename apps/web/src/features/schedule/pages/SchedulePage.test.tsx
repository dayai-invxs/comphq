import { Route } from 'react-router'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { fmtHeatTime } from '@/lib/heatTime'
import { SchedulePage } from './SchedulePage'

// What a spectator has to be able to do: see which heat is on the floor, read
// its lanes, and find when the one they came for walks out. The assertions are
// about that, not about which component draws it.

const { apiGet, useRealtimeInvalidation } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/useRealtimeInvalidation', () => ({ useRealtimeInvalidation }))

const START = Date.parse('2026-08-26T09:00:00.000Z')

const entry = (athleteId: number, athleteName: string, lane: number, divisionName: string | null, bibNumber: string | null = null) =>
  ({ athleteId, athleteName, bibNumber, divisionName, lane })

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
          isComplete: false,
          entries: [entry(2, 'Bob Brown', 3, 'Rx'), entry(1, 'Ada Ant', 1, 'Rx', '12')],
        },
        { heatNumber: 2, isComplete: false, entries: [entry(3, 'Cy Cat', 1, 'Scaled')] },
      ],
    },
    {
      id: 8,
      number: 2,
      name: 'Grace',
      status: 'draft',
      locationName: null,
      startTime: '2026-08-26T11:00:00.000Z',
      heatIntervalSecs: 600,
      timeBetweenHeatsSecs: 0,
      callTimeSecs: 300,
      walkoutTimeSecs: 120,
      heatStartOverrides: {},
      heats: [{ heatNumber: 1, isComplete: false, entries: [entry(1, 'Ada Ant', 1, 'Rx')] }],
    },
  ],
}

const CHECKS = { athleteChecks: {}, equipChecks: {} }

function serve(ops: unknown = OPS, checks: unknown = CHECKS) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(ops)
    if (path.startsWith('/api/checks')) return Promise.resolve(checks)
    return Promise.resolve({ url: null })
  })
}

function mount() {
  return renderRoutes(<Route path=":slug" element={<SchedulePage />} />, ['/summer'])
}

/** The heat on the floor, whichever one that currently is. */
async function now(workoutNumber: number, heatNumber: number) {
  return screen.findByRole('region', {
    name: `Now: workout ${workoutNumber}, heat ${heatNumber}`,
  })
}

async function upNext() {
  return within(await screen.findByRole('region', { name: 'Up next' })).getAllByRole('listitem')
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('SchedulePage', () => {
  it('reads the ops and check state for the slug in the address', async () => {
    mount()
    await now(1, 1)
    expect(apiGet).toHaveBeenCalledWith('/api/ops?slug=summer')
    expect(apiGet).toHaveBeenCalledWith('/api/checks?slug=summer')
  })

  it('announces that it is loading until the first answer arrives', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('puts the first heat still to run on the floor, named', async () => {
    mount()
    const strip = await now(1, 1)
    expect(within(strip).getByText('Now')).toBeInTheDocument()
    expect(within(strip).getByText('Workout 1 · Fran')).toBeInTheDocument()
    expect(within(strip).getByText('Floor A')).toBeInTheDocument()
  })

  // v1 showed only running workouts. A draft one is not on the floor yet.
  it('leaves a draft workout off the board entirely', async () => {
    mount()
    await now(1, 1)
    expect(screen.queryByText(/Grace/)).not.toBeInTheDocument()
  })

  it('says so when nothing is waiting to run', async () => {
    serve({ showBib: false, workouts: [] })
    mount()
    expect(await screen.findByText('Nothing on the floor')).toBeInTheDocument()
  })

  // A failed read is not an empty floor, and it must not leave the skeleton
  // shimmering for ever either.
  it('says the read failed rather than shimmering for ever', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the schedule')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  it('lists the running heat by lane, whatever order the athletes came back in', async () => {
    mount()
    const lanes = within(await now(1, 1)).getAllByRole('listitem')
    expect(lanes.map((l) => l.textContent)).toEqual(['Lane 1Ada Ant', 'Lane 3Bob Brown'])
  })

  it('names the divisions in the running heat, once each', async () => {
    mount()
    expect(within(await now(1, 1)).getByText('Rx')).toBeInTheDocument()
  })

  it('counts the corral and walk-out back from the heat start', async () => {
    mount()
    const clocks = within(await now(1, 1))
    expect(clocks.getByText('Corral').nextElementSibling).toHaveTextContent(fmtHeatTime(START - 300_000))
    expect(clocks.getByText('Walk out').nextElementSibling).toHaveTextContent(fmtHeatTime(START - 120_000))
    expect(clocks.getByText('Start').nextElementSibling).toHaveTextContent(fmtHeatTime(START))
  })

  it('queues the rest behind it, one line each, in clock order', async () => {
    mount()
    const rows = await upNext()
    expect(rows).toHaveLength(1)
    // Heat 2 is one interval later than heat 1.
    expect(rows[0]).toHaveTextContent(fmtHeatTime(START + 600_000))
    expect(rows[0]).toHaveTextContent('Workout 1 · Heat 2')
    expect(rows[0]).toHaveTextContent('Scaled')
  })

  it('keeps a queued heat closed until it is asked to open', async () => {
    mount()
    const [row] = await upNext()
    const toggle = within(row).getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(row).queryByText('Cy Cat')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(row).getByText('Cy Cat')).toBeInTheDocument()
  })

  it('keeps bib numbers off the board until the competition turns them on', async () => {
    mount()
    const lanes = within(await now(1, 1)).getAllByRole('listitem')
    expect(lanes[0].textContent).not.toMatch(/12/)
  })

  it('shows bib numbers when it does', async () => {
    serve({ ...OPS, showBib: true })
    mount()
    const lanes = within(await now(1, 1)).getAllByRole('listitem')
    expect(lanes[0]).toHaveTextContent('Bib 12')
    // v1 drew an em dash for an athlete without one.
    expect(lanes[1]).toHaveTextContent('Bib —')
  })

  // The check is what the corral marshal ticks. Once a heat has walked out it
  // is off the schedule the crowd reads.
  it('moves the floor on once a heat has walked out', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: true } }, equipChecks: {} })
    mount()
    await now(1, 2)
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
  })

  it('clears the board when every heat has walked out', async () => {
    serve(OPS, {
      athleteChecks: { '7-1': { walkout: true }, '7-2': { walkout: true } },
      equipChecks: {},
    })
    mount()
    expect(await screen.findByText('Nothing on the floor')).toBeInTheDocument()
    expect(screen.queryByText(/Fran/)).not.toBeInTheDocument()
  })

  // A score landing has to reach this screen without waiting out the poll.
  it('subscribes to the keys its own reads are cached under', async () => {
    mount()
    await now(1, 1)
    expect(useRealtimeInvalidation).toHaveBeenCalledWith([
      ['ops', 'summer'],
      ['leaderboard', 'summer'],
      ['checks', 'summer'],
    ])
  })
})
