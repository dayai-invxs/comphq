import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, heatAssignment, heatCompletion, judgeAssignment, score, workout } from '@/db/schema'
import { calcCumulativePoints, type AthleteWithScore } from '@/lib/scoring'
import {
  advancers, buildRound, currentRound, placings, roundOf,
  type KnockoutLane, type KnockoutWorkout,
} from '@/lib/knockout'

// The database half of a knockout tournament. The rules live in knockout.ts.

export type KnockoutWorkoutRow = KnockoutWorkout & { id: number; competitionId: number; knockout: boolean }

/** A refusal the admin can act on; routes turn it into a 409. */
export class KnockoutRefusal extends Error {}

async function divisionOrder(competitionId: number) {
  const rows = await db.select({ id: division.id, order: division.order }).from(division)
    .where(eq(division.competitionId, competitionId))
  const order = new Map(rows.map((d) => [d.id, d.order]))
  return (id: number | null) => (id == null ? Infinity : order.get(id) ?? Infinity)
}

export async function loadLanes(workoutId: number): Promise<KnockoutLane[]> {
  return await db
    .select({
      id: heatAssignment.id,
      athleteId: heatAssignment.athleteId,
      divisionId: athlete.divisionId,
      heatNumber: heatAssignment.heatNumber,
      lane: heatAssignment.lane,
      round: heatAssignment.round,
      rawScore: heatAssignment.rawScore,
      capped: heatAssignment.capped,
      tiebreakRawScore: heatAssignment.tiebreakRawScore,
      advanced: heatAssignment.advanced,
    })
    .from(heatAssignment)
    .innerJoin(athlete, eq(athlete.id, heatAssignment.athleteId))
    .where(eq(heatAssignment.workoutId, workoutId))
    .orderBy(asc(heatAssignment.heatNumber), asc(heatAssignment.lane))
}

/**
 * Round 1: everyone not withdrawn, each division seeded by the overall
 * leaderboard (completed workouts' points, fewest first), registration order
 * where nothing separates them. Replaces any heats the workout had.
 */
export async function startTournament(wk: KnockoutWorkoutRow): Promise<number> {
  const athletes = await db.select().from(athlete)
    .where(and(eq(athlete.competitionId, wk.competitionId), eq(athlete.withdrawn, false)))
    .orderBy(asc(athlete.id))
  if (athletes.length === 0) throw new KnockoutRefusal('There are no athletes/teams to place.')

  const completed = await db.select({ id: workout.id }).from(workout)
    .where(and(eq(workout.competitionId, wk.competitionId), eq(workout.status, 'completed')))
  const completedIds = completed.map((w) => w.id)
  const scores = completedIds.length
    ? await db.select().from(score).where(inArray(score.workoutId, completedIds))
    : []
  const scoresOf = new Map<number, typeof scores>()
  for (const s of scores) scoresOf.set(s.athleteId, [...(scoresOf.get(s.athleteId) ?? []), s])
  const points = calcCumulativePoints(
    athletes.map((a) => ({ ...a, scores: scoresOf.get(a.id) ?? [] })) as unknown as AthleteWithScore[],
    completedIds,
  )
  const ranked = (id: number) => (scoresOf.has(id) ? points.get(id) ?? Infinity : Infinity)

  const order = await divisionOrder(wk.competitionId)
  const byDivision = new Map<number | null, typeof athletes>()
  for (const a of athletes) byDivision.set(a.divisionId, [...(byDivision.get(a.divisionId) ?? []), a])
  const divisions = [...byDivision]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([, list]) => ({ seeded: [...list].sort((a, b) => ranked(a.id) - ranked(b.id) || a.id - b.id).map((a) => a.id) }))

  const placed = buildRound(divisions, wk.lanes, 1, 1)
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT replace_workout_heat_assignments(${wk.id}::int, ${JSON.stringify(placed)}::jsonb)`)
    await tx.update(heatAssignment).set({ round: 1 }).where(eq(heatAssignment.workoutId, wk.id))
    await tx.delete(heatCompletion).where(eq(heatCompletion.workoutId, wk.id))
    await tx.delete(judgeAssignment).where(eq(judgeAssignment.workoutId, wk.id))
  })
  return placed.length
}

/** Builds the next round from the latest one. Refused while a heat is unsettled. */
export async function advanceRound(wk: KnockoutWorkoutRow): Promise<{ round: number; placed: number }> {
  const lanes = await loadLanes(wk.id)
  const round = currentRound(lanes)
  if (round === 0) throw new KnockoutRefusal('Start the tournament first.')
  const rounds = wk.knockoutRounds ?? 1
  if (round >= rounds) throw new KnockoutRefusal(`Round ${round} is the final. Finish the tournament instead.`)

  const { byDivision, problems } = advancers(lanes.filter((l) => roundOf(l) === round), wk)
  if (problems.length) throw new KnockoutRefusal(problems.join(' '))

  const order = await divisionOrder(wk.competitionId)
  const divisions = [...byDivision].sort(([a], [b]) => order(a) - order(b)).map(([, seeded]) => ({ seeded }))
  const firstHeat = Math.max(0, ...lanes.map((l) => l.heatNumber)) + 1
  const placed = buildRound(divisions, wk.lanes, round + 1, firstHeat)
  if (placed.length) {
    await db.insert(heatAssignment).values(placed.map((p) => ({ workoutId: wk.id, ...p })))
  }
  return { round: round + 1, placed: placed.length }
}

/**
 * Removes the latest round's heats, so the round before it can be changed.
 * Refused for round 1 (Clear All Heats does that) and once the latest round
 * has results. Any finished placings go too.
 */
export async function undoRound(wk: KnockoutWorkoutRow): Promise<number> {
  const lanes = await loadLanes(wk.id)
  const round = currentRound(lanes)
  if (round <= 1) throw new KnockoutRefusal('Round 1 cannot be undone. Use Clear All Heats to start over.')
  const latest = lanes.filter((l) => roundOf(l) === round)
  if (latest.some((l) => l.rawScore != null || l.advanced != null)) {
    throw new KnockoutRefusal(`Round ${round} has results. Clear them first.`)
  }
  const heats = [...new Set(latest.map((l) => l.heatNumber))]
  await db.transaction(async (tx) => {
    await tx.delete(heatAssignment).where(and(eq(heatAssignment.workoutId, wk.id), inArray(heatAssignment.heatNumber, heats)))
    await tx.delete(heatCompletion).where(and(eq(heatCompletion.workoutId, wk.id), inArray(heatCompletion.heatNumber, heats)))
    await tx.delete(judgeAssignment).where(and(eq(judgeAssignment.workoutId, wk.id), inArray(judgeAssignment.heatNumber, heats)))
    await tx.delete(score).where(eq(score.workoutId, wk.id))
    await tx.update(workout).set({ status: 'active' }).where(and(eq(workout.id, wk.id), eq(workout.status, 'completed')))
  })
  return round - 1
}

/**
 * Final placings become the workout's scores: points are the placing, and
 * the result shown is where they went out and their score there.
 */
export async function finishTournament(wk: KnockoutWorkoutRow): Promise<number> {
  const lanes = await loadLanes(wk.id)
  const round = currentRound(lanes)
  const rounds = wk.knockoutRounds ?? 1
  if (round === 0) throw new KnockoutRefusal('Start the tournament first.')
  if (round < rounds) throw new KnockoutRefusal(`The tournament is in round ${round} of ${rounds}. Run the remaining rounds first.`)
  const final = lanes.filter((l) => roundOf(l) === round)
  if (!final.some((l) => l.rawScore != null || l.advanced === true)) {
    throw new KnockoutRefusal('Enter the final\'s results first.')
  }

  const placed = placings(lanes, wk)
  await db.transaction(async (tx) => {
    await tx.delete(score).where(eq(score.workoutId, wk.id))
    if (placed.length) {
      await tx.insert(score).values(placed.map((p) => ({
        athleteId: p.athleteId,
        workoutId: wk.id,
        rawScore: p.lane.rawScore ?? 0,
        capped: p.lane.capped,
        tiebreakRawScore: p.lane.tiebreakRawScore,
        points: p.points,
        partBRawScore: null,
        partBPoints: null,
        partBCapped: false,
        knockoutLabel: p.label,
      })))
    }
    await tx.update(workout).set({ status: 'completed' }).where(eq(workout.id, wk.id))
  })
  return placed.length
}
