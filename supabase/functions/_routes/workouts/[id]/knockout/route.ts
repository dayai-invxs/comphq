import { z } from 'zod'
import { authErrorResponse, requireCompetitionAccess, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { KnockoutAction } from '@/lib/schemas'
import { SCORES_BLOCK_MESSAGE, workoutHasScores } from '@/lib/heatDeletion'
import {
  advanceRound, finishTournament, KnockoutRefusal, latestRoundHasResults, startTournament, undoRound,
  type KnockoutWorkoutRow,
} from '@/lib/knockoutStore'

// POST /api/workouts/[id]/knockout { action }
//   start   — round 1 for everyone, seeded by the overall leaderboard
//   advance — the next round, from who advanced in the latest one
//   finish  — final placings become the workout's points
// DELETE    — undo the latest round. With results in it (a finished final
//             always has them) only with { discardResults: true }, and only
//             by an admin: like Clear All Scores, it deletes results.
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

const UndoBody = z.object({ discardResults: z.boolean().optional() }).strict()

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  // No body is a plain undo; a body that is not the one above is refused.
  const text = await req.text().catch(() => '')
  let discardResults = false
  if (text.trim()) {
    let raw: unknown
    try { raw = JSON.parse(text) } catch { return new Response('Invalid JSON body', { status: 400 }) }
    const parsed = UndoBody.safeParse(raw)
    if (!parsed.success) return new Response('Invalid body', { status: 400 })
    discardResults = parsed.data.discardResults ?? false
  }
  try {
    const wk = await knockoutWorkout(slug, params)
    if (wk instanceof Response) return wk
    if (discardResults && await latestRoundHasResults(wk.id)) await requireCompetitionAdmin(slug)
    return Response.json({ round: await undoRound(wk, { discardResults }) })
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
