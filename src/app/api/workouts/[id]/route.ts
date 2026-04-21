import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const ASSIGNMENT_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId, division:Division(id, name, order))'
const SCORE_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId)'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const workoutId = Number(id)

  const { data: workout, error: werr } = await supabase
    .from('Workout')
    .select('*')
    .eq('id', workoutId)
    .maybeSingle()

  if (werr) return new Response(werr.message, { status: 500 })
  if (!workout) return new Response('Not found', { status: 404 })

  const [assignmentsRes, scoresRes] = await Promise.all([
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
  ])

  if (assignmentsRes.error) return new Response(assignmentsRes.error.message, { status: 500 })
  if (scoresRes.error) return new Response(scoresRes.error.message, { status: 500 })

  return Response.json({
    ...workout,
    assignments: assignmentsRes.data ?? [],
    scores: scoresRes.data ?? [],
  })
}

type WorkoutPatch = Partial<{
  name: string; scoreType: string; lanes: number | string; heatIntervalSecs: number | string
  timeBetweenHeatsSecs: number | string; callTimeSecs: number | string; walkoutTimeSecs: number | string
  startTime: string | null; status: string; mixedHeats: boolean; tiebreakEnabled: boolean
  partBEnabled: boolean; partBScoreType: string; number: number | string; halfWeight: boolean
}>

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

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
    .select('*')
    .single()

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('Workout').delete().eq('id', Number(id))
  if (error) return new Response(error.message, { status: 500 })
  return new Response(null, { status: 204 })
}
