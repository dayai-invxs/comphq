import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { getCompletedHeats } from '@/lib/heatCompletion'
import { parseJson } from '@/lib/parseJson'
import { WorkoutUpdate } from '@/lib/schemas'
import { ASSIGNMENT_EMBED, SCORE_EMBED } from '@/lib/embeds'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    const workout = await requireWorkoutInCompetition(workoutId, competition.id)

    const [assignmentsRes, scoresRes, completedHeats] = await Promise.all([
      supabase
        .from('HeatAssignment')
        .select(ASSIGNMENT_EMBED)
        .eq('workoutId', workoutId)
        .order('heatNumber')
        .order('lane'),
      supabase
        .from('Score')
        .select(SCORE_EMBED)
        .eq('workoutId', workoutId),
      getCompletedHeats(workoutId),
    ])

    if (assignmentsRes.error) return new Response(assignmentsRes.error.message, { status: 500 })
    if (scoresRes.error) return new Response(scoresRes.error.message, { status: 500 })

    return Response.json({
      ...workout,
      completedHeats,
      assignments: assignmentsRes.data ?? [],
      scores: scoresRes.data ?? [],
    })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, WorkoutUpdate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const d = parsed.data
    const patch: Record<string, unknown> = {}

    if (d.name !== undefined) patch.name = d.name
    if (d.scoreType !== undefined) patch.scoreType = d.scoreType
    if (d.lanes !== undefined) patch.lanes = d.lanes
    if (d.heatIntervalSecs !== undefined) patch.heatIntervalSecs = d.heatIntervalSecs
    if (d.timeBetweenHeatsSecs !== undefined) patch.timeBetweenHeatsSecs = d.timeBetweenHeatsSecs
    if (d.callTimeSecs !== undefined) patch.callTimeSecs = d.callTimeSecs
    if (d.walkoutTimeSecs !== undefined) patch.walkoutTimeSecs = d.walkoutTimeSecs
    if (d.startTime !== undefined) patch.startTime = d.startTime ?? null
    if (d.status !== undefined) patch.status = d.status
    if (d.mixedHeats !== undefined) patch.mixedHeats = d.mixedHeats
    if (d.tiebreakEnabled !== undefined) patch.tiebreakEnabled = d.tiebreakEnabled
    if (d.partBEnabled !== undefined) patch.partBEnabled = d.partBEnabled
    if (d.partBScoreType !== undefined) patch.partBScoreType = d.partBScoreType
    if (d.number !== undefined) patch.number = d.number
    if (d.halfWeight !== undefined) patch.halfWeight = d.halfWeight

    const { data, error } = await supabase
      .from('Workout')
      .update(patch)
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select('*')
      .maybeSingle()

    if (error) return new Response(error.message, { status: 500 })
    if (!data) return new Response('Workout not found', { status: 404 })

    // When partBEnabled flips off, null out partB scores (COM-9 #16).
    if (d.partBEnabled === false) {
      await supabase
        .from('Score')
        .update({ partBRawScore: null, partBPoints: null })
        .eq('workoutId', Number(id))
    }

    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const { error } = await supabase
      .from('Workout')
      .delete()
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
    if (error) return new Response(error.message, { status: 500 })
    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
