import { and, eq, inArray, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, heatAssignment, score, setting, workout, workoutLocation } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs } from '@/lib/heatTime'
import { getCompletedHeatsByWorkout } from '@/lib/heatCompletion'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  // showBib setting
  const showBibRows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competition.id), eq(setting.key, 'showBib')))
    .limit(1)
  const showBib = showBibRows[0]?.value !== 'false'

  const workouts = await db
    .select({
      id: workout.id,
      number: workout.number,
      name: workout.name,
      status: workout.status,
      startTime: workout.startTime,
      heatIntervalSecs: workout.heatIntervalSecs,
      heatStartOverrides: workout.heatStartOverrides,
      timeBetweenHeatsSecs: workout.timeBetweenHeatsSecs,
      callTimeSecs: workout.callTimeSecs,
      walkoutTimeSecs: workout.walkoutTimeSecs,
      scoreType: workout.scoreType,
      tiebreakEnabled: workout.tiebreakEnabled,
      tiebreakScoreType: workout.tiebreakScoreType,
      locationName: workoutLocation.name,
    })
    .from(workout)
    .leftJoin(workoutLocation, eq(workoutLocation.id, workout.locationId))
    .where(eq(workout.competitionId, competition.id))
    .orderBy(asc(workout.number))

  const workoutIds = workouts.map((w) => w.id)

  // Assignments + athletes + divisions. Separate queries keep each query
  // focused; the cost is a couple of extra round-trips vs. one giant join.
  const [assignmentRows, scoreRows, completedByWorkout] = await Promise.all([
    workoutIds.length > 0
      ? db
          .select({
            workoutId: heatAssignment.workoutId,
            athleteId: heatAssignment.athleteId,
            heatNumber: heatAssignment.heatNumber,
            lane: heatAssignment.lane,
            athleteName: athlete.name,
            bibNumber: athlete.bibNumber,
            divisionName: division.name,
          })
          .from(heatAssignment)
          .innerJoin(athlete, eq(athlete.id, heatAssignment.athleteId))
          .leftJoin(division, eq(division.id, athlete.divisionId))
          .where(inArray(heatAssignment.workoutId, workoutIds))
          .orderBy(asc(heatAssignment.heatNumber), asc(heatAssignment.lane))
      : Promise.resolve([]),
    workoutIds.length > 0
      ? db
          .select({
            athleteId: score.athleteId,
            workoutId: score.workoutId,
            rawScore: score.rawScore,
            tiebreakRawScore: score.tiebreakRawScore,
          })
          .from(score)
          .where(inArray(score.workoutId, workoutIds))
      : Promise.resolve([]),
    getCompletedHeatsByWorkout(workoutIds),
  ])

  const scoreMap = new Map<string, string>()
  const tiebreakMap = new Map<string, string>()
  for (const s of scoreRows) {
    const w = workouts.find((x) => x.id === s.workoutId)
    if (w) {
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, formatScore(s.rawScore, w.scoreType))
      if (w.tiebreakEnabled && s.tiebreakRawScore != null) {
        const tbDisplay = w.tiebreakScoreType === 'time'
          ? formatTiebreak(s.tiebreakRawScore)
          : formatScore(s.tiebreakRawScore, w.tiebreakScoreType)
        tiebreakMap.set(`${s.athleteId}-${s.workoutId}`, tbDisplay)
      }
    }
  }

  const result = workouts.map((wk) => {
    const completedHeats = completedByWorkout.get(wk.id) ?? []
    const wAssignments = assignmentRows.filter((a) => a.workoutId === wk.id)
    const heatNums = [...new Set(wAssignments.map((a) => a.heatNumber))].sort((a, b) => a - b)

    const heats = heatNums.map((heatNumber) => {
      const heatStartMs = calcHeatStartMs(
        heatNumber,
        wk.startTime,
        wk.heatIntervalSecs,
        wk.heatStartOverrides,
        wk.timeBetweenHeatsSecs,
      )
      const entries = wAssignments
        .filter((a) => a.heatNumber === heatNumber)
        .map((a) => ({
          athleteId: a.athleteId,
          athleteName: a.athleteName,
          bibNumber: a.bibNumber,
          divisionName: a.divisionName ?? null,
          lane: a.lane,
          scoreDisplay: scoreMap.get(`${a.athleteId}-${wk.id}`) ?? null,
          tiebreakDisplay: tiebreakMap.get(`${a.athleteId}-${wk.id}`) ?? null,
        }))
      return {
        heatNumber,
        isComplete: completedHeats.includes(heatNumber),
        heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
        corralTime: heatStartMs != null ? new Date(heatStartMs - wk.callTimeSecs * 1000).toISOString() : null,
        walkoutTime: heatStartMs != null ? new Date(heatStartMs - wk.walkoutTimeSecs * 1000).toISOString() : null,
        entries,
      }
    })

    return {
      id: wk.id,
      number: wk.number,
      name: wk.name,
      status: wk.status,
      locationName: wk.locationName ?? null,
      startTime: wk.startTime,
      heatIntervalSecs: wk.heatIntervalSecs,
      timeBetweenHeatsSecs: wk.timeBetweenHeatsSecs,
      callTimeSecs: wk.callTimeSecs,
      walkoutTimeSecs: wk.walkoutTimeSecs,
      heatStartOverrides: wk.heatStartOverrides,
      heats,
    }
  })

  return Response.json({ workouts: result, showBib }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  })
}
