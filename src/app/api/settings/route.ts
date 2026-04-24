import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { SettingsPatch } from '@/lib/schemas'

async function getSetting(competitionId: number, key: string, defaultValue: string): Promise<string> {
  const rows = await db
    .select({ value: setting.value })
    .from(setting)
    .where(and(eq(setting.competitionId, competitionId), eq(setting.key, key)))
    .limit(1)
  return rows[0]?.value ?? defaultValue
}

async function upsertSetting(competitionId: number, key: string, value: string) {
  await db
    .insert(setting)
    .values({ competitionId, key, value })
    .onConflictDoUpdate({
      target: [setting.competitionId, setting.key],
      set: { value },
    })
}

// Public read of competition-level settings (used by unauthed display views).
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const [showBib, tiebreakWorkoutId, leaderboardVisibility, tvLeaderboardPercentagesRaw] = await Promise.all([
    getSetting(competition.id, 'showBib', 'true'),
    getSetting(competition.id, 'tiebreakWorkoutId', ''),
    getSetting(competition.id, 'leaderboardVisibility', 'per_workout'),
    getSetting(competition.id, 'tvLeaderboardPercentages', '{}'),
  ])
  let tvLeaderboardPercentages: Record<string, number> = {}
  try { tvLeaderboardPercentages = JSON.parse(tvLeaderboardPercentagesRaw) } catch { /* ignore */ }
  return Response.json({
    showBib: showBib !== 'false',
    tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
    leaderboardVisibility: leaderboardVisibility as 'per_heat' | 'per_workout',
    tvLeaderboardPercentages,
  })
}

export async function PATCH(req: Request) {
  const parsed = await parseJson(req, SettingsPatch)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)
    const d = parsed.data

    const upserts: Promise<void>[] = []
    if (d.showBib !== undefined) {
      upserts.push(upsertSetting(competition.id, 'showBib', String(d.showBib)))
    }
    if ('tiebreakWorkoutId' in d) {
      upserts.push(upsertSetting(
        competition.id,
        'tiebreakWorkoutId',
        d.tiebreakWorkoutId != null ? String(d.tiebreakWorkoutId) : '',
      ))
    }
    if (d.leaderboardVisibility !== undefined) {
      upserts.push(upsertSetting(competition.id, 'leaderboardVisibility', d.leaderboardVisibility))
    }
    if (d.tvLeaderboardPercentages !== undefined) {
      upserts.push(upsertSetting(competition.id, 'tvLeaderboardPercentages', JSON.stringify(d.tvLeaderboardPercentages)))
    }
    await Promise.all(upserts)

    const [showBib, tiebreakWorkoutId, leaderboardVisibility, tvLeaderboardPercentagesRaw] = await Promise.all([
      getSetting(competition.id, 'showBib', 'true'),
      getSetting(competition.id, 'tiebreakWorkoutId', ''),
      getSetting(competition.id, 'leaderboardVisibility', 'per_workout'),
      getSetting(competition.id, 'tvLeaderboardPercentages', '{}'),
    ])
    let tvLeaderboardPercentages: Record<string, number> = {}
    try { tvLeaderboardPercentages = JSON.parse(tvLeaderboardPercentagesRaw) } catch { /* ignore */ }
    return Response.json({
      showBib: showBib !== 'false',
      tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
      leaderboardVisibility: leaderboardVisibility as 'per_heat' | 'per_workout',
      tvLeaderboardPercentages,
    })
  } catch (e) {
    return authErrorResponse(e)
  }
}
