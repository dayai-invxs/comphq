import { sql } from 'drizzle-orm'
import type { Athlete, Score } from '@/db/schema'
import { db } from '@/lib/db'
import { score as scoreTable } from '@/db/schema'

export type AthleteWithScore = Athlete & { scores: Score[] }

export function calcCumulativePoints(
  athletes: AthleteWithScore[],
  completedWorkouts: number[]
): Map<number, number> {
  const totals = new Map<number, number>()
  for (const athlete of athletes) {
    const total = athlete.scores
      .filter((s) => completedWorkouts.includes(s.workoutId) && s.points != null)
      .reduce((sum, s) => sum + (s.points ?? 0), 0)
    totals.set(athlete.id, total)
  }
  return totals
}

// Returns middle-out lane order: rank 0 (best) → middle lane.
// e.g. 5 lanes → [3, 2, 4, 1, 5]
function middleOutLaneOrder(totalLanes: number): number[] {
  const mid = Math.ceil(totalLanes / 2)
  const order: number[] = [mid]
  let left = mid - 1
  let right = mid + 1
  while (order.length < totalLanes) {
    if (left >= 1) order.push(left--)
    if (order.length < totalLanes && right <= totalLanes) order.push(right++)
  }
  return order
}

type AthleteInput = Pick<Athlete, 'id' | 'divisionId'>

interface AssignOptions {
  cumulativePoints?: Map<number, number>
  mixedHeats: boolean
  // divisionId → running order (lower runs first)
  divisionOrder: Map<number, number>
}

export function assignHeats(
  athletes: AthleteInput[],
  lanes: number,
  options: AssignOptions
): Array<{ athleteId: number; heatNumber: number; lane: number }> {
  const { cumulativePoints, mixedHeats, divisionOrder } = options
  const useSeeding = (cumulativePoints?.size ?? 0) > 0
  const laneOrder = useSeeding ? middleOutLaneOrder(lanes) : null

  function sortGroup(group: AthleteInput[]): AthleteInput[] {
    if (!useSeeding) return group
    return [...group].sort((a, b) => {
      const pa = cumulativePoints!.get(a.id) ?? Infinity
      const pb = cumulativePoints!.get(b.id) ?? Infinity
      return pa - pb
    })
  }

  // Assigns one contiguous block of athletes starting at heatOffset+1
  function assignBlock(
    group: AthleteInput[],
    heatOffset: number
  ): Array<{ athleteId: number; heatNumber: number; lane: number }> {
    const sorted = sortGroup(group)
    const numHeats = Math.ceil(sorted.length / lanes)
    const result: Array<{ athleteId: number; heatNumber: number; lane: number }> = []
    for (let i = 0; i < sorted.length; i++) {
      const rankInGroup = i % lanes
      if (useSeeding) {
        // Seeded: best athletes go in the last heat (championship heat)
        const groupIndex = Math.floor(i / lanes)
        const heatNumber = heatOffset + numHeats - groupIndex
        const lane = laneOrder ? (laneOrder[rankInGroup] ?? rankInGroup + 1) : rankInGroup + 1
        result.push({ athleteId: sorted[i].id, heatNumber, lane })
      } else {
        // Random/registration order: fill heats front-to-back, first heat is full
        const heatNumber = heatOffset + Math.floor(i / lanes) + 1
        const lane = rankInGroup + 1
        result.push({ athleteId: sorted[i].id, heatNumber, lane })
      }
    }
    return result
  }

  if (mixedHeats) {
    const sorted = useSeeding
      ? athletes
      : [...athletes].sort((a, b) => {
          const oa = a.divisionId === null ? Infinity : (divisionOrder.get(a.divisionId) ?? Infinity)
          const ob = b.divisionId === null ? Infinity : (divisionOrder.get(b.divisionId) ?? Infinity)
          return oa - ob
        })
    return assignBlock(sorted, 0)
  }

  // Separate by division: group athletes, then run each division's block in order
  const groups = new Map<number | null, AthleteInput[]>()
  for (const a of athletes) {
    const key = a.divisionId
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  // Sort division keys by their running order; null (no division) goes last
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const oa = a === null ? Infinity : (divisionOrder.get(a) ?? Infinity)
    const ob = b === null ? Infinity : (divisionOrder.get(b) ?? Infinity)
    return oa - ob
  })

  const all: Array<{ athleteId: number; heatNumber: number; lane: number }> = []
  let heatOffset = 0
  for (const key of sortedKeys) {
    const group = groups.get(key)!
    all.push(...assignBlock(group, heatOffset))
    heatOffset += Math.ceil(group.length / lanes)
  }
  return all
}

export function lowerIsBetter(scoreType: string): boolean {
  return scoreType === 'time' || scoreType === 'lower_is_better'
}

export function calculateRankings(
  scores: Array<{ athleteId: number; rawScore: number; tiebreakRawScore?: number | null }>,
  scoreType: string,
  tiebreakEnabled = false,
  tiebreakScoreType = 'time'
): Array<{ athleteId: number; rawScore: number; points: number }> {
  const sorted = [...scores].sort((a, b) => {
    const primary = lowerIsBetter(scoreType) ? a.rawScore - b.rawScore : b.rawScore - a.rawScore
    if (primary !== 0) return primary
    if (!tiebreakEnabled) return 0
    if (a.tiebreakRawScore == null && b.tiebreakRawScore == null) return 0
    if (a.tiebreakRawScore == null) return 1
    if (b.tiebreakRawScore == null) return -1
    return lowerIsBetter(tiebreakScoreType)
      ? a.tiebreakRawScore - b.tiebreakRawScore
      : b.tiebreakRawScore - a.tiebreakRawScore
  })
  // Standard competition ranking: tied athletes share the same rank and positions
  // are skipped (e.g. two 7th places → next is 9th, not 8th).
  const result: Array<{ athleteId: number; rawScore: number; points: number }> = []
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    if (i === 0) { result.push({ ...s, points: 1 }); continue }
    const prev = sorted[i - 1]
    const primaryTied = prev.rawScore === s.rawScore
    const tiebreakTied = !tiebreakEnabled ||
      (prev.tiebreakRawScore ?? null) === (s.tiebreakRawScore ?? null)
    result.push({ ...s, points: primaryTied && tiebreakTied ? result[i - 1].points : i + 1 })
  }
  return result
}

type ScoreRow = {
  athleteId: number
  workoutId: number
  rawScore: number
  tiebreakRawScore: number | null
  partBRawScore: number | null
  divisionId: number | null
}

type RankableWorkout = {
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
}

/**
 * Rank all Score rows for a workout (Part A + optional Part B) and persist
 * the computed points via a single bulk upsert. Returns the number of
 * ranked athletes (i.e. rows with non-null points after the call).
 *
 * Consolidates identical logic that previously lived in two routes
 * (/calculate and /heats/[heatNum]/complete).
 */
export async function rankAndPersist(
  workoutId: number,
  workout: RankableWorkout,
  scores: ScoreRow[],
): Promise<{ count: number; error: string | null }> {
  if (scores.length === 0) return { count: 0, error: null }

  // Group by division and rank within each division independently.
  const divisionGroups = new Map<number | null, ScoreRow[]>()
  for (const s of scores) {
    const key = s.divisionId
    if (!divisionGroups.has(key)) divisionGroups.set(key, [])
    divisionGroups.get(key)!.push(s)
  }

  const allRankedA: Array<{ athleteId: number; points: number }> = []
  const partBPointsMap = new Map<number, number>()

  for (const group of divisionGroups.values()) {
    const rankedA = calculateRankings(
      group.map((s) => ({
        athleteId: s.athleteId,
        rawScore: s.rawScore,
        tiebreakRawScore: s.tiebreakRawScore,
      })),
      workout.scoreType,
      workout.tiebreakEnabled,
      workout.tiebreakScoreType,
    )
    allRankedA.push(...rankedA)

    const partBScores = group.filter((s) => s.partBRawScore != null)
    if (workout.partBEnabled && partBScores.length > 0) {
      const rankedB = calculateRankings(
        partBScores.map((s) => ({ athleteId: s.athleteId, rawScore: s.partBRawScore as number })),
        workout.partBScoreType,
      )
      for (const { athleteId, points } of rankedB) partBPointsMap.set(athleteId, points)
    }
  }

  // Upsert preserves existing row shape; we only mutate the two point columns.
  // Build full rows from the input `scores` so rawScore/tiebreak aren't wiped.
  const scoreByAthlete = new Map(scores.map((s) => [s.athleteId, s]))
  const rows = allRankedA.map(({ athleteId, points }) => {
    const existing = scoreByAthlete.get(athleteId)!
    return {
      athleteId,
      workoutId,
      rawScore: existing.rawScore,
      tiebreakRawScore: existing.tiebreakRawScore,
      partBRawScore: existing.partBRawScore,
      points,
      partBPoints: partBPointsMap.get(athleteId) ?? null,
    }
  })

  try {
    await db
      .insert(scoreTable)
      .values(rows)
      .onConflictDoUpdate({
        target: [scoreTable.athleteId, scoreTable.workoutId],
        // Per-row values from the incoming batch: EXCLUDED refers to the
        // would-be-inserted row for each conflict.
        set: {
          rawScore: sql`excluded."rawScore"`,
          tiebreakRawScore: sql`excluded."tiebreakRawScore"`,
          partBRawScore: sql`excluded."partBRawScore"`,
          points: sql`excluded."points"`,
          partBPoints: sql`excluded."partBPoints"`,
        },
      })
    return { count: allRankedA.length, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return { count: allRankedA.length, error: msg }
  }
}
