import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Score, Workout } from '../../useWorkoutDetail'
import { WorkoutLeaderboard } from './WorkoutLeaderboard'

// v1: src/components/workout-detail/WorkoutLeaderboard.tsx. One workout's
// standings, and the only ordering rule is the one v1 has: the lowest total
// placing wins, and Part B counts only where the workout has one.

const athlete = (id: number, name: string, division: { id: number; name: string; order: number } | null = null) => ({
  id,
  name,
  bibNumber: null,
  division,
})

const score = (over: Partial<Score> & { id: number; athleteId: number; name: string }): Score => ({
  rawScore: 192_050,
  tiebreakRawScore: null,
  points: 1,
  partBRawScore: null,
  partBPoints: null,
  capped: false,
  partBCapped: false,
  athlete: athlete(over.athleteId, over.name),
  ...over,
})

const WORKOUT: Workout = {
  id: 7,
  number: 3,
  name: 'Fran',
  description: null,
  scoreType: 'time',
  lanes: 2,
  heatIntervalSecs: 600,
  timeBetweenHeatsSecs: 0,
  callTimeSecs: 300,
  walkoutTimeSecs: 120,
  startTime: null,
  status: 'active',
  mixedHeats: false,
  tiebreakEnabled: false,
  tiebreakScoreType: 'time',
  partBEnabled: false,
  partBScoreType: 'weight',
  halfWeight: false,
  locationId: null,
  heatStartOverrides: {},
  completedHeats: [],
  assignments: [],
  scores: [],
}

const mount = (over: Partial<Workout> = {}) =>
  render(<WorkoutLeaderboard workout={{ ...WORKOUT, ...over }} />)

const names = () =>
  screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)

describe('who is listed', () => {
  it('names the workout it ranks', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Leaderboard — WOD 3' })).toBeInTheDocument()
  })

  it('orders by total placing, lowest first', () => {
    mount({
      scores: [
        score({ id: 1, athleteId: 1, name: 'Ann Adams', points: 3 }),
        score({ id: 2, athleteId: 2, name: 'Bob Brown', points: 1 }),
        score({ id: 3, athleteId: 3, name: 'Cal Cook', points: 2 }),
      ],
    })
    expect(names()).toEqual(['Bob Brown', 'Cal Cook', 'Ann Adams'])
  })

  // A score with no placing has not been ranked, so it has nothing to be
  // ordered by and v1 leaves it out entirely.
  it('leaves out an athlete who has not been placed', () => {
    mount({
      scores: [
        score({ id: 1, athleteId: 1, name: 'Ann Adams', points: null }),
        score({ id: 2, athleteId: 2, name: 'Bob Brown', points: 1 }),
      ],
    })
    expect(names()).toEqual(['Bob Brown'])
  })
})

describe('what each row shows', () => {
  it('shows the placing and the score behind it', () => {
    mount({ scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams', points: 2 })] })
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('3:12.05')).toBeInTheDocument()
  })

  it('shows the tiebreak that broke it', () => {
    mount({ scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams', tiebreakRawScore: 5_000 })] })
    expect(screen.getByText('TB 0:05.00')).toBeInTheDocument()
  })

  // With two parts the tiebreak column has no room, and Part A's tiebreak is
  // not what ordered the row anyway.
  it('hides the tiebreak once the workout has a Part B', () => {
    mount({
      partBEnabled: true,
      scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams', tiebreakRawScore: 5_000 })],
    })
    expect(screen.queryByText(/^TB /)).not.toBeInTheDocument()
  })
})

describe('a workout with two parts', () => {
  const twoPart = (over: Partial<Score>) => ({
    partBEnabled: true,
    scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams', points: 2, ...over })],
  })

  it('gives Part B a column of its own', () => {
    mount()
    expect(screen.queryByRole('columnheader', { name: 'Part B' })).not.toBeInTheDocument()
    mount(twoPart({ partBPoints: 3, partBRawScore: 100 }))
    expect(screen.getByRole('columnheader', { name: 'Part B' })).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('draws a dash where Part B has not been placed', () => {
    mount(twoPart({ partBPoints: null }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('totals the two placings, and counts only Part A without one', () => {
    mount(twoPart({ points: 2, partBPoints: 3 }))
    expect(screen.getAllByRole('row')[1].textContent).toContain('5')
    mount({ scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams', points: 2, partBPoints: 3 })] })
    expect(screen.getAllByRole('row')[1].textContent).toContain('2')
  })

  it('orders on the two placings together', () => {
    mount({
      partBEnabled: true,
      scores: [
        score({ id: 1, athleteId: 1, name: 'Ann Adams', points: 1, partBPoints: 8 }),
        score({ id: 2, athleteId: 2, name: 'Bob Brown', points: 4, partBPoints: 1 }),
      ],
    })
    expect(names()).toEqual(['Bob Brown', 'Ann Adams'])
  })
})

describe('one workout, one part', () => {
  it('heads its columns Position and Score, not Part A', () => {
    mount({ scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams', points: 2 })] })
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Athlete/Team', 'Position', 'Score', 'Points'])
  })

  it('keeps Part A and Part B when the workout has both', () => {
    mount({ partBEnabled: true, scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams' })] })
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Athlete/Team', 'Part A', 'Part B', 'Points'])
  })
})

describe('divisions', () => {
  const RX = { id: 1, name: 'Rx', order: 1 }
  const SCALED = { id: 2, name: 'Scaled', order: 2 }

  it('gives each division its own table, in running order', () => {
    mount({
      scores: [
        score({ id: 1, athleteId: 1, name: 'Sam Scaled', points: 1, athlete: athlete(1, 'Sam Scaled', SCALED) }),
        score({ id: 2, athleteId: 2, name: 'Rae Rx', points: 2, athlete: athlete(2, 'Rae Rx', RX) }),
        score({ id: 3, athleteId: 3, name: 'Rob Rx', points: 1, athlete: athlete(3, 'Rob Rx', RX) }),
        score({ id: 4, athleteId: 4, name: 'Nia None', points: 1 }),
      ],
    })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Rx', 'Scaled', 'No Division'])
    const rx = screen.getByRole('table', { name: 'Leaderboard for WOD 3, Rx' })
    expect(within(rx).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent))
      .toEqual(['Rob Rx', 'Rae Rx'])
    expect(within(screen.getByRole('table', { name: 'Leaderboard for WOD 3, Scaled' })).getByText('Sam Scaled')).toBeInTheDocument()
  })

  it('draws no division headings when nobody has a division', () => {
    mount({ scores: [score({ id: 1, athleteId: 1, name: 'Ann Adams' })] })
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })
})
