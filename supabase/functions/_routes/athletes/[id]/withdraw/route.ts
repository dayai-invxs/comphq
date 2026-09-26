import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, workout, score } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { rankAndPersist } from '@/lib/scoring'

type WorkoutRow = {
  id: number
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  partBEnabled: boolean
  partBScoreType: string
  status: string
}

async function getCompetitionAndAthlete(slug: string, id: number) {
  const { competition } = await requireCompetitionAccess(slug)
  const [row] = await db
    .select({ id: athlete.id, withdrawn: athlete.withdrawn })
    .from(athlete)
    .where(and(eq(athlete.id, id), eq(athlete.competitionId, competition.id)))
    .limit(1)
  if (!row) throw new Error('not_found')
  return { competition, athlete: row }
}

// POST — withdraw athlete: flag + insert 0-scores + recalculate completed workouts
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition, athlete: a } = await getCompetitionAndAthlete(slug, Number((await params).id))
    if (a.withdrawn) return Response.json({ withdrawn: true })

    await db
      .update(athlete)
      .set({ withdrawn: true })
      .where(and(eq(athlete.id, a.id), eq(athlete.competitionId, competition.id)))

    const workouts: WorkoutRow[] = await db
      .select({
        id: workout.id,
        scoreType: workout.scoreType,
        tiebreakEnabled: workout.tiebreakEnabled,
        tiebreakScoreType: workout.tiebreakScoreType,
        partBEnabled: workout.partBEnabled,
        partBScoreType: workout.partBScoreType,
        status: workout.status,
      })
      .from(workout)
      .where(eq(workout.competitionId, competition.id))

    if (workouts.length === 0) return Response.json({ withdrawn: true })

    const workoutIds = workouts.map((w) => w.id)
    const existingScores = await db
      .select({ workoutId: score.workoutId })
      .from(score)
      .where(and(eq(score.athleteId, a.id), inArray(score.workoutId, workoutIds)))

    const scoredIds = new Set(existingScores.map((s) => s.workoutId))
    const unscoredWorkouts = workouts.filter((w) => !scoredIds.has(w.id))

    if (unscoredWorkouts.length > 0) {
      await db.insert(score).values(
        unscoredWorkouts.map((w) => ({
          athleteId: a.id,
          workoutId: w.id,
          rawScore: 0,
          tiebreakRawScore: w.tiebreakEnabled ? 0 : null,
          partBRawScore: w.partBEnabled ? 0 : null,
          points: null,
          partBPoints: null,
        })),
      )

      for (const wk of unscoredWorkouts.filter((w) => w.status === 'completed')) {
        const allScores = await db
          .select({
            athleteId: score.athleteId,
            workoutId: score.workoutId,
            rawScore: score.rawScore,
            tiebreakRawScore: score.tiebreakRawScore,
            partBRawScore: score.partBRawScore,
            divisionId: athlete.divisionId,
          })
          .from(score)
          .innerJoin(athlete, eq(athlete.id, score.athleteId))
          .where(eq(score.workoutId, wk.id))
        if (allScores.length > 0) {
          await rankAndPersist(wk.id, wk, allScores)
        }
      }
    }

    return Response.json({ withdrawn: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'not_found') return new Response('Athlete not found', { status: 404 })
    return authErrorResponse(e)
  }
}

// DELETE — un-withdraw: clears the flag only; inserted 0-scores are left in place
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition, athlete: a } = await getCompetitionAndAthlete(slug, Number((await params).id))
    await db
      .update(athlete)
      .set({ withdrawn: false })
      .where(and(eq(athlete.id, a.id), eq(athlete.competitionId, competition.id)))
    return Response.json({ withdrawn: false })
  } catch (e) {
    if (e instanceof Error && e.message === 'not_found') return new Response('Athlete not found', { status: 404 })
    return authErrorResponse(e)
  }
}
