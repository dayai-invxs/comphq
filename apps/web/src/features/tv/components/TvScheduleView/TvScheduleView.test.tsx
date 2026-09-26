import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { fmtHeatTime } from '@/lib/heatTime'
import type { Heat, OpsData, WorkoutData } from '@/lib/opsHeats'
import { TvScheduleView } from './TvScheduleView'

// v1: ScheduleView in src/app/[slug]/TV/page.tsx. The half of the scoreboard
// that says who is on next — the next three heats across every active workout,
// whichever workout they belong to.

const START = Date.parse('2026-08-27T09:00:00.000Z')

function heat(heatNumber: number, over: Partial<Heat> = {}): Heat {
  return {
    heatNumber,
    isComplete: false,
    entries: [
      {
        athleteId: heatNumber * 10 + 1,
        athleteName: `Athlete ${heatNumber}A`,
        bibNumber: null,
        divisionName: 'RX',
        lane: 2,
        scoreDisplay: null,
        tiebreakDisplay: null,
      },
      {
        athleteId: heatNumber * 10 + 2,
        athleteName: `Athlete ${heatNumber}B`,
        bibNumber: null,
        divisionName: 'Scaled',
        lane: 1,
        scoreDisplay: null,
        tiebreakDisplay: null,
      },
    ],
    ...over,
  }
}

function workout(over: Partial<WorkoutData> = {}): WorkoutData {
  return {
    id: 1,
    number: 1,
    name: 'Fran',
    status: 'active',
    locationName: 'Main Floor',
    startTime: new Date(START).toISOString(),
    heatIntervalSecs: 540,
    timeBetweenHeatsSecs: 60,
    callTimeSecs: 300,
    walkoutTimeSecs: 120,
    heatStartOverrides: {},
    heats: [heat(1), heat(2), heat(3), heat(4)],
    ...over,
  }
}

function draw(data: OpsData | undefined, checks: Record<string, { corral: boolean; walkout: boolean }> = {}, error: Error | null = null) {
  return render(<TvScheduleView data={data} error={error} checks={checks} />)
}

/** One heat on the board, which is what the room reads: a workout, a clock and
    the lanes under it. */
const card = (heatNumber: number, workoutNumber = 1) =>
  within(screen.getByRole('region', { name: `Heat ${heatNumber}, workout ${workoutNumber}` }))

/** The queue, in the order the board shows it. */
const queued = () => screen.getAllByRole('region').map((c) => c.getAttribute('aria-label'))

it('says what went wrong rather than showing an empty board', () => {
  draw(undefined, {}, new Error('ops is down'))
  expect(screen.getByText('Cannot reach the schedule')).toBeInTheDocument()
  expect(screen.getByText('ops is down')).toBeInTheDocument()
})

it('says it is still reading', () => {
  draw(undefined)
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

// The board is for the floor, so a workout nobody is running is not on it.
it('ignores workouts that are not active', () => {
  draw({ workouts: [workout({ status: 'pending' })], showBib: false })
  expect(screen.getByText('Nothing on the floor')).toBeInTheDocument()
})

it('says so when every heat of an active workout has walked out', () => {
  const checks = Object.fromEntries(
    [1, 2, 3, 4].map((n) => [`1-${n}`, { corral: true, walkout: true }]),
  )
  draw({ workouts: [workout()], showBib: false }, checks)
  expect(screen.getByText('Nothing on the floor')).toBeInTheDocument()
})

// Three fits across a screen at a size someone can read from the far wall.
it('shows the next three heats and no more', () => {
  draw({ workouts: [workout()], showBib: false })
  expect(queued()).toEqual([
    'Heat 1, workout 1',
    'Heat 2, workout 1',
    'Heat 3, workout 1',
  ])
})

// Amber is the one signal a wall read from thirty feet has room for, and it is
// spent on the heat that is running rather than on three of them.
it('marks the heat on the floor as live, and only that one', () => {
  draw({ workouts: [workout()], showBib: false })
  expect(card(1).getByText('Now')).toBeInTheDocument()
  expect(screen.getAllByRole('status')).toHaveLength(1)
})

// A heat leaves the board when the corral marshal ticks it out, not when it
// finishes — by then the crowd is watching it, not reading about it.
it('drops a heat once it has walked out and pulls the next one up', () => {
  draw({ workouts: [workout()], showBib: false }, { '1-1': { corral: true, walkout: true } })
  expect(queued()).toEqual([
    'Heat 2, workout 1',
    'Heat 3, workout 1',
    'Heat 4, workout 1',
  ])
})

// Two workouts run at once on a big floor, and the board is ordered by the
// clock rather than by which workout a heat belongs to.
it('interleaves heats from every active workout by start time', () => {
  const early = workout({ id: 1, number: 1, name: 'Fran', heats: [heat(1)] })
  const later = workout({
    id: 2,
    number: 2,
    name: 'Grace',
    startTime: new Date(START - 600_000).toISOString(),
    heats: [heat(1)],
  })
  draw({ workouts: [early, later], showBib: false })
  expect(queued()).toEqual(['Heat 1, workout 2', 'Heat 1, workout 1'])
})

// A workout with no start time has no place in a queue ordered by time, so it
// goes to the back rather than to the front, where a null would sort it.
it('puts heats with no start time last', () => {
  const timed = workout({ id: 1, number: 1, heats: [heat(1)] })
  const untimed = workout({ id: 2, number: 2, name: 'Grace', startTime: null, heats: [heat(1)] })
  draw({ workouts: [untimed, timed], showBib: false })
  expect(queued()).toEqual(['Heat 1, workout 1', 'Heat 1, workout 2'])
})

it('names the workout, where it is, and which divisions are in the heat', () => {
  draw({ workouts: [workout({ heats: [heat(1)] })], showBib: false })
  const first = card(1)
  expect(first.getByText(/Workout 1: Fran/)).toBeInTheDocument()
  expect(first.getByText(/Main Floor/)).toBeInTheDocument()
  expect(first.getByText('RX / Scaled')).toBeInTheDocument()
})

// The countdown a heat runs on: called to the corral, walked out, started.
it('counts the heat down from corral to walkout to start', () => {
  draw({ workouts: [workout({ heats: [heat(1)] })], showBib: false })
  const times = card(1)
    .getAllByRole('term')
    .map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
  expect(times).toEqual([
    ['Corral', fmtHeatTime(START - 300_000)],
    ['Walk out', fmtHeatTime(START - 120_000)],
    ['Start', fmtHeatTime(START)],
  ])
})

it('leaves the times off a heat that has no start time', () => {
  draw({ workouts: [workout({ startTime: null, heats: [heat(1)] })], showBib: false })
  expect(screen.queryByText('Corral')).not.toBeInTheDocument()
})

// An athlete finds themselves by lane number, so the lanes read in order
// however the endpoint happened to serve them.
it('lists the lanes in order, with the athlete and their division', () => {
  draw({ workouts: [workout({ heats: [heat(1)] })], showBib: false })
  const lanes = within(card(1).getByRole('list', { name: 'Heat 1 lanes' })).getAllByRole('listitem')
  expect(lanes.map((l) => l.textContent)).toEqual([
    'L1Athlete 1BScaled',
    'L2Athlete 1ARX',
  ])
})
