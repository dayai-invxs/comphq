import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, heatCompletion, judgeAssignment } from '@/db/schema'
import { SCORES_BLOCK_MESSAGE, workoutHasScores } from '@/lib/heatDeletion'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'

type HeatKeyed = typeof heatAssignment | typeof judgeAssignment | typeof heatCompletion

// DELETE /api/workouts/[id]/heats/[heatNum] — removes one heat: its lanes, its
// judges and its completion. Later heats keep their numbers and start times,
// so the schedule is left with a gap where this heat was. Start-time overrides
// are left alone too: one set on this heat still anchors the heats after it.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; heatNum: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id, heatNum } = await params
    const workoutId = Number(id)
    const heatNumber = Number(heatNum)
    if (!Number.isInteger(heatNumber) || heatNumber < 1) {
      return new Response('Invalid heat number', { status: 400 })
    }
    await requireWorkoutInCompetition(workoutId, competition.id)

    if (await workoutHasScores(workoutId)) {
      return new Response(SCORES_BLOCK_MESSAGE, { status: 409 })
    }

    await db.transaction(async (tx) => {
      for (const t of [heatAssignment, judgeAssignment, heatCompletion] as HeatKeyed[]) {
        await tx.delete(t).where(and(eq(t.workoutId, workoutId), eq(t.heatNumber, heatNumber)))
      }
    })

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}
