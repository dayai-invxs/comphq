import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'
import { formatScore } from '@/lib/scoreFormat'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const [{ data: workouts }, { data: athletes }, { data: tiebreakSetting }] = await Promise.all([
    supabase.from('Workout').select('*').eq('competitionId', competition.id).eq('status', 'completed').order('number'),
    supabase.from('Athlete').select('*, division:Division(id, name, order)').eq('competitionId', competition.id).order('name'),
    supabase.from('Setting').select('value').eq('competitionId', competition.id).eq('key', 'tiebreakWorkoutId').maybeSingle(),
  ])

  const tiebreakWorkoutId = (tiebreakSetting as { value?: string } | null)?.value
    ? Number((tiebreakSetting as { value: string }).value)
    : null

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
    const workoutScores: Record<number, { points: number; rawScore: number; display: string } | null> = {}
    for (const w of (workouts ?? [])) {
      const workout = w as { id: number; halfWeight: boolean }
      const entry = scoreMap.get(`${athlete.id}-${workout.id}`)
      if (entry) {
        totalPoints += workout.halfWeight ? entry.points * 0.5 : entry.points
        workoutScores[workout.id] = { points: entry.points, rawScore: entry.rawScore, display: formatScore(entry.rawScore, entry.scoreType) }
      } else {
        workoutScores[workout.id] = null
      }
    }
    return { athleteId: athlete.id, athleteName: athlete.name, divisionName: athlete.division?.name ?? null, totalPoints, workoutScores }
  })

  const workoutsByNumber = [...(workouts ?? [])].sort((x, y) => (y as { number: number }).number - (x as { number: number }).number)
  const tiedWorkoutIds = workoutsByNumber.map((w) => (w as { id: number }).id)

  const tiebreakWorkout = tiebreakWorkoutId
    ? (workouts ?? []).find((w) => (w as { id: number }).id === tiebreakWorkoutId) as { id: number; scoreType: string } | undefined
    : undefined

  entries.sort((a, b) => {
    const aHas = Object.values(a.workoutScores).some((v) => v !== null)
    const bHas = Object.values(b.workoutScores).some((v) => v !== null)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
    // Tiebreaker 1: compare placements workout by workout (most recent first)
    for (const wId of tiedWorkoutIds) {
      const aScore = a.workoutScores[wId]
      const bScore = b.workoutScores[wId]
      if (aScore && bScore && aScore.points !== bScore.points) return aScore.points - bScore.points
      if (aScore && !bScore) return -1
      if (!aScore && bScore) return 1
    }
    // Tiebreaker 2: raw score on designated tiebreaker workout
    if (tiebreakWorkout) {
      const aRaw = a.workoutScores[tiebreakWorkout.id]?.rawScore ?? null
      const bRaw = b.workoutScores[tiebreakWorkout.id]?.rawScore ?? null
      if (aRaw != null && bRaw != null && aRaw !== bRaw) {
        return tiebreakWorkout.scoreType === 'time' ? aRaw - bRaw : bRaw - aRaw
      }
    }
    return a.athleteName.localeCompare(b.athleteName)
  })

  return Response.json(
    { workouts: workouts ?? [], entries, tiebreakWorkoutId, halfWeightIds: (workouts ?? []).filter((w) => (w as { halfWeight: boolean }).halfWeight).map((w) => (w as { id: number }).id) },
    { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' } },
  )
}
