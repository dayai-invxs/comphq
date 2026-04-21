import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'

async function getSetting(competitionId: number, key: string, defaultValue: string): Promise<string> {
  const { data } = await supabase
    .from('Setting')
    .select('value')
    .eq('competitionId', competitionId)
    .eq('key', key)
    .maybeSingle()
  return (data as { value?: string } | null)?.value ?? defaultValue
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const [showBib, tiebreakWorkoutId] = await Promise.all([
    getSetting(competition.id, 'showBib', 'true'),
    getSetting(competition.id, 'tiebreakWorkoutId', ''),
  ])
  return Response.json({
    showBib: showBib !== 'false',
    tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
  })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as { slug?: string; showBib?: boolean; tiebreakWorkoutId?: number | null }
  const competition = await resolveCompetition(body.slug ?? '')
  if (!competition) return new Response('Competition not found', { status: 404 })

  const upserts: Promise<unknown>[] = []

  if (body.showBib !== undefined) {
    upserts.push(supabase.from('Setting').upsert(
      { competitionId: competition.id, key: 'showBib', value: String(Boolean(body.showBib)) },
      { onConflict: 'competitionId,key' }
    ))
  }

  if ('tiebreakWorkoutId' in body) {
    upserts.push(supabase.from('Setting').upsert(
      { competitionId: competition.id, key: 'tiebreakWorkoutId', value: body.tiebreakWorkoutId != null ? String(body.tiebreakWorkoutId) : '' },
      { onConflict: 'competitionId,key' }
    ))
  }

  await Promise.all(upserts)

  const [showBib, tiebreakWorkoutId] = await Promise.all([
    getSetting(competition.id, 'showBib', 'true'),
    getSetting(competition.id, 'tiebreakWorkoutId', ''),
  ])
  return Response.json({
    showBib: showBib !== 'false',
    tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
  })
}
