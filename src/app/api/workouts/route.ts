import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionMember(session, slug)

    const { data, error } = await supabase
      .from('Workout')
      .select('*')
      .eq('competitionId', competition.id)
      .order('number')
    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()

  try {
    const { competition } = await requireCompetitionMember(session, body.slug ?? '', 'admin')

    const { data, error } = await supabase
      .from('Workout')
      .insert({
        competitionId: competition.id,
        number: Number(body.number),
        name: body.name.trim(),
        scoreType: body.scoreType,
        lanes: Number(body.lanes),
        heatIntervalSecs: Number(body.heatIntervalSecs),
        timeBetweenHeatsSecs: body.timeBetweenHeatsSecs != null ? Number(body.timeBetweenHeatsSecs) : 120,
        callTimeSecs: Number(body.callTimeSecs),
        walkoutTimeSecs: Number(body.walkoutTimeSecs),
        startTime: body.startTime ? new Date(body.startTime).toISOString() : null,
        status: 'draft',
        mixedHeats: body.mixedHeats !== false,
        tiebreakEnabled: body.tiebreakEnabled === true,
        partBEnabled: body.partBEnabled === true,
        partBScoreType: body.partBScoreType ?? 'time',
        halfWeight: body.halfWeight === true,
      })
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
