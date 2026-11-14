import { Route } from 'react-router'
import { act, screen, waitFor, within } from '@testing-library/react'
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

it('shows the competition\'s own logo in the bar', async () => {
  const base = apiGet.getMockImplementation()!
  apiGet.mockImplementation((path: string) =>
    path === '/api/logo?slug=summer' ? Promise.resolve({ url: 'https://cdn.example/logos/1/logo.png?v=1' }) : base(path))
  mount()
  expect(await screen.findByRole('img', { name: 'Competition logo' }))
    .toHaveAttribute('src', 'https://cdn.example/logos/1/logo.png?v=1')
})

it('shows no logo when the competition has none', async () => {
  mount()
  await drawn()
  expect(screen.queryByRole('img', { name: 'Competition logo' })).not.toBeInTheDocument()
})

it('reads the three things the board is drawn from, for the competition in the address', async () => {
  mount()
  await drawn()
  expect(apiGet).toHaveBeenCalledWith('/api/ops?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/leaderboard?slug=summer')
  expect(apiGet).toHaveBeenCalledWith('/api/checks?slug=summer')
})

it('opens on the schedule', async () => {
  mount()
  expect(await screen.findByRole('heading', { name: 'Schedule', level: 1 })).toBeInTheDocument()
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
  expect(screen.getByRole('heading', { name: 'Schedule', level: 1 })).toBeInTheDocument()
})

it('says which of the two halves is up', async () => {
  mount()
  await drawn()
  expect(showing()).toHaveTextContent('Schedule')
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
  expect(useRealtimeInvalidation).toHaveBeenCalledWith('summer', [
    ['ops', 'summer'],
    ['leaderboard', 'summer'],
    ['checks', 'summer'],
  ])
})

// v1 compiled the QR target in as ruggedrumble's athlete list, so every board
// ever printed sent the room to one competition whatever it was showing
// (defect 27). The address is now the board's own.
it('points its QR code at the schedule of the competition it is showing', async () => {
  mount()
  await drawn()
  expect(screen.getByText('Scan for Comp Info →')).toBeInTheDocument()
  expect(screen.getByTitle(`${window.location.origin}/summer`)).toBeInTheDocument()
  expect(screen.queryByTitle(/ruggedrumble/)).not.toBeInTheDocument()
})

it('sends the room to whichever competition the board was opened with', async () => {
  mount('winter')
  await drawn()
  expect(screen.getByTitle(`${window.location.origin}/winter`)).toBeInTheDocument()
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

// ─── Fitting a big heat or a long division ─────────────────────────────────

/** A heat of `n` lanes, everyone in RX. */
function bigHeat(heatNumber: number, n: number) {
  return {
    heatNumber,
    isComplete: false,
    entries: Array.from({ length: n }, (_, i) => ({
      athleteId: heatNumber * 100 + i, athleteName: `Athlete ${heatNumber}-${i + 1}`,
      bibNumber: null, divisionName: 'RX', lane: i + 1,
    })),
  }
}

/** A division of `n` athletes, best first. */
const bigDivision = (n: number) => Array.from({ length: n }, (_, i) => ({
  athleteId: i + 1, athleteName: `Athlete ${i + 1}`, divisionName: 'RX',
  totalPoints: i + 1, workoutScores: { 7: { points: i + 1, display: '1:00', tiebreakDisplay: null } },
}))

function serve(ops: unknown, leaderboard: unknown) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(ops)
    if (path.startsWith('/api/leaderboard')) return Promise.resolve(typeof leaderboard === 'function' ? leaderboard() : leaderboard)
    if (path.startsWith('/api/checks')) return Promise.resolve({ athleteChecks: {}, equipChecks: {} })
    return Promise.resolve(null)
  })
}

/** jsdom lays nothing out, so the board's height is made to depend on what
    it draws, as a real one's does: 100 for the headers plus 40 for every row
    of the longest list on it. Returns how many times it has been measured. */
function screenOf(available: number) {
  const content = screen.getByTestId('tv-content')
  const measured = { count: 0 }
  Object.defineProperty(content.parentElement!, 'clientHeight', { value: available, configurable: true })
  Object.defineProperty(content, 'scrollHeight', {
    configurable: true,
    get() {
      measured.count += 1
      const lists = [...content.querySelectorAll('ul, ol')]
      return 100 + 40 * Math.max(0, ...lists.map((l) => l.querySelectorAll(':scope > li').length))
    },
  })
  return measured
}

// 18 lanes down one column is 820 high on a 600 screen. Two heats with their
// lanes in two columns of nine is 460, the first arrangement that fits — so
// the board draws that at full size, and the third heat goes in the strip.
it('gives a big heat more width before it shrinks anything', async () => {
  serve({ ...OPS, workouts: [{ ...OPS.workouts[0], heats: [bigHeat(1, 18), bigHeat(2, 18), bigHeat(3, 18)] }] }, LEADERBOARD)
  mount()
  await drawn()
  const stage = screen.getByTestId('tv-content')
  screenOf(600)
  turn()
  turn()

  expect(screen.getAllByRole('region', { name: /^Heat / }).map((r) => r.getAttribute('aria-label'))).toEqual([
    'Heat 1, workout 1', 'Heat 2, workout 1',
  ])
  expect(within(screen.getByRole('region', { name: 'Heat 1, workout 1' })).getAllByRole('list')
    .map((l) => l.getAttribute('aria-label'))).toEqual(['Heat 1 lanes 1–9', 'Heat 1 lanes 10–18'])
  expect(within(screen.getByRole('complementary', { name: 'Up next' })).getByText('Heat 3')).toBeInTheDocument()
  expect(stage.style.transform).toBe('')
})

it('splits a long division into two columns before it shrinks the leaderboard', async () => {
  serve(OPS, { ...LEADERBOARD, entries: bigDivision(30) })
  mount()
  await drawn()
  const stage = screen.getByTestId('tv-content')
  screenOf(800)
  turn()

  expect(screen.getByRole('list', { name: 'RX standings 1–15' })).toBeInTheDocument()
  expect(screen.getByRole('list', { name: 'RX standings 16–30' })).toBeInTheDocument()
  expect(stage.style.transform).toBe('')
})

// ─── Pace ───────────────────────────────────────────────────────────────────

it('turns at the pace the competition set', async () => {
  serve(OPS, { ...LEADERBOARD, tvSecondsPerScreen: 30 })
  mount()
  await drawn()
  await screen.findByRole('region', { name: 'Heat 1, workout 1' })
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/leaderboard?slug=summer'))
  await act(async () => { await Promise.resolve() })

  act(() => { vi.advanceTimersByTime(29_000) })
  expect(showing()).toHaveTextContent('Schedule')
  act(() => { vi.advanceTimersByTime(1_000) })
  expect(showing()).toHaveTextContent('Leaderboard')
})

// ─── What starts a fit ─────────────────────────────────────────────────────

// New standings arriving while the schedule is up change nothing on screen,
// so they do not set the schedule's arrangements going again; on the
// leaderboard half they do.
it('fits again for the reads of the half on screen, and only those', async () => {
  let points = 0
  serve(OPS, () => ({ ...LEADERBOARD, tvSecondsPerScreen: 60, entries: bigDivision(3).map((e) => ({ ...e, totalPoints: e.totalPoints + points })) }))
  mount()
  await drawn()
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/leaderboard?slug=summer'))
  const measured = screenOf(1000)

  const leaderboardReads = () => apiGet.mock.calls.filter(([p]) => String(p).startsWith('/api/leaderboard')).length
  const read = async () => {
    points += 1
    const before = leaderboardReads()
    await act(async () => { vi.advanceTimersByTime(15_000) })
    await waitFor(() => expect(leaderboardReads()).toBeGreaterThan(before))
    await act(async () => { await Promise.resolve() })
  }

  await read()
  expect(showing()).toHaveTextContent('Schedule')
  expect(measured.count).toBe(0)

  await act(async () => { vi.advanceTimersByTime(60_000) })
  expect(showing()).toHaveTextContent('Leaderboard')
  const onLeaderboard = measured.count
  expect(onLeaderboard).toBeGreaterThan(0)

  await read()
  expect(showing()).toHaveTextContent('Leaderboard')
  await waitFor(() => expect(measured.count).toBeGreaterThan(onLeaderboard))
})

// Heat 1 starts 09:00 with a 5-minute call, so its corral time is 08:55. The
// call is for the whole room: it stays up when the board turns.
it('puts the corral call over both the schedule and the leaderboard', async () => {
  vi.setSystemTime(Date.parse('2026-08-27T08:55:02.000Z'))
  mount()
  await drawn()
  const call = "It's time for Workout 1 Heat 1 to line up!"
  expect(await screen.findByRole('alert')).toHaveTextContent(call)
  turn()
  expect(screen.getByRole('heading', { name: 'Leaderboard', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(call)
  expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
})

// Sized for the room by whoever sets the screen up, and kept on that screen.
it('zooms the bar and the board with + and −, and remembers it', async () => {
  window.localStorage.removeItem('comphq:tvZoom')
  const { unmount } = mount()
  await drawn()
  const board = screen.getByRole('main')
  const bar = screen.getByRole('banner')
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(board.style.zoom).toBe('')

  act(() => { screen.getByRole('button', { name: 'Larger' }).click() })
  act(() => { screen.getByRole('button', { name: 'Larger' }).click() })
  expect(screen.getByText('120%')).toBeInTheDocument()
  expect(board.style.zoom).toBe('1.2')
  expect(bar.style.zoom).toBe('1.2')

  act(() => { screen.getByRole('button', { name: 'Smaller' }).click() })
  expect(screen.getByText('110%')).toBeInTheDocument()
  expect(window.localStorage.getItem('comphq:tvZoom')).toBe('1.1')

  unmount()
  mount()
  await drawn()
  expect(screen.getByText('110%')).toBeInTheDocument()
  expect(screen.getByRole('main').style.zoom).toBe('1.1')
  window.localStorage.removeItem('comphq:tvZoom')
})

it('stops at 50% and 200%', async () => {
  window.localStorage.setItem('comphq:tvZoom', '0.5')
  mount()
  await drawn()
  expect(screen.getByRole('button', { name: 'Smaller' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Larger' })).toBeEnabled()
  window.localStorage.removeItem('comphq:tvZoom')
})
