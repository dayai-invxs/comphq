import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'
import { calcHeatStartMs } from '@/lib/heatTime'
import { getCompletedHeatsByWorkout } from '@/lib/heatCompletion'
import { ASSIGNMENT_EMBED } from '@/lib/embeds'

type Workout = {
  id: number; number: number; name: string; startTime: string | null
  heatIntervalSecs: number; heatStartOverrides: Record<string, string> | string; timeBetweenHeatsSecs: number
  callTimeSecs: number; walkoutTimeSecs: number
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
    .eq('status', 'active')
    .order('number')

  const workoutIds = (workouts ?? []).map((w) => (w as Workout).id)

  const [assignmentsRes, completedByWorkout] = await Promise.all([
    workoutIds.length > 0
      ? supabase
          .from('HeatAssignment')
          .select(ASSIGNMENT_EMBED)
          .in('workoutId', workoutIds)
          .order('heatNumber')
          .order('lane')
      : Promise.resolve({ data: [] as Assignment[] }),
    getCompletedHeatsByWorkout(workoutIds),
  ])

  const assignments = assignmentsRes.data ?? []

  const result = ((workouts ?? []) as Workout[]).map((workout) => {
    const completedHeats = completedByWorkout.get(workout.id) ?? []
    const wAssignments = (assignments as Assignment[]).filter((a) => a.workoutId === workout.id)

    const schedule = wAssignments
      .filter((a) => !completedHeats.includes(a.heatNumber))
      .map((a) => {
        const heatStartMs = calcHeatStartMs(
          a.heatNumber,
          workout.startTime,
          workout.heatIntervalSecs,
          workout.heatStartOverrides,
          workout.timeBetweenHeatsSecs,
        )
        return {
          athleteId: a.athleteId,
          athleteName: a.athlete.name,
          bibNumber: a.athlete.bibNumber,
          divisionName: a.athlete.division?.name ?? null,
          heatNumber: a.heatNumber,
          lane: a.lane,
          heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
          corralTime: heatStartMs != null ? new Date(heatStartMs - workout.callTimeSecs * 1000).toISOString() : null,
          walkoutTime: heatStartMs != null ? new Date(heatStartMs - workout.walkoutTimeSecs * 1000).toISOString() : null,
        }
      })

    return { id: workout.id, number: workout.number, name: workout.name, schedule }
  })

  return Response.json({ workouts: result, showBib }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  })
}
