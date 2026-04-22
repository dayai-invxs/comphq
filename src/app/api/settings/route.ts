import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { SettingsPatch } from '@/lib/schemas'

async function getSetting(competitionId: number, key: string, defaultValue: string): Promise<string> {
  const { data } = await supabase
    .from('Setting')
    .select('value')
    .eq('competitionId', competitionId)
    .eq('key', key)
    .maybeSingle()
  return (data as { value?: string } | null)?.value ?? defaultValue
}

// Public read of competition-level settings (used by unauthed display views).
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const [showBib, tiebreakWorkoutId, leaderboardVisibility] = await Promise.all([
    getSetting(competition.id, 'showBib', 'true'),
    getSetting(competition.id, 'tiebreakWorkoutId', ''),
    getSetting(competition.id, 'leaderboardVisibility', 'per_workout'),
  ])
  return Response.json({
    showBib: showBib !== 'false',
    tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
    leaderboardVisibility: leaderboardVisibility as 'per_heat' | 'per_workout',
  })
}

export async function PATCH(req: Request) {
  const parsed = await parseJson(req, SettingsPatch)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)
    const d = parsed.data

    const upserts = []
    if (d.showBib !== undefined) {
      upserts.push(supabase.from('Setting').upsert(
        { competitionId: competition.id, key: 'showBib', value: String(d.showBib) },
        { onConflict: 'competitionId,key' },
      ).then())
    }
    if ('tiebreakWorkoutId' in d) {
      upserts.push(supabase.from('Setting').upsert(
        { competitionId: competition.id, key: 'tiebreakWorkoutId', value: d.tiebreakWorkoutId != null ? String(d.tiebreakWorkoutId) : '' },
        { onConflict: 'competitionId,key' },
      ).then())
    }
    if (d.leaderboardVisibility !== undefined) {
      upserts.push(supabase.from('Setting').upsert(
        { competitionId: competition.id, key: 'leaderboardVisibility', value: d.leaderboardVisibility },
        { onConflict: 'competitionId,key' },
      ).then())
    }
    await Promise.all(upserts)

    const [showBib, tiebreakWorkoutId, leaderboardVisibility] = await Promise.all([
      getSetting(competition.id, 'showBib', 'true'),
      getSetting(competition.id, 'tiebreakWorkoutId', ''),
      getSetting(competition.id, 'leaderboardVisibility', 'per_workout'),
    ])
    return Response.json({
      showBib: showBib !== 'false',
      tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
      leaderboardVisibility: leaderboardVisibility as 'per_heat' | 'per_workout',
    })
  } catch (e) {
    return authErrorResponse(e)
  }
}
