import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs } from '@/lib/heatTime'
import { getCompletedHeatsByWorkout } from '@/lib/heatCompletion'
import { ASSIGNMENT_EMBED } from '@/lib/embeds'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import { lowerIsBetter } from '@/lib/scoring'

type Workout = {
  id: number; number: number; name: string; status: string; startTime: string | null
  heatIntervalSecs: number; heatStartOverrides: Record<string, string> | string; timeBetweenHeatsSecs: number
  callTimeSecs: number; walkoutTimeSecs: number; scoreType: string; tiebreakEnabled: boolean; tiebreakScoreType: string
}

type Assignment = {
  workoutId: number; athleteId: number; heatNumber: number; lane: number
  athlete: { name: string; bibNumber: string | null; division: { name: string } | null }
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { data: setting } = await supabase
    .from('Setting').select('value').eq('competitionId', competition.id).eq('key', 'showBib').maybeSingle()
  const showBib = (setting as { value?: string } | null)?.value !== 'false'

  const { data: workouts } = await supabase
    .from('Workout')
    .select('*')
    .eq('competitionId', competition.id)
    .order('number')

  const workoutIds = (workouts ?? []).map((w) => (w as Workout).id)

  const [assignmentsRes, scoresRes, completedByWorkout] = await Promise.all([
    workoutIds.length > 0
      ? supabase
          .from('HeatAssignment')
          .select(ASSIGNMENT_EMBED)
          .in('workoutId', workoutIds)
          .order('heatNumber')
          .order('lane')
      : Promise.resolve({ data: [] as Assignment[] }),
    workoutIds.length > 0
      ? supabase.from('Score').select('athleteId, workoutId, rawScore, tiebreakRawScore').in('workoutId', workoutIds)
      : Promise.resolve({ data: [] as Array<{ athleteId: number; workoutId: number; rawScore: number; tiebreakRawScore: number | null }> }),
    getCompletedHeatsByWorkout(workoutIds),
  ])

  const assignments = assignmentsRes.data ?? []
  const scores = scoresRes.data ?? []

  // Pre-format scores per athlete/workout so completed heats can show results
  // inline without the public page needing to know scoreType rules.
  const scoreMap = new Map<string, string>()
  const tiebreakMap = new Map<string, string>()
  for (const s of scores) {
    const row = s as { athleteId: number; workoutId: number; rawScore: number; tiebreakRawScore: number | null }
    const w = (workouts as Workout[]).find((x) => x.id === row.workoutId)
    if (w) {
      scoreMap.set(`${row.athleteId}-${row.workoutId}`, formatScore(row.rawScore, w.scoreType))
      if (w.tiebreakEnabled && row.tiebreakRawScore != null) {
        const tbDisplay = w.tiebreakScoreType === 'time'
          ? formatTiebreak(row.tiebreakRawScore)
          : formatScore(row.tiebreakRawScore, w.tiebreakScoreType)
        tiebreakMap.set(`${row.athleteId}-${row.workoutId}`, tbDisplay)
      }
    }
  }

  const result = ((workouts ?? []) as Workout[]).map((workout) => {
    const completedHeats = completedByWorkout.get(workout.id) ?? []
    const wAssignments = (assignments as Assignment[]).filter((a) => a.workoutId === workout.id)
    const heatNums = [...new Set(wAssignments.map((a) => a.heatNumber))].sort((a, b) => a - b)

    const heats = heatNums.map((heatNumber) => {
      const heatStartMs = calcHeatStartMs(
        heatNumber,
        workout.startTime,
        workout.heatIntervalSecs,
        workout.heatStartOverrides,
        workout.timeBetweenHeatsSecs,
      )
      const entries = wAssignments
        .filter((a) => a.heatNumber === heatNumber)
        .map((a) => ({
          athleteId: a.athleteId,
          athleteName: a.athlete.name,
          bibNumber: a.athlete.bibNumber,
          divisionName: a.athlete.division?.name ?? null,
          lane: a.lane,
          scoreDisplay: scoreMap.get(`${a.athleteId}-${workout.id}`) ?? null,
          tiebreakDisplay: tiebreakMap.get(`${a.athleteId}-${workout.id}`) ?? null,
        }))
      return {
        heatNumber,
        isComplete: completedHeats.includes(heatNumber),
        heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
        corralTime: heatStartMs != null ? new Date(heatStartMs - workout.callTimeSecs * 1000).toISOString() : null,
        walkoutTime: heatStartMs != null ? new Date(heatStartMs - workout.walkoutTimeSecs * 1000).toISOString() : null,
        entries,
      }
    })

    return {
      id: workout.id, number: workout.number, name: workout.name, status: workout.status,
      startTime: workout.startTime, heatIntervalSecs: workout.heatIntervalSecs,
      timeBetweenHeatsSecs: workout.timeBetweenHeatsSecs, callTimeSecs: workout.callTimeSecs,
      walkoutTimeSecs: workout.walkoutTimeSecs, heatStartOverrides: workout.heatStartOverrides,
      heats,
    }
  })

  return Response.json({ workouts: result, showBib }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  })
}
