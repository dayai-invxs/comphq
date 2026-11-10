// Knockout tournament rules, shared by the server and the web app.
// apps/web/src/lib/knockout.ts is an identical copy (a test checks it).
//
// A knockout workout runs in rounds. Round 1 is everyone in the division;
// the top N of each heat advance, and the next round's heats are built from
// them. The last round (the number of rounds is set on the workout) is the
// final: whoever is left, in one heat or several, ranked by score.
// Each division runs its own bracket; all divisions move round by round.

import { formatScore } from '@/lib/scoreFormat'

export type KnockoutWorkout = {
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  lanes: number
  knockoutRounds: number | null
  knockoutAdvance: number | null
}

/** One athlete/team in one heat of one round, with that round's result. */
export type KnockoutLane = {
  id: number
  athleteId: number
  divisionId: number | null
  heatNumber: number
  lane: number
  /** Null for heats placed before the tournament knew rounds (e.g. imported): round 1. */
  round: number | null
  rawScore: number | null
  capped: boolean
  tiebreakRawScore: number | null
  /** Set by hand: true advances, false does not. Null leaves it to the scores. */
  advanced: boolean | null
}

export const roundOf = (l: { round?: number | null }) => l.round ?? 1

function lowerIsBetter(scoreType: string) {
  return scoreType === 'time' || scoreType === 'lower_is_better'
}

// Same rule as scoring.ts: a finish beats a capped score; between capped
// scores more work is better.
function compareResults(a: number, aCapped: boolean, b: number, bCapped: boolean, scoreType: string) {
  if (aCapped !== bCapped) return aCapped ? 1 : -1
  if (aCapped) return b - a
  return lowerIsBetter(scoreType) ? a - b : b - a
}

/** Better result first. A lane with a score beats one without. */
export function compareLanes(a: KnockoutLane, b: KnockoutLane, wk: KnockoutWorkout): number {
  const aScored = a.rawScore != null, bScored = b.rawScore != null
  if (aScored !== bScored) return aScored ? -1 : 1
  if (!aScored) return 0
  const primary = compareResults(a.rawScore!, a.capped, b.rawScore!, b.capped, wk.scoreType)
  if (primary !== 0 || !wk.tiebreakEnabled) return primary
  if (a.tiebreakRawScore == null && b.tiebreakRawScore == null) return 0
  if (a.tiebreakRawScore == null) return 1
  if (b.tiebreakRawScore == null) return -1
  return compareResults(a.tiebreakRawScore, false, b.tiebreakRawScore, false, wk.tiebreakScoreType)
}

export type HeatResult = {
  /** Lane ids that move on. */
  advancing: Set<number>
  /** True when the scores chose them, false when someone was ticked by hand. */
  suggested: boolean
  /** Why the heat cannot be settled yet; null when it can. */
  problem: string | null
}

/**
 * Who advances from one heat. Ticks made by hand win outright; otherwise the
 * top N by score. Unscored lanes do not advance. A tie for the last spot is
 * left for the admin to settle.
 */
export function heatResult(lanes: KnockoutLane[], wk: KnockoutWorkout): HeatResult {
  const heat = lanes[0]?.heatNumber
  if (lanes.some((l) => l.advanced != null)) {
    return { advancing: new Set(lanes.filter((l) => l.advanced === true).map((l) => l.id)), suggested: false, problem: null }
  }
  const n = Math.max(1, wk.knockoutAdvance ?? 1)
  const scored = lanes.filter((l) => l.rawScore != null).sort((a, b) => compareLanes(a, b, wk))
  if (scored.length === 0) {
    return { advancing: new Set(), suggested: true, problem: `Heat ${heat} has no scores and no one is ticked to advance.` }
  }
  if (scored.length > n && compareLanes(scored[n - 1], scored[n], wk) === 0) {
    return {
      advancing: new Set(scored.slice(0, n).map((l) => l.id)),
      suggested: true,
      problem: `Heat ${heat} has a tie for the last advancing spot. Tick who advances.`,
    }
  }
  return { advancing: new Set(scored.slice(0, n).map((l) => l.id)), suggested: true, problem: null }
}

/** Seeds dealt across heats in a snake (1-2-3-3-2-1…) so the best are spread out. */
export function snakeHeats<T>(seeded: T[], lanes: number): T[][] {
  const count = Math.ceil(seeded.length / Math.max(1, lanes))
  const heats: T[][] = Array.from({ length: count }, () => [])
  seeded.forEach((x, i) => {
    const pass = Math.floor(i / count), pos = i % count
    heats[pass % 2 === 0 ? pos : count - 1 - pos].push(x)
  })
  return heats
}

/** Lanes from the middle out: the best seed in a heat gets the middle lane. */
export function middleOutLanes(lanes: number): number[] {
  const mid = Math.ceil(lanes / 2)
  const order = [mid]
  let left = mid - 1, right = mid + 1
  while (order.length < lanes) {
    if (left >= 1) order.push(left--)
    if (order.length < lanes && right <= lanes) order.push(right++)
  }
  return order
}

export type Placement = { athleteId: number; heatNumber: number; lane: number; round: number }

/**
 * Heats for one round. Divisions run one after another in the order given;
 * within a division the heat holding the top seed runs last.
 */
export function buildRound(
  divisions: Array<{ seeded: number[] }>,
  lanes: number,
  round: number,
  firstHeat: number,
): Placement[] {
  const out: Placement[] = []
  const laneOrder = middleOutLanes(lanes)
  let heatNumber = firstHeat
  for (const { seeded } of divisions) {
    for (const heat of snakeHeats(seeded, lanes).reverse()) {
      heat.forEach((athleteId, i) => out.push({ athleteId, heatNumber, lane: laneOrder[i], round }))
      heatNumber++
    }
  }
  return out
}

/** The latest round that has heats; 0 when there are none. */
export function currentRound(lanes: KnockoutLane[]): number {
  return lanes.reduce((max, l) => Math.max(max, roundOf(l)), 0)
}

/**
 * Who moves on from a round, seeded for the next one: heat winners first,
 * then second places, and so on, each group ordered by score.
 */
export function advancers(roundLanes: KnockoutLane[], wk: KnockoutWorkout): {
  byDivision: Map<number | null, number[]>
  problems: string[]
} {
  const heats = new Map<number, KnockoutLane[]>()
  for (const l of roundLanes) heats.set(l.heatNumber, [...(heats.get(l.heatNumber) ?? []), l])

  const problems: string[] = []
  const moving: Array<{ lane: KnockoutLane; place: number }> = []
  for (const [, lanes] of [...heats].sort(([a], [b]) => a - b)) {
    const result = heatResult(lanes, wk)
    if (result.problem) problems.push(result.problem)
    const ordered = [...lanes].sort((a, b) => compareLanes(a, b, wk))
    ordered.forEach((lane, place) => { if (result.advancing.has(lane.id)) moving.push({ lane, place }) })
  }

  const byDivision = new Map<number | null, number[]>()
  moving
    .sort((a, b) => a.place - b.place || compareLanes(a.lane, b.lane, wk))
    .forEach(({ lane }) => byDivision.set(lane.divisionId, [...(byDivision.get(lane.divisionId) ?? []), lane.athleteId]))
  return { byDivision, problems }
}

export type Placing = {
  athleteId: number
  divisionId: number | null
  /** Placing within the division; the workout's points. */
  points: number
  /** The heat they finished in: their result in the round they went out in, or the final. */
  lane: KnockoutLane
  label: string
}

/**
 * Final placings, per division. The further someone got, the better; among
 * those out in the same round, the better score in that round ranks higher.
 * In the final, a lane ticked as the winner ranks first. Ties share a placing.
 */
export function placings(allLanes: KnockoutLane[], wk: KnockoutWorkout): Placing[] {
  const finalRound = wk.knockoutRounds ?? currentRound(allLanes)
  const last = new Map<number, KnockoutLane>()
  for (const l of allLanes) {
    const seen = last.get(l.athleteId)
    if (!seen || roundOf(l) > roundOf(seen)) last.set(l.athleteId, l)
  }

  const byDivision = new Map<number | null, KnockoutLane[]>()
  for (const l of last.values()) byDivision.set(l.divisionId, [...(byDivision.get(l.divisionId) ?? []), l])

  const order = (a: KnockoutLane, b: KnockoutLane) =>
    roundOf(b) - roundOf(a)
    || Number(b.advanced === true) - Number(a.advanced === true)
    || compareLanes(a, b, wk)

  const out: Placing[] = []
  for (const [divisionId, lanes] of byDivision) {
    const sorted = [...lanes].sort(order)
    sorted.forEach((lane, i) => {
      const tied = i > 0 && order(sorted[i - 1], lane) === 0
      const points = tied ? out[out.length - 1].points : i + 1
      out.push({ athleteId: lane.athleteId, divisionId, points, lane, label: placingLabel(lane, finalRound, wk) })
    })
  }
  return out
}

function placingLabel(lane: KnockoutLane, finalRound: number, wk: KnockoutWorkout): string {
  const stage = roundOf(lane) >= finalRound ? 'Final' : `Out in Round ${roundOf(lane)}`
  return lane.rawScore == null ? stage : `${stage} · ${formatScore(lane.rawScore, wk.scoreType, lane.capped)}`
}

/**
 * How many are in each round, from the entrants, lanes, top N per heat and
 * number of rounds. Heats are as even as they can be; a heat smaller than N
 * sends everyone on.
 */
export function roundSizes(entrants: number, lanes: number, advance: number, rounds: number): number[] {
  const sizes = [entrants]
  for (let r = 1; r < rounds; r++) {
    const size = sizes[r - 1]
    if (size === 0) { sizes.push(0); continue }
    const heats = Math.ceil(size / Math.max(1, lanes))
    const small = Math.floor(size / heats), bigger = size % heats
    sizes.push(bigger * Math.min(advance, small + 1) + (heats - bigger) * Math.min(advance, small))
  }
  return sizes
}
