import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, score, setting, workout, type Workout } from '@/db/schema'
import { displayScoreType, formatScore, formatTiebreak } from '@/lib/scoreFormat'
import { DEFAULT_LEADERBOARD_VISIBILITY } from '@/lib/competitionDefaults'
import { compareResults } from '@/lib/scoring'
import { skippedPlaces } from '@/lib/skippedPlace'
import { workoutWeight } from '@/lib/workoutWeight'
import { compareTotals, higherWins, workoutPoints, type Scoring } from '@/lib/pointsScale'
import { loadScoring } from '@/lib/scoringSettings'

// The overall standings: totals and every rule that breaks a tie. One place,
// because the leaderboard shows them and seeding (knockout round 1, seeded
// heats) has to follow them exactly. Seeding used to add up places alone and
// split a tie by registration order, so a three-way tie the board had settled
// was seeded in a different order from the one the room could see.

export type StandingsWorkout = Workout
export type StandingsAthlete = { id: number; name: string; divisionName: string | null }
export type StandingsScore = {
  athleteId: number
  workoutId: number
  points: number | null
  rawScore: number
  capped: boolean
  tiebreakRawScore: number | null
  partBPoints: number | null
  knockoutLabel: string | null
}

export type WorkoutScore = {
  /** The PLACE (Part A). Highest-score boards turn it into `awarded`. */
  points: number; rawScore: number; display: string; tiebreakDisplay: string | null; partBPoints: number | null
  /** No score in a finished workout: placed last, not ranked by a result. */
  skipped?: true
  /** Highest-score boards only: the points this result is worth, Part B
      included, before half/double weight. */
  awarded?: number
}

export type StandingsEntry = {
  athleteId: number
  athleteName: string
  divisionName: string | null
  totalPoints: number
  workoutScores: Record<number, WorkoutScore | null>
}

/** Which workouts count: live boards (per_heat) show running ones too. */
export function visibleWorkoutsOf<W extends { status: string }>(workouts: W[], leaderboardVisibility: string | null): W[] {
  const live = (leaderboardVisibility ?? DEFAULT_LEADERBOARD_VISIBILITY) !== 'per_workout'
  return workouts.filter((w) => live ? w.status === 'active' || w.status === 'completed' : w.status === 'completed')
}

/** Every athlete, best first, the way the leaderboard ranks them. */
export function rankStandings(input: {
  visibleWorkouts: StandingsWorkout[]
  athletes: StandingsAthlete[]
  scores: StandingsScore[]
  scoring: Scoring
  tiebreakWorkoutId: number | null
}): { entries: StandingsEntry[]; decidingWorkoutId: number | null } {
  const { visibleWorkouts, athletes, scores, scoring, tiebreakWorkoutId } = input
  // Rank (lowest total wins) or points (highest wins): lib/pointsScale.ts.
  const pointsMode = higherWins(scoring)

  // Rounds + reps scored with no rounds anywhere show as reps alone.
  const shownType = new Map(visibleWorkouts.map((w) => [
    w.id,
    displayScoreType(w.scoreType, scores.filter((s) => s.workoutId === w.id && s.points != null).map((s) => s.rawScore)),
  ]))
  const scoreMap = new Map<string, { points: number; rawScore: number; capped: boolean; scoreType: string; tiebreakRawScore: number | null; tiebreakEnabled: boolean; tiebreakScoreType: string; partBPoints: number | null; knockoutLabel: string | null }>()
  for (const s of scores) {
    if (s.points != null) {
      const wo = visibleWorkouts.find((w) => w.id === s.workoutId)
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, {
        points: s.points,
        rawScore: s.rawScore,
        capped: s.capped,
        scoreType: shownType.get(s.workoutId) ?? wo?.scoreType ?? '',
        tiebreakRawScore: s.tiebreakRawScore ?? null,
        tiebreakEnabled: wo?.tiebreakEnabled ?? false,
        tiebreakScoreType: wo?.tiebreakScoreType ?? 'time',
        partBPoints: s.partBPoints ?? null,
        knockoutLabel: s.knockoutLabel ?? null,
      })
    }
  }

  // A finished workout an athlete has no score in ranks them last in it
  // (lib/skippedPlace.ts), Part B the same.
  const divisionsOf = athletes.map((a) => ({ id: a.id, division: a.divisionName }))
  const skippedA = skippedPlaces(visibleWorkouts, divisionsOf, (a, w) => scoreMap.get(`${a}-${w}`)?.points)
  const skippedB = skippedPlaces(visibleWorkouts, divisionsOf, (a, w) => scoreMap.get(`${a}-${w}`)?.partBPoints)

  const awarded = (wo: StandingsWorkout, place: number, partB: number | null) =>
    workoutPoints(place, wo.partBEnabled ? partB : null, scoring, wo.pointsStep)

  const entries: StandingsEntry[] = athletes.map((a) => {
    let totalPoints = 0
    const workoutScores: Record<number, WorkoutScore | null> = {}
    for (const wo of visibleWorkouts) {
      const entry = scoreMap.get(`${a.id}-${wo.id}`)
      const skipped = entry ? null : skippedA(a.id, wo.id)
      if (skipped != null) {
        const partB = wo.partBEnabled ? skippedB(a.id, wo.id) : null
        const pts = awarded(wo, skipped, partB)
        totalPoints += pts * workoutWeight(wo)
        workoutScores[wo.id] = {
          points: skipped, rawScore: 0, display: 'No score', tiebreakDisplay: null, partBPoints: partB, skipped: true,
          ...(pointsMode ? { awarded: pts } : {}),
        }
      } else if (entry) {
        // When partBEnabled, both Part A and Part B points count toward total
        const pts = awarded(wo, entry.points, entry.partBPoints)
        totalPoints += pts * workoutWeight(wo)
        const tiebreakDisplay = !wo.partBEnabled && entry.tiebreakEnabled && entry.tiebreakRawScore != null
          ? (entry.tiebreakScoreType === 'time' ? formatTiebreak(entry.tiebreakRawScore) : formatScore(entry.tiebreakRawScore, entry.tiebreakScoreType))
          : null
        workoutScores[wo.id] = {
          points: entry.points, rawScore: entry.rawScore, display: entry.knockoutLabel ?? formatScore(entry.rawScore, entry.scoreType, entry.capped), tiebreakDisplay, partBPoints: entry.partBPoints,
          ...(pointsMode ? { awarded: pts } : {}),
        }
      } else {
        workoutScores[wo.id] = null
      }
    }
    return { athleteId: a.id, athleteName: a.name, divisionName: a.divisionName ?? null, totalPoints, workoutScores }
  })

  // A finished knockout flagged as deciding the competition: its placings are
  // the standings. Everyone it placed takes their placing as their total and
  // ranks on that alone; anyone it did not place follows, ranked as before.
  // Placings are per division, and so is every table that reads this. On a
  // highest-score board the total stays the points earned (a placing of 1
  // shown as a total would read as last); the order still follows the placing.
  const deciding = [...visibleWorkouts].reverse()
    .find((w) => w.knockout && w.knockoutDecides && w.status === 'completed') ?? null
  const decidingWorkoutId = deciding?.id ?? null
  if (deciding && !pointsMode) {
    for (const e of entries) {
      const placed = e.workoutScores[deciding.id]
      if (placed && !placed.skipped) e.totalPoints = placed.points
    }
  }

  const tiebreakWorkout = tiebreakWorkoutId
    ? visibleWorkouts.find((w) => w.id === tiebreakWorkoutId)
    : undefined

  entries.sort((a, b) => {
    if (decidingWorkoutId != null) {
      // Someone the knockout did not place follows, skipped or not.
      const placing = (ws: WorkoutScore | null | undefined) => (ws && !ws.skipped ? ws.points : null)
      const aPlace = placing(a.workoutScores[decidingWorkoutId])
      const bPlace = placing(b.workoutScores[decidingWorkoutId])
      if (aPlace != null && bPlace == null) return -1
      if (aPlace == null && bPlace != null) return 1
      if (aPlace != null && bPlace != null) return aPlace - bPlace || a.athleteName.localeCompare(b.athleteName)
    }
    const aHas = hasResults(a)
    const bHas = hasResults(b)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return compareTotals(a.totalPoints, b.totalPoints, scoring)
    // Tied on total points: compare rank distributions — athlete with more 1st places wins,
    // then more 2nd places, etc.
    const ranksPresent = [...new Set([
      ...Object.values(a.workoutScores).filter(Boolean).map((s) => s!.points),
      ...Object.values(b.workoutScores).filter(Boolean).map((s) => s!.points),
    ])].sort((x, y) => x - y)
    for (const rank of ranksPresent) {
      const aCount = Object.values(a.workoutScores).filter((s) => s?.points === rank).length
      const bCount = Object.values(b.workoutScores).filter((s) => s?.points === rank).length
      if (aCount !== bCount) return bCount - aCount // more of a better rank wins
    }
    // Still tied: the better result in the designated tiebreaker workout. Read
    // from the scores themselves, not the cells: a capped score holds rounds
    // and reps rather than a time, so it has to lose to any finish rather than
    // be compared by value, and a "No score" cell carries a stand-in 0 that
    // would otherwise beat every real time.
    if (tiebreakWorkout) {
      const aScore = scoreMap.get(`${a.athleteId}-${tiebreakWorkout.id}`)
      const bScore = scoreMap.get(`${b.athleteId}-${tiebreakWorkout.id}`)
      if (aScore && !bScore) return -1
      if (!aScore && bScore) return 1
      if (aScore && bScore) {
        const better = compareResults(aScore.rawScore, aScore.capped, bScore.rawScore, bScore.capped, tiebreakWorkout.scoreType)
        if (better !== 0) return better
      }
    }
    return a.athleteName.localeCompare(b.athleteName)
  })

  return { entries, decidingWorkoutId }
}

/** Anything on the board for them yet, a skipped finished workout included. */
export function hasResults(e: StandingsEntry): boolean {
  return Object.values(e.workoutScores).some((v) => v !== null)
}

/**
 * Seeding order from the leaderboard as it stands: athlete id → position
 * (0 = top of the board). Positions are across the whole board, so within one
 * division they still run best first. Only athletes with something on the
 * board are in it; seeding puts the rest after them in registration order.
 */
export async function loadSeedOrder(competitionId: number): Promise<Map<number, number>> {
  const settingValue = async (key: string) => (await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), eq(setting.key, key)))
    .limit(1))[0]?.value ?? null

  const [workouts, athletes, tiebreakSetting, visibility, scoring] = await Promise.all([
    db.select().from(workout).where(eq(workout.competitionId, competitionId)).orderBy(asc(workout.number)),
    db.select({ id: athlete.id, name: athlete.name, divisionName: division.name })
      .from(athlete)
      .leftJoin(division, eq(division.id, athlete.divisionId))
      .where(eq(athlete.competitionId, competitionId))
      .orderBy(asc(athlete.name)),
    settingValue('tiebreakWorkoutId'),
    settingValue('leaderboardVisibility'),
    loadScoring(competitionId),
  ])
  const visibleWorkouts = visibleWorkoutsOf(workouts, visibility)
  const ids = visibleWorkouts.map((w) => w.id)
  const scores = ids.length
    ? await db.select({
        athleteId: score.athleteId,
        workoutId: score.workoutId,
        points: score.points,
        rawScore: score.rawScore,
        capped: score.capped,
        tiebreakRawScore: score.tiebreakRawScore,
        partBPoints: score.partBPoints,
        knockoutLabel: score.knockoutLabel,
      }).from(score).where(inArray(score.workoutId, ids))
    : []

  const { entries } = rankStandings({
    visibleWorkouts,
    athletes,
    scores,
    scoring,
    tiebreakWorkoutId: tiebreakSetting ? Number(tiebreakSetting) : null,
  })
  const order = new Map<number, number>()
  entries.forEach((e, i) => { if (hasResults(e)) order.set(e.athleteId, i) })
  return order
}

/** Best first by the board, then those not on it yet in registration (id) order. */
export function bySeed(order: Map<number, number>) {
  const at = (id: number) => order.get(id) ?? Number.POSITIVE_INFINITY
  return (a: { id: number }, b: { id: number }) => {
    const pa = at(a.id)
    const pb = at(b.id)
    if (pa !== pb) return pa < pb ? -1 : 1
    return a.id - b.id
  }
}
