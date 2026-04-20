import { supabase } from '@/lib/supabase'
import { calcHeatStartMs } from '@/lib/heatTime'

const ASSIGNMENT_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId, division:Division(id, name, order))'

type Workout = {
  id: number; number: number; name: string; startTime: string | null
  heatIntervalSecs: number; heatStartOverrides: string; timeBetweenHeatsSecs: number
  callTimeSecs: number; walkoutTimeSecs: number; completedHeats: string
}

type Assignment = {
  workoutId: number; athleteId: number; heatNumber: number; lane: number
  athlete: { name: string; bibNumber: string | null; division: { name: string } | null }
}

export async function GET() {
  const { data: setting } = await supabase
    .from('Setting').select('value').eq('key', 'showBib').maybeSingle()
  const showBib = (setting as { value?: string } | null)?.value !== 'false'

  const { data: workouts } = await supabase
    .from('Workout')
    .select('*')
    .eq('status', 'active')
    .order('number')

  const workoutIds = (workouts ?? []).map((w) => (w as Workout).id)
  const { data: assignments } = workoutIds.length > 0
    ? await supabase
        .from('HeatAssignment')
        .select(ASSIGNMENT_EMBED)
        .in('workoutId', workoutIds)
        .order('heatNumber')
        .order('lane')
    : { data: [] }

  const result = ((workouts ?? []) as Workout[]).map((workout) => {
    const completedHeats: number[] = JSON.parse(workout.completedHeats || '[]')
    const wAssignments = ((assignments ?? []) as Assignment[]).filter((a) => a.workoutId === workout.id)

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

  return Response.json({ workouts: result, showBib })
}
