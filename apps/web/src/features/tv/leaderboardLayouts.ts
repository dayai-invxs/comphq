import type { LeaderboardData, LeaderboardEntry } from '@/api/liveReads'
import { hasAnyScore, tvDivisionsOf } from '@/lib/standings'

// The TV leaderboard's arrangements, tried by useScaleToFit the way the
// schedule's are (scheduleLayouts.ts). Arrangement 0 is the board as it always
// was: one panel per division, rows down one column. The next arrangements
// split the divisions with the most rows on the board into two columns, one
// division more each time, and then on into three; a split panel takes as many
// of the grid's tracks as it has columns. The tallest panel sets the height of
// its grid row, so it is the one worth splitting first. An arrangement wider
// than the screen (three columns where the grid has two tracks) is never
// picked: useScaleToFit rules out anything that overflows sideways.

export interface TvPanel {
  division: string | null
  /** The rows the board shows: the division's athletes who have a score, cut
      to its share, and at least its leader once anyone has one. Someone with
      no score yet has no place: listing them would rank them by name. */
  rows: LeaderboardEntry[]
}

/** One panel per division, in the order the setup screen set, each cut to the
    share of the division that screen asked for. A division nobody in has
    scored keeps its panel, empty, so the board does not rearrange itself as
    the first scores land. */
export function tvPanels(data: LeaderboardData | undefined): TvPanel[] {
  if (!data || data.workouts.length === 0) return []
  const { entries, tvLeaderboardPercentages = {}, tvLeaderboardOrder = {} } = data
  return tvDivisionsOf(entries, tvLeaderboardOrder).map((division) => {
    const rows = entries.filter((e) => e.divisionName === division && hasAnyScore(e))
    // A share that rounds to nobody still shows the leader: a panel with a
    // heading and no rows tells the room less than one name does.
    const percent = division != null ? tvLeaderboardPercentages[division] ?? 100 : 100
    const share = rows.length ? Math.max(1, Math.ceil(rows.length * percent / 100)) : 0
    return { division, rows: rows.slice(0, share) }
  })
}

/** Panels worth splitting: one row cannot be shared between two columns. */
const splittable = (panels: TvPanel[]) => panels.filter((p) => p.rows.length > 1).length

/** How many arrangements the leaderboard has: as it is, then one more for each
    panel that could go to two columns, then one more for each that could go
    on to three. */
export function leaderboardLayoutCount(data: LeaderboardData | undefined): number {
  return 1 + 2 * splittable(tvPanels(data))
}

/** How many columns each panel gets in arrangement `layout`. The longest
    panels go to two columns first, one at a time (the earlier on the board
    first when two are the same length); once every panel that can has two,
    the longest go on to three the same way. Never more columns than rows. */
export function panelColumns(panels: TvPanel[], layout: number): number[] {
  const longest = panels
    .map((p, i) => ({ i, n: p.rows.length }))
    .filter((p) => p.n > 1)
    .sort((a, b) => b.n - a.n || a.i - b.i)
  const columns = panels.map(() => 1)
  longest.forEach(({ i, n }, rank) => {
    const wanted = 1 + (rank < layout ? 1 : 0) + (rank < layout - longest.length ? 1 : 0)
    columns[i] = Math.min(wanted, n)
  })
  return columns
}
