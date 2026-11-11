import { expect, it } from 'vitest'
import type { LeaderboardData, LeaderboardEntry } from '@/api/liveReads'
import { leaderboardLayoutCount, panelColumns, tvPanels } from './leaderboardLayouts'

const entry = (athleteId: number, divisionName: string | null): LeaderboardEntry => ({
  athleteId, athleteName: `A${athleteId}`, divisionName, totalPoints: athleteId,
  workoutScores: { 1: { points: athleteId, display: '1:00', tiebreakDisplay: null } },
})

const data = (entries: LeaderboardEntry[], over: Partial<LeaderboardData> = {}): LeaderboardData => ({
  workouts: [{ id: 1, number: 1, name: 'Fran', scoreType: 'time', status: 'active' }],
  entries,
  halfWeightIds: [],
  ...over,
})

const field = [
  ...[1, 2].map((id) => entry(id, 'RX')),
  ...[3, 4, 5, 6].map((id) => entry(id, 'Scaled')),
  entry(7, 'Masters'),
]

it('cuts each panel to its share, in the setup screen\'s order', () => {
  const panels = tvPanels(data(field, { tvLeaderboardOrder: { Scaled: 1 }, tvLeaderboardPercentages: { Scaled: 50 } }))
  expect(panels.map((p) => [p.division, p.rows.length])).toEqual([['Scaled', 2], ['Masters', 1], ['RX', 2]])
})

// Arrangement 0 is the board as it was; then one more for every panel with
// more than one row going to two columns, and one more for each going on to
// three. A single row has nothing to share with a second column.
it('has two arrangements more for each panel worth splitting', () => {
  expect(leaderboardLayoutCount(data(field))).toBe(5)
  expect(leaderboardLayoutCount(undefined)).toBe(1)
  expect(leaderboardLayoutCount(data([]))).toBe(1)
})

// Panels on the board: Masters (1 row), RX (2), Scaled (4).
it('gives the longest panels two columns first, then three, never more than rows', () => {
  const panels = tvPanels(data(field))
  expect(panels.map((p) => p.division)).toEqual(['Masters', 'RX', 'Scaled'])
  expect(panelColumns(panels, 0)).toEqual([1, 1, 1])
  expect(panelColumns(panels, 1)).toEqual([1, 1, 2])
  expect(panelColumns(panels, 2)).toEqual([1, 2, 2])
  expect(panelColumns(panels, 3)).toEqual([1, 2, 3])
  expect(panelColumns(panels, 4)).toEqual([1, 2, 3])
})

// Someone with no score has no place yet; a division nobody has scored in
// keeps its panel, empty, so the board does not move as the first scores land.
it('leaves out athletes who have not scored, but keeps their division', () => {
  const unscored = { ...entry(9, 'Masters'), workoutScores: { 1: null } }
  const panels = tvPanels(data([entry(1, 'RX'), { ...entry(2, 'RX'), workoutScores: {} }, unscored]))
  expect(panels.map((p) => [p.division, p.rows.map((r) => r.athleteId)])).toEqual([['Masters', []], ['RX', [1]]])
})

it('splits the earlier of two panels the same length first', () => {
  const even = [entry(1, 'A'), entry(2, 'A'), entry(3, 'B'), entry(4, 'B')]
  expect(panelColumns(tvPanels(data(even)), 1)).toEqual([2, 1])
})
