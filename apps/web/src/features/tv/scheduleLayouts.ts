// The arrangements the TV schedule can draw, in the order the board prefers
// them. useScaleToFit draws each in turn and keeps the first that fits the
// screen at full size, so the room reads a big heat at the same type size as a
// small one rather than at half of it.
//
// More heats come first: three across is what the board is for, and it gives
// that up only when a heat's lanes will not fit down a card. After that, the
// heats it keeps take the width the others left and spread their lanes into
// columns. A heat the board no longer has room for is still named, with its
// clocks, in the "Up next" strip under the cards.
//
// Measured on a 1920×1080 board (2026-11-11): one column holds about 12
// individuals, 9 teams of two or 7 teams of four at full size — so 18 lanes of
// individuals land on one heat in two columns of nine.

export interface ScheduleLayout {
  /** Heat cards across the board. */
  heats: number
  /** Columns the lanes of each card are split into. */
  laneColumns: number
}

export const SCHEDULE_LAYOUTS: readonly ScheduleLayout[] = [
  { heats: 3, laneColumns: 1 },
  { heats: 2, laneColumns: 1 },
  { heats: 2, laneColumns: 2 },
  { heats: 1, laneColumns: 2 },
  { heats: 1, laneColumns: 3 },
  { heats: 1, laneColumns: 4 },
]
