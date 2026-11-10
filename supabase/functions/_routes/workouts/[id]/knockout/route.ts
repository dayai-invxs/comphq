import { authErrorResponse, requireCompetitionAccess, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { KnockoutAction } from '@/lib/schemas'
import { SCORES_BLOCK_MESSAGE, workoutHasScores } from '@/lib/heatDeletion'
import {
  advanceRound, finishTournament, KnockoutRefusal, startTournament, undoRound, type KnockoutWorkoutRow,
} from '@/lib/knockoutStore'

// POST /api/workouts/[id]/knockout { action }
//   start   — round 1 for everyone, seeded by the overall leaderboard
//   advance — the next round, from who advanced in the latest one
//   finish  — final placings become the workout's points
// DELETE    — undo the latest round (only while it has no results)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, KnockoutAction)
  if (!parsed.ok) return parsed.response

  try {
    const wk = await knockoutWorkout(slug, params)
    if (wk instanceof Response) return wk
    switch (parsed.data.action) {
      case 'start':
        if (await workoutHasScores(wk.id)) return new Response(SCORES_BLOCK_MESSAGE, { status: 409 })
        return Response.json({ round: 1, placed: await startTournament(wk) })
      case 'advance':
        return Response.json(await advanceRound(wk))
      case 'finish':
        return Response.json({ placed: await finishTournament(wk) })
    }
  } catch (e) {
    if (e instanceof KnockoutRefusal) return new Response(e.message, { status: 409 })
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const wk = await knockoutWorkout(slug, params)
    if (wk instanceof Response) return wk
    return Response.json({ round: await undoRound(wk) })
  } catch (e) {
    if (e instanceof KnockoutRefusal) return new Response(e.message, { status: 409 })
    return authErrorResponse(e)
  }
}

async function knockoutWorkout(slug: string, params: Promise<{ id: string }>): Promise<KnockoutWorkoutRow | Response> {
  const { competition } = await requireCompetitionAccess(slug)
  const { id } = await params
  const wk = await requireWorkoutInCompetition<KnockoutWorkoutRow>(Number(id), competition.id)
  if (!wk.knockout) return new Response('This workout is not a knockout tournament.', { status: 400 })
  return wk
}
