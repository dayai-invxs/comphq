import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { getCompletedHeats } from '@/lib/heatCompletion'

const ASSIGNMENT_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId, division:Division(id, name, order))'
const SCORE_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId)'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug)
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

type WorkoutPatch = Partial<{
  name: string; scoreType: string; lanes: number | string; heatIntervalSecs: number | string
  timeBetweenHeatsSecs: number | string; callTimeSecs: number | string; walkoutTimeSecs: number | string
  startTime: string | null; status: string; mixedHeats: boolean; tiebreakEnabled: boolean
  partBEnabled: boolean; partBScoreType: string; number: number | string; halfWeight: boolean
}>

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id } = await params
    const body = await req.json() as WorkoutPatch
    const patch: Record<string, unknown> = {}

    if (body.name) patch.name = body.name.trim()
    if (body.scoreType) patch.scoreType = body.scoreType
    if (body.lanes != null) patch.lanes = Number(body.lanes)
    if (body.heatIntervalSecs != null) patch.heatIntervalSecs = Number(body.heatIntervalSecs)
    if (body.timeBetweenHeatsSecs != null) patch.timeBetweenHeatsSecs = Number(body.timeBetweenHeatsSecs)
    if (body.callTimeSecs != null) patch.callTimeSecs = Number(body.callTimeSecs)
    if (body.walkoutTimeSecs != null) patch.walkoutTimeSecs = Number(body.walkoutTimeSecs)
    if (body.startTime !== undefined) patch.startTime = body.startTime ? new Date(body.startTime).toISOString() : null
    if (body.status) patch.status = body.status
    if (body.mixedHeats !== undefined) patch.mixedHeats = Boolean(body.mixedHeats)
    if (body.tiebreakEnabled !== undefined) patch.tiebreakEnabled = Boolean(body.tiebreakEnabled)
    if (body.partBEnabled !== undefined) patch.partBEnabled = Boolean(body.partBEnabled)
    if (body.partBScoreType) patch.partBScoreType = body.partBScoreType
    if (body.number != null) patch.number = Number(body.number)
    if (body.halfWeight !== undefined) patch.halfWeight = Boolean(body.halfWeight)

    if (Object.keys(patch).length === 0) return new Response('Nothing to update', { status: 400 })

    const { data, error } = await supabase
      .from('Workout')
      .update(patch)
      .eq('id', Number(id))
      .eq('competitionId', competition.id)
      .select('*')
      .maybeSingle()

    if (error) return new Response(error.message, { status: 500 })
    if (!data) return new Response('Workout not found', { status: 404 })

    // When partBEnabled flips off, strand-data cleanup: null out partB scores
    // so they don't revive if it's ever flipped on again. Fixes COM-9 #16.
    if (body.partBEnabled === false) {
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
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
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
