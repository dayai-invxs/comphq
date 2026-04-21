import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { assignHeats, calcCumulativePoints } from '@/lib/scoring'
import type { AthleteWithScore } from '@/lib/scoring'

const ASSIGNMENT_EMBED = '*, athlete:Athlete(id, name, bibNumber, divisionId, division:Division(id, name, order))'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('HeatAssignment')
    .select(ASSIGNMENT_EMBED)
    .eq('workoutId', Number(id))
    .order('heatNumber')
    .order('lane')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const workoutId = Number(id)

  const { data: workout } = await supabase.from('Workout').select('*').eq('id', workoutId).maybeSingle()
  if (!workout) return new Response('Not found', { status: 404 })

  const body = await req.json().catch(() => ({}))
  const useCumulative = body?.useCumulative === true

  const competitionId = (workout as { competitionId: number }).competitionId

  const { data: athletesRaw } = await supabase
    .from('Athlete')
    .select('*, scores:Score(*)')
    .eq('competitionId', competitionId)

  const { data: divisions } = await supabase
    .from('Division')
    .select('id, order')
    .eq('competitionId', competitionId)

  const athletes = (athletesRaw ?? []) as unknown as AthleteWithScore[]
  const divisionOrder = new Map(
    (divisions ?? []).map((d) => [(d as { id: number }).id, (d as { order: number }).order]),
  )

  let cumulativePoints: Map<number, number> | undefined
  if (useCumulative) {
    const { data: completed } = await supabase
      .from('Workout')
      .select('id')
      .eq('competitionId', competitionId)
      .eq('status', 'completed')
    cumulativePoints = calcCumulativePoints(
      athletes,
      (completed ?? []).map((w) => (w as { id: number }).id),
    )
  }

  const newAssignments = assignHeats(athletes, workout.lanes as number, {
    cumulativePoints,
    mixedHeats: workout.mixedHeats as boolean,
    divisionOrder,
  })

  await supabase.from('HeatAssignment').delete().eq('workoutId', workoutId)

  if (newAssignments.length > 0) {
    const { error } = await supabase
      .from('HeatAssignment')
      .insert(newAssignments.map((a) => ({ ...a, workoutId })))
    if (error) return new Response(error.message, { status: 500 })
  }

  await supabase.from('Workout').update({ heatStartOverrides: '{}' }).eq('id', workoutId)

  const { data: result, error: selErr } = await supabase
    .from('HeatAssignment')
    .select(ASSIGNMENT_EMBED)
    .eq('workoutId', workoutId)
    .order('heatNumber')
    .order('lane')
  if (selErr) return new Response(selErr.message, { status: 500 })

  return Response.json(result ?? [], { status: 201 })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id, heatNumber, lane } = await req.json() as { id: number; heatNumber: number; lane: number }
  const assignmentId = Number(id)

  const { error: uerr } = await supabase
    .from('HeatAssignment')
    .update({ heatNumber: Number(heatNumber), lane: Number(lane) })
    .eq('id', assignmentId)
  if (uerr) return new Response(uerr.message, { status: 500 })

  const { data, error } = await supabase
    .from('HeatAssignment')
    .select(ASSIGNMENT_EMBED)
    .eq('id', assignmentId)
    .single()
  if (error) return new Response(error.message, { status: 500 })

  return Response.json(data)
}
