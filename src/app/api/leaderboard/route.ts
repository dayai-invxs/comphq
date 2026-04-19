import { prisma } from '@/lib/prisma'
import { formatScore } from '@/lib/scoreFormat'

export async function GET() {
  const [workouts, athletes, scores] = await Promise.all([
    prisma.workout.findMany({
      where: { status: 'completed' },
      orderBy: { number: 'asc' },
    }),
    prisma.athlete.findMany({
      orderBy: { name: 'asc' },
      include: { division: true },
    }),
    prisma.score.findMany({
      where: { workout: { status: 'completed' } },
    }),
  ])

  const scoreMap = new Map<string, { points: number; rawScore: number; scoreType: string }>()
  for (const s of scores) {
    if (s.points != null) {
      const wo = workouts.find((w) => w.id === s.workoutId)
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, {
        points: s.points,
        rawScore: s.rawScore,
        scoreType: wo?.scoreType ?? '',
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
        workoutScores[w.id] = { points: entry.points, display: formatScore(entry.rawScore, entry.scoreType) }
      } else {
        workoutScores[w.id] = null
      }
    }
    return {
      athleteId: a.id,
      athleteName: a.name,
      divisionName: a.division?.name ?? null,
      totalPoints,
      workoutScores,
    }
  })

  // Sort by totalPoints ascending (lower is better), athletes with 0 completed workouts go last
  entries.sort((a, b) => {
    const aHas = Object.values(a.workoutScores).some((v) => v !== null)
    const bHas = Object.values(b.workoutScores).some((v) => v !== null)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
    return a.athleteName.localeCompare(b.athleteName)
  })

  return Response.json({ workouts, entries })
}
