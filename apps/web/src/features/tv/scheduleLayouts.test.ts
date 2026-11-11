import { expect, it } from 'vitest'
import { SCHEDULE_LAYOUTS, splitColumns } from './scheduleLayouts'

const lengths = (runs: unknown[][]) => runs.map((r) => r.length)
const lanes = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

it('splits lanes into columns as even as they go, in reading order', () => {
  expect(lengths(splitColumns(lanes(18), 2))).toEqual([9, 9])
  expect(lengths(splitColumns(lanes(17), 2))).toEqual([9, 8])
  expect(lengths(splitColumns(lanes(17), 3))).toEqual([6, 6, 5])
  expect(splitColumns(lanes(4), 2)).toEqual([[1, 2], [3, 4]])
})

it('never draws an empty column', () => {
  expect(splitColumns(lanes(2), 4)).toEqual([[1], [2]])
  expect(splitColumns([], 3)).toEqual([[]])
})

// Three heats one column each is the board as it always was; it is the first
// thing tried, and anything after it trades heats for room.
it('prefers three heats across, then fewer and wider', () => {
  expect(SCHEDULE_LAYOUTS[0]).toEqual({ heats: 3, laneColumns: 1 })
  const heats = SCHEDULE_LAYOUTS.map((l) => l.heats)
  expect([...heats].sort((a, b) => b - a)).toEqual(heats)
})
