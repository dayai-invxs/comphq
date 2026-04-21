import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { WorkoutCreate } from '@/lib/schemas'

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
  const parsed = await parseJson(req, WorkoutCreate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionMember(session, parsed.data.slug, 'admin')
    const d = parsed.data

    const { data, error } = await supabase
      .from('Workout')
      .insert({
        competitionId: competition.id,
        number: d.number,
        name: d.name,
        scoreType: d.scoreType,
        lanes: d.lanes,
        heatIntervalSecs: d.heatIntervalSecs,
        timeBetweenHeatsSecs: d.timeBetweenHeatsSecs ?? 120,
        callTimeSecs: d.callTimeSecs,
        walkoutTimeSecs: d.walkoutTimeSecs,
        startTime: d.startTime ?? null,
        status: 'draft',
        mixedHeats: d.mixedHeats !== false,
        tiebreakEnabled: d.tiebreakEnabled === true,
        partBEnabled: d.partBEnabled === true,
        partBScoreType: d.partBScoreType ?? 'time',
        halfWeight: d.halfWeight === true,
      })
      .select('*')
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
