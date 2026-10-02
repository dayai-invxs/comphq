import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { athlete, competition, division, heatAssignment, workout, workoutLocation } from '@/db/schema'
import type { Current } from '@/lib/competitionCorner/diff'
import type { Writes } from '@/lib/competitionCorner/writes'

/**
 * The database side of the import: read what the competition holds, and
 * write what `planWrites` decided. Every write is scoped to the competition.
 */

type Db = ReturnType<typeof getDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Queryable = Pick<Tx, 'select'>

export async function loadCurrent(q: Queryable, competitionId: number): Promise<Current> {
  const [divisions, workouts, athletes, heatAssignments] = await Promise.all([
    q.select({ id: division.id, name: division.name, order: division.order, externalId: division.externalId })
      .from(division).where(eq(division.competitionId, competitionId)),
    q.select({
      id: workout.id, number: workout.number, name: workout.name, description: workout.description,
      scoreType: workout.scoreType, tiebreakEnabled: workout.tiebreakEnabled, tiebreakScoreType: workout.tiebreakScoreType,
      partBEnabled: workout.partBEnabled, partBScoreType: workout.partBScoreType, lanes: workout.lanes,
      startTime: workout.startTime, heatIntervalSecs: workout.heatIntervalSecs, timeBetweenHeatsSecs: workout.timeBetweenHeatsSecs,
      heatStartOverrides: workout.heatStartOverrides, location: workoutLocation.name,
      externalId: workout.externalId, externalPartBId: workout.externalPartBId,
    }).from(workout)
      .leftJoin(workoutLocation, eq(workout.locationId, workoutLocation.id))
      .where(eq(workout.competitionId, competitionId)),
    q.select({ id: athlete.id, name: athlete.name, divisionId: athlete.divisionId, externalId: athlete.externalId })
      .from(athlete).where(eq(athlete.competitionId, competitionId)),
    q.select({ workoutId: heatAssignment.workoutId, athleteId: heatAssignment.athleteId, heatNumber: heatAssignment.heatNumber, lane: heatAssignment.lane })
      .from(heatAssignment).innerJoin(workout, eq(heatAssignment.workoutId, workout.id))
      .where(eq(workout.competitionId, competitionId)),
  ])
  return { divisions, workouts, athletes, heatAssignments }
}

const idsByExternalId = (rows: Array<{ id: number; externalId: string | null }>) =>
  new Map(rows.map((r) => [r.externalId!, r.id]))

/** Finds each named location, case-insensitively, creating the missing ones. */
async function resolveLocations(tx: Tx, competitionId: number, names: string[]): Promise<Map<string, number>> {
  const byName = new Map<string, number>()
  if (names.length === 0) return byName
  const existing = await tx.select({ id: workoutLocation.id, name: workoutLocation.name })
    .from(workoutLocation).where(eq(workoutLocation.competitionId, competitionId))
  for (const l of existing) byName.set(l.name.trim().toLowerCase(), l.id)
  const missing = names.filter((n) => !byName.has(n.trim().toLowerCase()))
  if (missing.length) {
    const created = await tx.insert(workoutLocation)
      .values(missing.map((name) => ({ competitionId, name })))
      .returning({ id: workoutLocation.id, name: workoutLocation.name })
    for (const l of created) byName.set(l.name.trim().toLowerCase(), l.id)
  }
  return byName
}

export async function executeWrites(tx: Tx, competitionId: number, eventId: number, w: Writes): Promise<void> {
  const inCompetition = <T extends typeof division | typeof workout | typeof athlete>(t: T, ids: number[]) =>
    and(eq(t.competitionId, competitionId), inArray(t.id, ids))
  const byId = <T extends typeof division | typeof workout | typeof athlete>(t: T, id: number) =>
    and(eq(t.competitionId, competitionId), eq(t.id, id))

  if (w.divisions.remove.length) await tx.delete(division).where(inCompetition(division, w.divisions.remove))
  for (const u of w.divisions.update) await tx.update(division).set(u.set).where(byId(division, u.id))
  if (w.divisions.insert.length) await tx.insert(division).values(w.divisions.insert.map((d) => ({ ...d, competitionId })))

  const locationIds = await resolveLocations(tx, competitionId, w.locations)
  const locationId = (name: string | null) => (name ? locationIds.get(name.trim().toLowerCase()) ?? null : null)

  if (w.workouts.remove.length) await tx.delete(workout).where(inCompetition(workout, w.workouts.remove))
  for (const u of w.workouts.update) {
    const set = u.location === undefined ? u.set : { ...u.set, locationId: locationId(u.location) }
    await tx.update(workout).set(set).where(byId(workout, u.id))
  }
  if (w.workouts.insert.length) {
    await tx.insert(workout).values(w.workouts.insert.map(({ location, ...cols }) => ({ ...cols, competitionId, locationId: locationId(location) })))
  }

  const athleteDivisions = w.athletes.insert.length || w.athletes.update.some((u) => u.divisionExternalId !== undefined)
  const divisionIds = athleteDivisions
    ? idsByExternalId(await tx.select({ id: division.id, externalId: division.externalId }).from(division)
      .where(and(eq(division.competitionId, competitionId), isNotNull(division.externalId))))
    : new Map<string, number>()
  const divisionId = (ext: string | null) => (ext ? divisionIds.get(ext) ?? null : null)

  if (w.athletes.remove.length) await tx.delete(athlete).where(inCompetition(athlete, w.athletes.remove))
  for (const u of w.athletes.update) {
    const set = u.divisionExternalId === undefined ? u.set : { ...u.set, divisionId: divisionId(u.divisionExternalId) }
    await tx.update(athlete).set(set).where(byId(athlete, u.id))
  }
  if (w.athletes.insert.length) {
    await tx.insert(athlete).values(w.athletes.insert.map((a) => ({
      competitionId, name: a.name, externalId: a.externalId, divisionId: divisionId(a.divisionExternalId),
    })))
  }

  if (w.heats.length) {
    const [workoutRows, athleteRows] = await Promise.all([
      tx.select({ id: workout.id, externalId: workout.externalId }).from(workout)
        .where(and(eq(workout.competitionId, competitionId), isNotNull(workout.externalId))),
      tx.select({ id: athlete.id, externalId: athlete.externalId }).from(athlete)
        .where(and(eq(athlete.competitionId, competitionId), isNotNull(athlete.externalId))),
    ])
    const workoutIds = idsByExternalId(workoutRows)
    const athleteIds = idsByExternalId(athleteRows)
    for (const h of w.heats) {
      const workoutId = workoutIds.get(h.workoutExternalId)
      if (workoutId == null) throw new Error(`Workout ${h.workoutExternalId} is missing after the import wrote it.`)
      const assignments = h.assignments.map((a) => {
        const athleteId = athleteIds.get(a.athleteExternalId)
        if (athleteId == null) throw new Error(`Athlete ${a.athleteExternalId} is missing after the import wrote it.`)
        return { athleteId, heatNumber: a.heatNumber, lane: a.lane }
      })
      await tx.execute(sql`SELECT replace_workout_heat_assignments(${workoutId}::int, ${JSON.stringify(assignments)}::jsonb)`)
      // The RPC clears the overrides; these are the source's for the sheet just placed.
      await tx.update(workout).set({ heatStartOverrides: h.heatStartOverrides }).where(eq(workout.id, workoutId))
    }
  }

  await tx.update(competition).set({ ccEventId: eventId, ccSyncedAt: sql`now()` }).where(eq(competition.id, competitionId))
}
