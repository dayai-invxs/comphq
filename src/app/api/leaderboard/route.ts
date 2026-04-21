import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'
import { formatScore } from '@/lib/scoreFormat'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { data: workouts } = await supabase
    .from('Workout')
    .select('*')
    .eq('competitionId', competition.id)
    .eq('status', 'completed')
    .order('number')

  const { data: athletes } = await supabase
    .from('Athlete')
    .select('*, division:Division(id, name, order)')
    .eq('competitionId', competition.id)
    .order('name')

  const workoutIds = (workouts ?? []).map((w) => (w as { id: number }).id)
  const { data: scores } = workoutIds.length > 0
    ? await supabase.from('Score').select('*').in('workoutId', workoutIds)
    : { data: [] }

  const scoreMap = new Map<string, { points: number; rawScore: number; scoreType: string }>()
  for (const s of (scores ?? [])) {
    const row = s as { athleteId: number; workoutId: number; points: number | null; rawScore: number }
    if (row.points != null) {
      const wo = (workouts ?? []).find((w) => (w as { id: number }).id === row.workoutId)
      scoreMap.set(`${row.athleteId}-${row.workoutId}`, {
        points: row.points,
        rawScore: row.rawScore,
        scoreType: (wo as { scoreType?: string })?.scoreType ?? '',
      })
    }
  }

  const entries = (athletes ?? []).map((a) => {
    const athlete = a as { id: number; name: string; division: { name: string } | null }
    let totalPoints = 0
    const workoutScores: Record<number, { points: number; display: string } | null> = {}
    for (const w of (workouts ?? [])) {
      const workout = w as { id: number }
      const entry = scoreMap.get(`${athlete.id}-${workout.id}`)
      if (entry) {
        totalPoints += entry.points
        workoutScores[workout.id] = { points: entry.points, display: formatScore(entry.rawScore, entry.scoreType) }
      } else {
        workoutScores[workout.id] = null
      }
    }
    return {
      athleteId: athlete.id,
      athleteName: athlete.name,
      divisionName: athlete.division?.name ?? null,
      totalPoints,
      workoutScores,
    }
  })

  entries.sort((a, b) => {
    const aHas = Object.values(a.workoutScores).some((v) => v !== null)
    const bHas = Object.values(b.workoutScores).some((v) => v !== null)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
    return a.athleteName.localeCompare(b.athleteName)
  })

  return Response.json({ workouts: workouts ?? [], entries })
}
