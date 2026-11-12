// Knockout tournament rules, shared by the server and the web app (which
// re-exports this file from apps/web/src/lib/knockout.ts).
//
// A knockout workout runs in rounds. Round 1 is everyone in the division;
// the top N of each division in each heat advance, and the next round's heats
// are built from them. The last round (the number of rounds is set on the
// workout) is the final: whoever is left, in one heat or several, ranked by
// score. Each division runs its own bracket; all divisions move round by
// round. Divisions may share a heat when the lanes allow, but each is still
// judged only against its own: sharing saves heats, it changes no one's odds.
//
// Consolation (optional, `knockoutConsolation`): everyone who does not advance
// from a round races once more, in consolation heats of the next round, run
// before that round's own heats. The race orders them among everyone else who
// went out in the same round; they still rank behind anyone who went further.
// The final has no consolation after it. Consolation heats never mix with the
// winners' heats and decide no advancing.

import { formatScore } from '@/lib/scoreFormat'

export type KnockoutWorkout = {
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  lanes: number
  knockoutRounds: number | null
  knockoutAdvance: number | null
  /** Those who do not advance race again in the next round's consolation heats. */
  knockoutConsolation?: boolean | null
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
  /** A consolation heat's lane: places those who went out in the round before. */
  consolation?: boolean | null
}

export const roundOf = (l: { round?: number | null }) => l.round ?? 1
export const isConsolation = (l: { consolation?: boolean | null }) => l.consolation === true

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

function divisionGroups(lanes: KnockoutLane[]): KnockoutLane[][] {
  const groups = new Map<number | null, KnockoutLane[]>()
  for (const l of lanes) groups.set(l.divisionId, [...(groups.get(l.divisionId) ?? []), l])
  return [...groups.values()]
}

/**
 * Who advances from one heat: the top N of each division in it by score.
 * Ticks made by hand win outright, for the whole heat. Unscored lanes do not
 * advance. A tie for a division's last spot is left for the admin to settle.
 */
export function heatResult(lanes: KnockoutLane[], wk: KnockoutWorkout): HeatResult {
  const heat = lanes[0]?.heatNumber
  if (lanes.some((l) => l.advanced != null)) {
    return { advancing: new Set(lanes.filter((l) => l.advanced === true).map((l) => l.id)), suggested: false, problem: null }
  }
  const n = Math.max(1, wk.knockoutAdvance ?? 1)
  const groups = divisionGroups(lanes)
  const where = groups.length > 1 ? ' in one of its divisions' : ''
  const advancing = new Set<number>()
  let unscored = false, tied = false
  for (const group of groups) {
    const scored = group.filter((l) => l.rawScore != null).sort((a, b) => compareLanes(a, b, wk))
    if (scored.length === 0) { unscored = true; continue }
    if (scored.length > n && compareLanes(scored[n - 1], scored[n], wk) === 0) tied = true
    for (const l of scored.slice(0, n)) advancing.add(l.id)
  }
  const problem = unscored
    ? `Heat ${heat} has no scores${where} and no one is ticked to advance.`
    : tied ? `Heat ${heat} has a tie for the last advancing spot${where}. Tick who advances.` : null
  return { advancing, suggested: true, problem }
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

/**
 * Lanes from the middle out: the best seed in a heat gets the middle lane,
 * then one lane up, one lane down, and so on. 6 lanes: 3, 4, 2, 5, 1, 6.
 * The same order as seeded heats in scoring.ts.
 */
export function middleOutLanes(lanes: number): number[] {
  const mid = Math.ceil(lanes / 2)
  const order = [mid]
  let left = mid - 1, right = mid + 1
  while (order.length < lanes) {
    if (right <= lanes) order.push(right++)
    if (order.length < lanes && left >= 1) order.push(left--)
  }
  return order
}

export type Placement = { athleteId: number; heatNumber: number; lane: number; round: number; consolation?: boolean }

/**
 * Heats for one round. Divisions run one after another in the order given;
 * within a division the heat holding the top seed runs last. Each division's
 * heats are made as if it ran alone; then a heat shares its spare lanes with
 * the next division's heat when both fit. Each division keeps its own block of
 * lanes in a shared heat, so the groups that face each other are unchanged.
 */
export function buildRound(
  divisions: Array<{ seeded: number[] }>,
  lanes: number,
  round: number,
  firstHeat: number,
): Placement[] {
  // Each division's heats, in running order, before any sharing.
  const groups: Array<{ division: number; athletes: number[] }> = []
  divisions.forEach(({ seeded }, division) => {
    for (const athletes of snakeHeats(seeded, lanes).reverse()) groups.push({ division, athletes })
  })

  // Neighbouring groups from different divisions share a heat when they fit.
  const heats: Array<typeof groups> = []
  for (const g of groups) {
    const last = heats[heats.length - 1]
    const used = last?.reduce((n, x) => n + x.athletes.length, 0) ?? 0
    if (last && !last.some((x) => x.division === g.division) && used + g.athletes.length <= lanes) last.push(g)
    else heats.push([g])
  }

  const out: Placement[] = []
  const fullOrder = middleOutLanes(lanes)
  heats.forEach((heat, i) => {
    const heatNumber = firstHeat + i
    if (heat.length === 1) {
      heat[0].athletes.forEach((athleteId, j) => out.push({ athleteId, heatNumber, lane: fullOrder[j], round }))
      return
    }
    let offset = 0
    for (const { athletes } of heat) {
      const order = middleOutLanes(athletes.length)
      athletes.forEach((athleteId, j) => out.push({ athleteId, heatNumber, lane: offset + order[j], round }))
      offset += athletes.length
    }
  })
  return out
}

/** The latest round that has heats; 0 when there are none. */
export function currentRound(lanes: KnockoutLane[]): number {
  return lanes.reduce((max, l) => Math.max(max, roundOf(l)), 0)
}

/**
 * Who moves on from a round, seeded for the next one: heat winners first,
 * then second places, and so on, each group ordered by score. A place is
 * within the athlete's own division in that heat.
 */
export function advancers(roundLanes: KnockoutLane[], wk: KnockoutWorkout): {
  byDivision: Map<number | null, number[]>
  /** Who went out, seeded the same way: for the consolation heats. */
  outByDivision: Map<number | null, number[]>
  problems: string[]
} {
  const heats = new Map<number, KnockoutLane[]>()
  for (const l of roundLanes.filter((x) => !isConsolation(x))) {
    heats.set(l.heatNumber, [...(heats.get(l.heatNumber) ?? []), l])
  }

  const problems: string[] = []
  const moving: Array<{ lane: KnockoutLane; place: number }> = []
  const out: Array<{ lane: KnockoutLane; place: number }> = []
  for (const [, lanes] of [...heats].sort(([a], [b]) => a - b)) {
    const result = heatResult(lanes, wk)
    if (result.problem) problems.push(result.problem)
    for (const group of divisionGroups(lanes)) {
      const ordered = [...group].sort((a, b) => compareLanes(a, b, wk))
      ordered.forEach((lane, place) => (result.advancing.has(lane.id) ? moving : out).push({ lane, place }))
    }
  }

  const seed = (list: typeof moving) => {
    const byDivision = new Map<number | null, number[]>()
    list
      .sort((a, b) => a.place - b.place || compareLanes(a.lane, b.lane, wk))
      .forEach(({ lane }) => byDivision.set(lane.divisionId, [...(byDivision.get(lane.divisionId) ?? []), lane.athleteId]))
    return byDivision
  }
  return { byDivision: seed(moving), outByDivision: seed(out), problems }
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
  // How far each got in the winners' heats, and their consolation race if any.
  const last = new Map<number, KnockoutLane>()
  const consolationOf = new Map<number, KnockoutLane>()
  for (const l of allLanes) {
    const into = isConsolation(l) ? consolationOf : last
    const seen = into.get(l.athleteId)
    if (!seen || roundOf(l) > roundOf(seen)) into.set(l.athleteId, l)
  }

  const byDivision = new Map<number | null, KnockoutLane[]>()
  for (const l of last.values()) byDivision.set(l.divisionId, [...(byDivision.get(l.divisionId) ?? []), l])

  // Out in the same round: the consolation race decides first (no result
  // there ranks after one), then the result in the round they went out in.
  const consolation = (l: KnockoutLane) => consolationOf.get(l.athleteId)
  const byConsolation = (a: KnockoutLane, b: KnockoutLane) => {
    const ca = consolation(a), cb = consolation(b)
    if (!ca && !cb) return 0
    if (!ca || !cb) return ca ? -1 : 1
    return compareLanes(ca, cb, wk)
  }
  const order = (a: KnockoutLane, b: KnockoutLane) =>
    roundOf(b) - roundOf(a)
    || Number(b.advanced === true) - Number(a.advanced === true)
    || byConsolation(a, b)
    || compareLanes(a, b, wk)

  const out: Placing[] = []
  for (const [divisionId, lanes] of byDivision) {
    const sorted = [...lanes].sort(order)
    sorted.forEach((lane, i) => {
      const tied = i > 0 && order(sorted[i - 1], lane) === 0
      const points = tied ? out[out.length - 1].points : i + 1
      out.push({ athleteId: lane.athleteId, divisionId, points, lane, label: placingLabel(lane, finalRound, wk, consolation(lane)) })
    })
  }
  return out
}

function placingLabel(lane: KnockoutLane, finalRound: number, wk: KnockoutWorkout, consolation?: KnockoutLane): string {
  const stage = roundOf(lane) >= finalRound ? 'Final' : `Out in Round ${roundOf(lane)}`
  // After a consolation race, its result is the one that placed them.
  if (consolation?.rawScore != null) {
    return `${stage} · Consolation ${formatScore(consolation.rawScore, wk.scoreType, consolation.capped)}`
  }
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
