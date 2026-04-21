import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { data, error } = await supabase
    .from('Workout')
    .select('*')
    .eq('competitionId', competition.id)
    .order('number')
  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json()
  const competition = await resolveCompetition(body.slug ?? '')
  if (!competition) return new Response('Competition not found', { status: 404 })

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
}
