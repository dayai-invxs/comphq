import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { assignHeats, calcCumulativePoints } from '@/lib/scoring'
import type { AthleteWithScore } from '@/lib/scoring'
import { authErrorResponse, requireCompetitionMember, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AssignmentPatch, AssignmentRegen } from '@/lib/schemas'
import { ASSIGNMENT_EMBED } from '@/lib/embeds'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id, 'id')

    const { data, error } = await supabase
      .from('HeatAssignment')
      .select(ASSIGNMENT_EMBED)
      .eq('workoutId', workoutId)
      .order('heatNumber')
      .order('lane')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id } = await params
    const workoutId = Number(id)
    const workout = await requireWorkoutInCompetition<{ id: number; lanes: number; mixedHeats: boolean }>(
      workoutId,
      competition.id,
      'id, lanes, mixedHeats',
    )

    const parsed = await parseJson(req, AssignmentRegen)
    if (!parsed.ok) return parsed.response
    const useCumulative = parsed.data.useCumulative === true

    const { data: athletesRaw } = await supabase
      .from('Athlete')
      .select('*, scores:Score(*)')
      .eq('competitionId', competition.id)

    const { data: divisions } = await supabase
      .from('Division')
      .select('id, order')
      .eq('competitionId', competition.id)

    const athletes = (athletesRaw ?? []) as unknown as AthleteWithScore[]
    const divisionOrder = new Map(
      (divisions ?? []).map((d) => [(d as { id: number }).id, (d as { order: number }).order]),
    )

    let cumulativePoints: Map<number, number> | undefined
    if (useCumulative) {
      const { data: completed } = await supabase
        .from('Workout')
        .select('id')
        .eq('competitionId', competition.id)
        .eq('status', 'completed')
      cumulativePoints = calcCumulativePoints(
        athletes,
        (completed ?? []).map((w) => (w as { id: number }).id),
      )
    }

    const newAssignments = assignHeats(athletes, workout.lanes, {
      cumulativePoints,
      mixedHeats: workout.mixedHeats,
      divisionOrder,
    })

    // Atomic DELETE+INSERT+UPDATE via RPC — no partial failure state.
    const { error: rpcErr } = await supabase.rpc('replace_workout_heat_assignments', {
      p_workout_id: workoutId,
      p_assignments: newAssignments,
    })
    if (rpcErr) return new Response(rpcErr.message, { status: 500 })

    const { data: result, error: selErr } = await supabase
      .from('HeatAssignment')
      .select(ASSIGNMENT_EMBED)
      .eq('workoutId', workoutId)
      .order('heatNumber')
      .order('lane')
    if (selErr) return new Response(selErr.message, { status: 500 })

    return Response.json(result ?? [], { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, AssignmentPatch)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    const { id: assignmentId, heatNumber, lane } = parsed.data

    // Verify the assignment belongs to a workout in the caller's competition.
    const { data: existing } = await supabase
      .from('HeatAssignment')
      .select('id, workout:Workout!inner(competitionId)')
      .eq('id', assignmentId)
      .eq('workout.competitionId', competition.id)
      .maybeSingle()
    if (!existing) return new Response('Assignment not found', { status: 404 })

    const { error: uerr } = await supabase
      .from('HeatAssignment')
      .update({ heatNumber, lane })
      .eq('id', assignmentId)
    if (uerr) return new Response(uerr.message, { status: 500 })

    const { data, error } = await supabase
      .from('HeatAssignment')
      .select(ASSIGNMENT_EMBED)
      .eq('id', assignmentId)
      .single()
    if (error) return new Response(error.message, { status: 500 })

    return Response.json(data)
  } catch (e) {
    return authErrorResponse(e)
  }
}
