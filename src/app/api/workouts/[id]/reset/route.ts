import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatCompletion, score, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    await db.delete(score).where(eq(score.workoutId, workoutId))
    await db.delete(heatCompletion).where(eq(heatCompletion.workoutId, workoutId))
    await db.update(workout).set({ status: 'draft' }).where(eq(workout.id, workoutId))

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}
