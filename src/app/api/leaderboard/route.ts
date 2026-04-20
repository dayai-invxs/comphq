import { sql } from '@/lib/db'
import { formatScore } from '@/lib/scoreFormat'

export async function GET() {
  const [workouts, athletes, scores] = await Promise.all([
    sql`SELECT * FROM "Workout" WHERE status = 'completed' ORDER BY number`,
    sql`
      SELECT a.*,
        CASE WHEN d.id IS NOT NULL THEN
          jsonb_build_object('id', d.id, 'name', d.name, 'order', d."order")
        ELSE NULL END as division
      FROM "Athlete" a
      LEFT JOIN "Division" d ON a."divisionId" = d.id
      ORDER BY a.name
    `,
    sql`SELECT * FROM "Score" WHERE "workoutId" = ANY(
      SELECT id FROM "Workout" WHERE status = 'completed'
    )`,
  ])

  const scoreMap = new Map<string, { points: number; rawScore: number; scoreType: string }>()
  for (const s of scores) {
    if (s.points != null) {
      const wo = workouts.find((w) => w.id === s.workoutId)
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, {
        points: s.points as number,
        rawScore: s.rawScore as number,
        scoreType: wo?.scoreType as string ?? '',
      })
    }
  }

  const entries = athletes.map((a) => {
    let totalPoints = 0
    const workoutScores: Record<number, { points: number; display: string } | null> = {}
    for (const w of workouts) {
      const entry = scoreMap.get(`${a.id}-${w.id}`)
      if (entry) {
        totalPoints += entry.points
        workoutScores[w.id as number] = { points: entry.points, display: formatScore(entry.rawScore, entry.scoreType) }
      } else {
        workoutScores[w.id as number] = null
      }
    }
    const division = a.division as { name: string } | null
    return { athleteId: a.id, athleteName: a.name, divisionName: division?.name ?? null, totalPoints, workoutScores }
  })

  entries.sort((a, b) => {
    const aHas = Object.values(a.workoutScores).some((v) => v !== null)
    const bHas = Object.values(b.workoutScores).some((v) => v !== null)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
    return a.athleteName.localeCompare(b.athleteName as string)
  })

  return Response.json({ workouts, entries })
}
