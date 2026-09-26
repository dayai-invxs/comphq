import type { LeaderboardEntry } from '@/api/liveReads'

// How a standings table groups and ranks what the API served. v1 had this
// twice — once in src/app/[slug]/leaderboard/page.tsx and once in
// src/app/[slug]/admin/leaderboard/page.tsx — and two copies of the ranking
// rule are the kind of duplication that ships an inverted sort on one screen.
//
// The ranking itself is the API's; this only decides which number is printed
// beside an athlete whose placing the API already fixed.

/** The divisions with something to show, alphabetical, division-less last. */
export function divisionsOf(entries: LeaderboardEntry[]): (string | null)[] {
  return [...new Set(entries.filter(hasAnyScore).map((e) => e.divisionName))].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })
}

/** The same question the TV scoreboard asks, answered differently, and the
    two live next to each other so neither is "fixed" into the other by
    accident. A gym display shows a fixed set of panels in an order the
    competition chose on the setup screen, so a division with nothing in it
    yet still gets its panel — otherwise the board rearranges itself the
    moment the first score lands in it. Unplaced divisions follow the placed
    ones alphabetically, and the division-less athletes are always last.

    The order is keyed by division *name*, which is v1's and is what the
    setting stores: renaming a division loses its place. */
export function tvDivisionsOf(
  entries: LeaderboardEntry[],
  order: Record<string, number>,
): (string | null)[] {
  return [...new Set(entries.map((e) => e.divisionName))].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    const rankA = order[a] ?? Infinity
    const rankB = order[b] ?? Infinity
    return rankA !== rankB ? rankA - rankB : a.localeCompare(b)
  })
}

export function hasAnyScore(entry: LeaderboardEntry): boolean {
  return Object.values(entry.workoutScores).some((s) => s !== null)
}

/** Equal totals reached the same way. Two athletes on 6 who placed 1st/5th and
    3rd/3rd are level on paper and not tied, so every workout has to match. */
export function sameEverywhere(a: LeaderboardEntry, b: LeaderboardEntry, workoutIds: number[]): boolean {
  if (a.totalPoints !== b.totalPoints) return false
  return workoutIds.every((id) => (a.workoutScores[id]?.points ?? null) === (b.workoutScores[id]?.points ?? null))
}

/** Placings for rows already in order. Ties share a number and skip the
    positions they took; an athlete with nothing to rank gets an em dash. */
export function rankRows<T>(
  rows: T[],
  scored: (row: T) => boolean,
  tied: (a: T, b: T) => boolean,
): { entry: T; rank: number | '—' }[] {
  let rank = 1
  return rows.map((entry, i) => {
    if (i > 0 && scored(entry) && !tied(rows[i - 1], entry)) rank = i + 1
    return { entry, rank: scored(entry) ? rank : '—' }
  })
}

/** halfWeight halves a workout's points, so a total can carry a .5. */
export function formatTotal(total: number): string {
  return Number.isInteger(total) ? String(total) : total.toFixed(1)
}
