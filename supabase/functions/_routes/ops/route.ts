import { and, eq, inArray, asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberNamesByAthlete } from '@/lib/teamMembers'
import { athlete, division, heatAssignment, score, setting, teamMember, workout, workoutLocation } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs } from '@/lib/heatTime'
import { getCompletedHeatsByWorkout } from '@/lib/heatCompletion'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import { isUnannounced, TBA } from '@/lib/unannounced'

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
      knockout: workout.knockout,
      secret: workout.secret,
      locationName: workoutLocation.name,
    })
    .from(workout)
    .leftJoin(workoutLocation, eq(workoutLocation.id, workout.locationId))
    .where(eq(workout.competitionId, competition.id))
    .orderBy(asc(workout.number))

  // An unannounced secret workout sends nothing but its number: no name,
  // place, times or heats, so its lineup cannot give it away.
  const workoutIds = workouts.filter((w) => !isUnannounced(w)).map((w) => w.id)

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
            memberName: teamMember.name,
            laneRawScore: heatAssignment.rawScore,
            laneCapped: heatAssignment.capped,
            round: heatAssignment.round,
            consolation: heatAssignment.consolation,
            athleteName: athlete.name,
            bibNumber: athlete.bibNumber,
            divisionName: division.name,
          })
          .from(heatAssignment)
          .innerJoin(athlete, eq(athlete.id, heatAssignment.athleteId))
          .leftJoin(division, eq(division.id, athlete.divisionId))
          // A split team's lane may name the member running it.
          .leftJoin(teamMember, eq(teamMember.id, heatAssignment.teamMemberId))
          .where(inArray(heatAssignment.workoutId, workoutIds))
          .orderBy(asc(heatAssignment.heatNumber), asc(heatAssignment.lane))
      : Promise.resolve([]),
    workoutIds.length > 0
      ? db
          .select({
            athleteId: score.athleteId,
            workoutId: score.workoutId,
            rawScore: score.rawScore,
            capped: score.capped,
            tiebreakRawScore: score.tiebreakRawScore,
          })
          .from(score)
          .where(inArray(score.workoutId, workoutIds))
      : Promise.resolve([]),
    getCompletedHeatsByWorkout(workoutIds),
  ])
  // A team shows its members under its name; an individual has none.
  const members = await memberNamesByAthlete([...new Set(assignmentRows.map((a) => a.athleteId))])

  const scoreMap = new Map<string, string>()
  const tiebreakMap = new Map<string, string>()
  for (const s of scoreRows) {
    const w = workouts.find((x) => x.id === s.workoutId)
    if (w) {
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, formatScore(s.rawScore, w.scoreType, s.capped))
      if (w.tiebreakEnabled && s.tiebreakRawScore != null) {
        const tbDisplay = w.tiebreakScoreType === 'time'
          ? formatTiebreak(s.tiebreakRawScore)
          : formatScore(s.tiebreakRawScore, w.tiebreakScoreType)
        tiebreakMap.set(`${s.athleteId}-${s.workoutId}`, tbDisplay)
      }
    }
  }

  const result = workouts.map((wk) => {
    if (isUnannounced(wk)) {
      return {
        id: wk.id, number: wk.number, name: TBA, status: wk.status, tba: true,
        locationName: null, startTime: null, heatIntervalSecs: 0, timeBetweenHeatsSecs: 0,
        callTimeSecs: 0, walkoutTimeSecs: 0, heatStartOverrides: {}, heats: [],
      }
    }
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
          members: a.memberName ? [a.memberName] : members.get(a.athleteId) ?? [],
          bibNumber: a.bibNumber,
          divisionName: a.divisionName ?? null,
          lane: a.lane,
          // A knockout consolation lane, which may share a heat with the winners'.
          ...(wk.knockout && a.consolation ? { consolation: true } : {}),
          // A knockout heat shows that round's result, not the final placing.
          scoreDisplay: wk.knockout
            ? (a.laneRawScore != null ? formatScore(a.laneRawScore, wk.scoreType, a.laneCapped) : null)
            : scoreMap.get(`${a.athleteId}-${wk.id}`) ?? null,
          tiebreakDisplay: tiebreakMap.get(`${a.athleteId}-${wk.id}`) ?? null,
        }))
      // A knockout heat's round (null on imported heats: round 1), so a
      // schedule can drop a round the tournament has moved past.
      const heatLanes = wAssignments.filter((a) => a.heatNumber === heatNumber)
      const round = wk.knockout ? heatLanes[0]?.round ?? 1 : undefined
      return {
        heatNumber,
        ...(round !== undefined ? { round } : {}),
        // A heat of consolation lanes only, so a schedule can say so.
        ...(wk.knockout && heatLanes.length > 0 && heatLanes.every((a) => a.consolation) ? { consolation: true } : {}),
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
      tba: false,
      knockout: wk.knockout,
      heats,
    }
  })

  return Response.json({ workouts: result, showBib }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  })
}
