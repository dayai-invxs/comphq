import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { setting } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { authErrorResponse, requireCompetitionAccess, requireCompetitionAdmin } from '@/lib/auth-competition'
import { DEFAULT_JUDGE_PASSWORD, DEFAULT_LEADERBOARD_VISIBILITY, tvSecondsPerScreen } from '@/lib/competitionDefaults'
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

// Every setting with its default, as both the read and the write answer it.
async function readSettings(competitionId: number) {
  const [showBib, tiebreakWorkoutId, leaderboardVisibility, tvLeaderboardPercentagesRaw, tvLeaderboardOrderRaw, judgePassword, judgeMaxConsecutiveRaw, listed, tvSecondsPerScreenRaw] = await Promise.all([
    getSetting(competitionId, 'showBib', 'true'),
    getSetting(competitionId, 'tiebreakWorkoutId', ''),
    getSetting(competitionId, 'leaderboardVisibility', DEFAULT_LEADERBOARD_VISIBILITY),
    getSetting(competitionId, 'tvLeaderboardPercentages', '{}'),
    getSetting(competitionId, 'tvLeaderboardOrder', '{}'),
    getSetting(competitionId, 'judgePassword', DEFAULT_JUDGE_PASSWORD),
    getSetting(competitionId, 'judgeMaxConsecutive', '3'),
    getSetting(competitionId, 'listed', 'true'),
    getSetting(competitionId, 'tvSecondsPerScreen', ''),
  ])
  let tvLeaderboardPercentages: Record<string, number> = {}
  try { tvLeaderboardPercentages = JSON.parse(tvLeaderboardPercentagesRaw) } catch { /* ignore */ }
  let tvLeaderboardOrder: Record<string, number> = {}
  try { tvLeaderboardOrder = JSON.parse(tvLeaderboardOrderRaw) } catch { /* ignore */ }
  return {
    showBib: showBib !== 'false',
    tiebreakWorkoutId: tiebreakWorkoutId ? Number(tiebreakWorkoutId) : null,
    leaderboardVisibility: leaderboardVisibility as 'per_heat' | 'per_workout',
    tvLeaderboardPercentages,
    tvLeaderboardOrder,
    tvSecondsPerScreen: tvSecondsPerScreen(tvSecondsPerScreenRaw),
    judgePassword,
    judgeMaxConsecutive: Number(judgeMaxConsecutiveRaw) || 3,
    /** Shown in the comphq.pro home page list. An unlisted competition still
        opens for anyone with its link. */
    listed: listed !== 'false',
  }
}

// Public read of competition-level settings (used by unauthed display views).
// The judge password is in it only for the competition's own people, who set
// it on the Setup screen. Everyone else, judges at the door included, checks
// a password through POST /api/settings/judge and is never handed it.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const { judgePassword, ...settings } = await readSettings(competition.id)
  const member = await requireCompetitionAccess(slug).then(() => true, () => false)
  return Response.json(member ? { ...settings, judgePassword } : settings)
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
    if (d.tvLeaderboardOrder !== undefined) {
      upserts.push(upsertSetting(competition.id, 'tvLeaderboardOrder', JSON.stringify(d.tvLeaderboardOrder)))
    }
    if (d.tvSecondsPerScreen !== undefined) {
      upserts.push(upsertSetting(competition.id, 'tvSecondsPerScreen', String(d.tvSecondsPerScreen)))
    }
    if (d.judgePassword !== undefined) {
      upserts.push(upsertSetting(competition.id, 'judgePassword', d.judgePassword))
    }
    if (d.judgeMaxConsecutive !== undefined) {
      upserts.push(upsertSetting(competition.id, 'judgeMaxConsecutive', String(d.judgeMaxConsecutive)))
    }
    if (d.listed !== undefined) {
      upserts.push(upsertSetting(competition.id, 'listed', String(d.listed)))
    }
    await Promise.all(upserts)

    return Response.json(await readSettings(competition.id))
  } catch (e) {
    return authErrorResponse(e)
  }
}
