import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, score, setting, workout } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'

type AthleteRow = {
  id: number
  name: string
  divisionName: string | null
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  async function readSetting(key: string): Promise<string | null> {
    const rows = await db
      .select({ value: setting.value })
      .from(setting)
      .where(and(eq(setting.competitionId, competition!.id), eq(setting.key, key)))
      .limit(1)
    return rows[0]?.value ?? null
  }

  const [workouts, athletesRaw, divisionsRaw, tiebreakSettingValue, tvLeaderboardPercentagesRaw, tvLeaderboardOrderRaw] = await Promise.all([
    db.select().from(workout).where(eq(workout.competitionId, competition.id)).orderBy(asc(workout.number)),
    db
      .select({
        id: athlete.id,
        name: athlete.name,
        divisionName: division.name,
      })
      .from(athlete)
      .leftJoin(division, eq(division.id, athlete.divisionId))
      .where(eq(athlete.competitionId, competition.id))
      .orderBy(asc(athlete.name)),
    db.select({ name: division.name, order: division.order }).from(division).where(eq(division.competitionId, competition.id)).orderBy(asc(division.order)),
    readSetting('tiebreakWorkoutId'),
    readSetting('tvLeaderboardPercentages'),
    readSetting('tvLeaderboardOrder'),
  ])

  const athletes: AthleteRow[] = athletesRaw
  const visibleWorkouts = workouts.filter((w) => w.status === 'active' || w.status === 'completed')

  const tiebreakWorkoutId = tiebreakSettingValue ? Number(tiebreakSettingValue) : null

  const workoutIds = visibleWorkouts.map((w) => w.id)
  const scores = workoutIds.length > 0
    ? await db
        .select({
          athleteId: score.athleteId,
          workoutId: score.workoutId,
          points: score.points,
          rawScore: score.rawScore,
          tiebreakRawScore: score.tiebreakRawScore,
        })
        .from(score)
        .where(inArray(score.workoutId, workoutIds))
    : []

  const scoreMap = new Map<string, { points: number; rawScore: number; scoreType: string; tiebreakRawScore: number | null; tiebreakEnabled: boolean; tiebreakScoreType: string }>()
  for (const s of scores) {
    if (s.points != null) {
      const wo = visibleWorkouts.find((w) => w.id === s.workoutId)
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, {
        points: s.points,
        rawScore: s.rawScore,
        scoreType: wo?.scoreType ?? '',
        tiebreakRawScore: s.tiebreakRawScore ?? null,
        tiebreakEnabled: wo?.tiebreakEnabled ?? false,
        tiebreakScoreType: wo?.tiebreakScoreType ?? 'time',
      })
    }
  }

  const entries = athletes.map((a) => {
    let totalPoints = 0
    const workoutScores: Record<number, { points: number; rawScore: number; display: string; tiebreakDisplay: string | null } | null> = {}
    for (const wo of visibleWorkouts) {
      const entry = scoreMap.get(`${a.id}-${wo.id}`)
      if (entry) {
        totalPoints += wo.halfWeight ? entry.points * 0.5 : entry.points
        const tiebreakDisplay = entry.tiebreakEnabled && entry.tiebreakRawScore != null
          ? (entry.tiebreakScoreType === 'time' ? formatTiebreak(entry.tiebreakRawScore) : formatScore(entry.tiebreakRawScore, entry.tiebreakScoreType))
          : null
        workoutScores[wo.id] = { points: entry.points, rawScore: entry.rawScore, display: formatScore(entry.rawScore, entry.scoreType), tiebreakDisplay }
      } else {
        workoutScores[wo.id] = null
      }
    }
    return { athleteId: a.id, athleteName: a.name, divisionName: a.divisionName ?? null, totalPoints, workoutScores }
  })

  const workoutsByNumber = [...visibleWorkouts].sort((x, y) => y.number - x.number)
  const tiedWorkoutIds = workoutsByNumber.map((w) => w.id)

  const tiebreakWorkout = tiebreakWorkoutId
    ? visibleWorkouts.find((w) => w.id === tiebreakWorkoutId)
    : undefined

  entries.sort((a, b) => {
    const aHas = Object.values(a.workoutScores).some((v) => v !== null)
    const bHas = Object.values(b.workoutScores).some((v) => v !== null)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
    for (const wId of tiedWorkoutIds) {
      const aScore = a.workoutScores[wId]
      const bScore = b.workoutScores[wId]
      if (aScore && bScore && aScore.points !== bScore.points) return aScore.points - bScore.points
      if (aScore && !bScore) return -1
      if (!aScore && bScore) return 1
    }
    if (tiebreakWorkout) {
      const aRaw = a.workoutScores[tiebreakWorkout.id]?.rawScore ?? null
      const bRaw = b.workoutScores[tiebreakWorkout.id]?.rawScore ?? null
      if (aRaw != null && bRaw != null && aRaw !== bRaw) {
        return tiebreakWorkout.scoreType === 'time' ? aRaw - bRaw : bRaw - aRaw
      }
    }
    return a.athleteName.localeCompare(b.athleteName)
  })

  let tvLeaderboardPercentages: Record<string, number> = {}
  try { tvLeaderboardPercentages = JSON.parse(tvLeaderboardPercentagesRaw ?? '{}') } catch { /* ignore */ }
  let tvLeaderboardOrder: Record<string, number> = {}
  try { tvLeaderboardOrder = JSON.parse(tvLeaderboardOrderRaw ?? '{}') } catch { /* ignore */ }

  return Response.json(
    {
      workouts: visibleWorkouts,
      entries,
      tiebreakWorkoutId,
      halfWeightIds: visibleWorkouts.filter((w) => w.halfWeight).map((w) => w.id),
      tvLeaderboardPercentages,
      tvLeaderboardOrder,
      divisions: divisionsRaw,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' } },
  )
}
