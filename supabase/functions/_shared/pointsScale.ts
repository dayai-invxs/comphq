// How a competition turns a workout's place into points on the overall board.
//
// Every workout stores each athlete's PLACE in Score.points (1 = won it), and
// that never changes: heat ranking, rank overrides, skipped workouts, countback
// and knockouts all speak in places. The scoring system only decides what a
// place is worth when the overall totals are added up.
//
//   rank   — "Lowest score - point by rank": a place is worth its number, so
//            1st adds 1, 2nd adds 2, and the lowest total wins. The original.
//   points — "Highest score": 1st is worth `first` points, each place after it
//            `step` fewer, down to 0 and never below, and the highest total
//            wins.
//            A workout may set its own step (Workout.pointsStep).
//
// Ties share a place, so they share its points. Part B places are converted
// the same way, and half/double weight multiplies the converted points.

export type ScoringSystem = 'rank' | 'points'

export interface PointsScale {
  /** Points for 1st place. */
  first: number
  /** Points fewer for each place after 1st. */
  step: number
}

export interface Scoring {
  system: ScoringSystem
  scale: PointsScale
}

export const DEFAULT_POINTS_SCALE: PointsScale = { first: 100, step: 10 }
export const RANK_SCORING: Scoring = { system: 'rank', scale: DEFAULT_POINTS_SCALE }

/** The largest value either number may take. */
export const POINTS_MAX = 10000

/** Setting keys, one per value. */
export const SCORING_SETTING_KEYS = ['scoringSystem', 'pointsFirst', 'pointsStep'] as const

function wholeNumber(raw: string | null | undefined, fallback: number, min = 0): number {
  const n = Number(raw)
  return raw != null && raw !== '' && Number.isInteger(n) && n >= min && n <= POINTS_MAX ? n : fallback
}

/** Read from stored settings; anything missing or unreadable is the default,
    and a competition that never chose is on the original rank system. */
export function scoringFromSettings(get: (key: (typeof SCORING_SETTING_KEYS)[number]) => string | null | undefined): Scoring {
  const system: ScoringSystem = get('scoringSystem') === 'points' ? 'points' : 'rank'
  const first = wholeNumber(get('pointsFirst'), DEFAULT_POINTS_SCALE.first, 1)
  const step = wholeNumber(get('pointsStep'), DEFAULT_POINTS_SCALE.step)
  return { system, scale: { first, step } }
}

/** True when the bigger total wins. */
export function higherWins(scoring: Scoring): boolean {
  return scoring.system === 'points'
}

/** What one place is worth. `workoutStep` is the workout's own step, if it set one. */
export function placePoints(place: number, scoring: Scoring, workoutStep?: number | null): number {
  if (scoring.system === 'rank') return place
  const { first, step } = scoring.scale
  const each = workoutStep ?? step
  return Math.max(0, first - (place - 1) * each)
}

/** Part A and Part B together, before any half/double weight. */
export function workoutPoints(
  place: number,
  partBPlace: number | null | undefined,
  scoring: Scoring,
  workoutStep?: number | null,
): number {
  return placePoints(place, scoring, workoutStep) + (partBPlace != null ? placePoints(partBPlace, scoring, workoutStep) : 0)
}

/** Orders two totals best first. */
export function compareTotals(a: number, b: number, scoring: Scoring): number {
  return higherWins(scoring) ? b - a : a - b
}
