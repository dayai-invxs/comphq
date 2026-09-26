import { Route } from 'react-router'
import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { TvPage } from './TvPage'

// v1: src/app/[slug]/TV/page.tsx. The gym display. Nobody touches it, so it
// turns itself between the two halves of the board and reads on a timer.

const { apiGet, useRealtimeInvalidation } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/useRealtimeInvalidation', () => ({ useRealtimeInvalidation }))

const OPS = {
  showBib: false,
  workouts: [
    {
      id: 7,
      number: 1,
      name: 'Fran',
      status: 'active',
      locationName: 'Main Floor',
      startTime: '2026-08-27T09:00:00.000Z',
      heatIntervalSecs: 540,
      timeBetweenHeatsSecs: 60,
      callTimeSecs: 300,
      walkoutTimeSecs: 120,
      heatStartOverrides: {},
      heats: [
        {
          heatNumber: 1,
          isComplete: false,
          entries: [{ athleteId: 1, athleteName: 'Ada', bibNumber: null, divisionName: 'RX', lane: 1 }],
        },
      ],
    },
  ],
}

const LEADERBOARD = {
  workouts: [{ id: 7, number: 1, name: 'Fran', scoreType: 'time', status: 'active' }],
  entries: [{
    athleteId: 1,
    athleteName: 'Ada',
    divisionName: 'RX',
    totalPoints: 6,
    workoutScores: { 7: { points: 6, display: '6:00', tiebreakDisplay: null } },
  }],
  halfWeightIds: [],
}

function mount(slug = 'summer') {
  return renderRoutes(<Route path=":slug/TV" element={<TvPage />} />, [`/${slug}/TV`])
}

// The board turns itself on a timer, so the clock is the one thing a test has
// to hold. Date is left real: the heat times are read off it.
const turn = () => act(() => { vi.advanceTimersByTime(10_000) })

/** The first heat on the board, which is what says the schedule has drawn. */
const drawn = () => screen.findByRole('region', { name: 'Heat 1, workout 1' })

/** What the board says it is showing. The schedule half also carries a live
    region — the amber now-badge — so this one is read off the header. */
const showing = () => within(screen.getByRole('banner')).getByRole('status')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(OPS)
    if (path.startsWith('/api/leaderboard')) return Promise.resolve(LEADERBOARD)
    if (path.startsWith('/api/checks')) return Promise.resolve({ athleteChecks: {}, equipChecks: {} })
    return Promise.resolve(null)
  })
})

afterEach(() => { vi.useRealTimers() })

it('reads the three things the board is drawn from, for the competition in the address', async () => {
  mount()
  await drawn()
  expect(apiGet).toHaveBeenCalledWith('/api/ops?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/leaderboard?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/checks?slug=summer')
})

it('opens on the schedule', async () => {
  mount()
  expect(await screen.findByRole('heading', { name: 'Competition Schedule', level: 1 })).toBeInTheDocument()
  expect(await drawn()).toBeInTheDocument()
})

// Nobody is going to press anything, so the board turns itself.
it('turns to the leaderboard on its own, and back again', async () => {
  mount()
  await drawn()

  turn()
  expect(screen.getByRole('heading', { name: 'Leaderboard', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('list', { name: 'RX standings' })).toBeInTheDocument()

  turn()
  expect(screen.getByRole('heading', { name: 'Competition Schedule', level: 1 })).toBeInTheDocument()
})

it('says which of the two halves is up', async () => {
  mount()
  await drawn()
  expect(showing()).toHaveTextContent('Competition Schedule')
  turn()
  expect(showing()).toHaveTextContent('Leaderboard')
})

// The page threads the leaderboard read's failure down, the same way it
// already threads the schedule's.
it('says on the leaderboard half when its read failed', async () => {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(OPS)
    if (path.startsWith('/api/leaderboard')) return Promise.reject(new Error('boom'))
    return Promise.resolve({ athleteChecks: {}, equipChecks: {} })
  })
  mount()
  await drawn()
  turn()
  expect(await screen.findByText('Cannot reach the standings')).toBeInTheDocument()
})

// A score landing has to reach the board without waiting out the poll.
it('subscribes to the keys its own reads are cached under', async () => {
  mount()
  await drawn()
  expect(useRealtimeInvalidation).toHaveBeenCalledWith([
    ['ops', 'summer'],
    ['leaderboard', 'summer'],
    ['checks', 'summer'],
  ])
})

// v1 compiled the QR target in as ruggedrumble's athlete list, so every board
// ever printed sent the room to one competition whatever it was showing
// (defect 27). The address is now the board's own.
it('points its QR code at the athlete list of the competition it is showing', async () => {
  mount()
  await drawn()
  expect(screen.getByText('Scan for Comp Info →')).toBeInTheDocument()
  expect(screen.getByTitle(`${window.location.origin}/summer/athlete-overview`)).toBeInTheDocument()
  expect(screen.queryByTitle(/ruggedrumble/)).not.toBeInTheDocument()
})

it('sends the room to whichever competition the board was opened with', async () => {
  mount('winter')
  await drawn()
  expect(screen.getByTitle(`${window.location.origin}/winter/athlete-overview`)).toBeInTheDocument()
})

// The board is one screen with no scrollbar and nobody near it, so anything
// taller than the screen is shrunk rather than cut off.
it('shrinks a board taller than the screen', async () => {
  mount()
  const stage = await screen.findByTestId('tv-content')
  Object.defineProperty(stage.parentElement!, 'clientHeight', { value: 1000, configurable: true })
  Object.defineProperty(stage, 'scrollHeight', { value: 2000, configurable: true })
  turn()
  expect(stage.style.transform).toBe('scale(0.5)')
})
