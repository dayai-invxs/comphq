import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { LeaderboardData, LeaderboardEntry } from '@/api/liveReads'
import { TvLeaderboardView } from './TvLeaderboardView'

// v1: LeaderboardView in src/app/[slug]/TV/page.tsx. The other half of the
// scoreboard — one panel per division, in the order the setup screen set, each
// showing as much of its division as that screen asked for.
//
// The ranking is the API's. This shows the rows in the order it was handed
// them, and numbers them by position.

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    athleteId: 1,
    athleteName: 'Ada',
    divisionName: 'RX',
    totalPoints: 6,
    workoutScores: { 1: { points: 6, display: '6:00', tiebreakDisplay: null } },
    ...over,
  }
}

function data(over: Partial<LeaderboardData> = {}): LeaderboardData {
  return {
    workouts: [{ id: 1, number: 1, name: 'Fran', scoreType: 'time', status: 'active' }],
    entries: [entry()],
    halfWeightIds: [],
    ...over,
  }
}

/** One division's standings, which is the unit the room reads. */
const standings = (division: string) => within(screen.getByRole('list', { name: `${division} standings` }))
const rows = (division: string) => standings(division).getAllByRole('listitem').map((r) => r.textContent)

it('says it is still reading', () => {
  render(<TvLeaderboardView data={undefined} />)
  expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

// A failed read is not "No scores yet": that would tell a room mid-competition
// that nobody has scored anything.
it('says the read failed rather than claiming there are no scores', () => {
  render(<TvLeaderboardView data={undefined} error={new Error('boom')} />)
  expect(screen.getByText('Cannot reach the standings')).toBeInTheDocument()
  expect(screen.queryByText('No scores yet')).not.toBeInTheDocument()
  expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
})

it('says there is nothing to show before the first workout exists', () => {
  render(<TvLeaderboardView data={data({ workouts: [] })} />)
  expect(screen.getByText('No scores yet')).toBeInTheDocument()
})

it('says there is nothing to show before anyone is entered', () => {
  render(<TvLeaderboardView data={data({ entries: [] })} />)
  expect(screen.getByText('No scores yet')).toBeInTheDocument()
})

it('gives every division its own panel, in the order the setup screen set', () => {
  render(<TvLeaderboardView data={data({
    entries: [
      entry({ athleteId: 1, divisionName: 'Scaled' }),
      entry({ athleteId: 2, divisionName: 'RX' }),
    ],
    tvLeaderboardOrder: { RX: 1, Scaled: 2 },
  })} />)
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['RX', 'Scaled'])
})

it('names the panel for athletes who are in no division', () => {
  render(<TvLeaderboardView data={data({ entries: [entry({ divisionName: null })] })} />)
  expect(screen.getByRole('heading', { name: 'No Division' })).toBeInTheDocument()
  expect(standings('No Division').getByText('Ada')).toBeInTheDocument()
})

it('numbers the rows by position and shows what each athlete has', () => {
  render(<TvLeaderboardView data={data({
    entries: [
      entry({ athleteId: 1, athleteName: 'Ada', totalPoints: 6 }),
      entry({ athleteId: 2, athleteName: 'Bo', totalPoints: 6.5 }),
    ],
  })} />)
  expect(rows('RX')).toEqual(['#1Ada, leading6 pts', '#2Bo6.5 pts'])
})

// halfWeight halves a workout's points, so a total can carry a .5 — and a
// whole number is not shown as 6.0.
it('shows a half point and does not decimalise a whole one', () => {
  render(<TvLeaderboardView data={data({ entries: [entry({ totalPoints: 12 })] })} />)
  expect(standings('RX').getByText('12 pts')).toBeInTheDocument()
})

// The setting is a percentage of the division, so a big field shows its
// leaders rather than its whole roster.
it('shows only the share of a division the setup screen asked for', () => {
  render(<TvLeaderboardView data={data({
    entries: [1, 2, 3, 4].map((id) => entry({ athleteId: id, athleteName: `A${id}` })),
    tvLeaderboardPercentages: { RX: 50 },
  })} />)
  expect(rows('RX')).toEqual(['#1A1, leading6 pts', '#2A26 pts'])
})

it('shows the whole division when nobody set a share', () => {
  render(<TvLeaderboardView data={data({
    entries: [1, 2, 3].map((id) => entry({ athleteId: id, athleteName: `A${id}` })),
  })} />)
  expect(rows('RX')).toHaveLength(3)
})

// A share small enough to round to nobody still shows the leader: a panel
// with a heading and no rows tells the room less than one name does.
it('always shows at least the leader, however small the share', () => {
  render(<TvLeaderboardView data={data({
    entries: [1, 2, 3].map((id) => entry({ athleteId: id, athleteName: `A${id}` })),
    tvLeaderboardPercentages: { RX: 1 },
  })} />)
  expect(rows('RX')).toEqual(['#1A1, leading6 pts'])
})

// v1 ranked by colour — gold, silver, bronze, and a clamp that painted
// everyone from third down bronze, so the board could not tell third place
// from eighth (defect 28). Every place now carries its own number.
it('tells every place apart, however far down the field it is', () => {
  render(<TvLeaderboardView data={data({
    entries: [1, 2, 3, 4].map((id) => entry({ athleteId: id, athleteName: `A${id}` })),
  })} />)
  expect(rows('RX').map((r) => r?.slice(0, 2))).toEqual(['#1', '#2', '#3', '#4'])
})

// The leader is set apart by weight, which a screen reader cannot see, so the
// same fact is there in words.
it('says which athlete is leading, and says it of nobody else', () => {
  render(<TvLeaderboardView data={data({
    entries: [1, 2, 3].map((id) => entry({ athleteId: id, athleteName: `A${id}` })),
  })} />)
  expect(standings('RX').getAllByText(/leading/)).toHaveLength(1)
  expect(standings('RX').getByText('A1').textContent).toBe('A1, leading')
})
