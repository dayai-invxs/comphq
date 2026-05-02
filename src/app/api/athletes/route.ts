import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { AthleteBulkDelete, AthleteCreate } from '@/lib/schemas'

const ATHLETE_WITH_DIVISION = '*, division:Division(id, name, order)'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAccess(slug)

    const { data, error } = await supabase
      .from('Athlete')
      .select(ATHLETE_WITH_DIVISION)
      .eq('competitionId', competition.id)
      .order('name')

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data ?? [])
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, AthleteCreate)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)

    const { data, error } = await supabase
      .from('Athlete')
      .insert({
        competitionId: competition.id,
        name: parsed.data.name,
        bibNumber: parsed.data.bibNumber?.trim() || null,
        divisionId: parsed.data.divisionId ?? null,
      })
      .select(ATHLETE_WITH_DIVISION)
      .single()

    if (error) return new Response(error.message, { status: 500 })
    return Response.json(data, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request) {
  const parsed = await parseJson(req, AthleteBulkDelete)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)

    const { data, error } = await supabase
      .from('Athlete')
      .delete()
      .in('id', parsed.data.ids)
      .eq('competitionId', competition.id)
      .select('id')

    if (error) return new Response(error.message, { status: 500 })
    return Response.json({ deleted: data?.length ?? 0 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
