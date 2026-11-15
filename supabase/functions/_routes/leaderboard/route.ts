import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberNamesByAthlete } from '@/lib/teamMembers'
import { athlete, division, score, setting, workout } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { tvSecondsPerScreen } from '@/lib/competitionDefaults'
import { workoutWeight } from '@/lib/workoutWeight'
import { loadScoring } from '@/lib/scoringSettings'
import { rankStandings, visibleWorkoutsOf } from '@/lib/standings'

type AthleteRow = {
  id: number
  name: string
  divisionName: string | null
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const competition = await resolveCompetition(slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  async function readSetting(key: string): Promise<string | null> {
    const rows = await db
      .select({ value: setting.value })
      .from(setting)
      .where(and(eq(setting.competitionId, competition!.id), eq(setting.key, key)))
      .limit(1)
    return rows[0]?.value ?? null
  }

  const [workouts, athletesRaw, divisionsRaw, tiebreakSettingValue, leaderboardVisibilityValue, tvLeaderboardPercentagesRaw, tvLeaderboardOrderRaw, tvSecondsPerScreenRaw] = await Promise.all([
    db.select().from(workout).where(eq(workout.competitionId, competition.id)).orderBy(asc(workout.number)),
    db
      .select({
        id: athlete.id,
        name: athlete.name,
        divisionName: division.name,
      })
      .from(athlete)
      .leftJoin(division, eq(division.id, athlete.divisionId))
      .where(eq(athlete.competitionId, competition.id))
      .orderBy(asc(athlete.name)),
    db.select({ name: division.name, order: division.order }).from(division).where(eq(division.competitionId, competition.id)).orderBy(asc(division.order)),
    readSetting('tiebreakWorkoutId'),
    readSetting('leaderboardVisibility'),
    readSetting('tvLeaderboardPercentages'),
    readSetting('tvLeaderboardOrder'),
    readSetting('tvSecondsPerScreen'),
  ])

  const athletes: AthleteRow[] = athletesRaw
  // per_heat (live) shows scores as heats complete; per_workout hides them until the whole workout is done
  const visibleWorkouts = visibleWorkoutsOf(workouts, leaderboardVisibilityValue)

  const tiebreakWorkoutId = tiebreakSettingValue ? Number(tiebreakSettingValue) : null

  const workoutIds = visibleWorkouts.map((w) => w.id)
  const scores = workoutIds.length > 0
    ? await db
        .select({
          athleteId: score.athleteId,
          workoutId: score.workoutId,
          points: score.points,
          rawScore: score.rawScore,
          capped: score.capped,
          tiebreakRawScore: score.tiebreakRawScore,
          partBPoints: score.partBPoints,
          knockoutLabel: score.knockoutLabel,
        })
        .from(score)
        .where(inArray(score.workoutId, workoutIds))
    : []

  // A team shows its members under its name; an individual has none.
  const members = await memberNamesByAthlete(athletes.map((a) => a.id))

  // Totals and tie-breaking live in lib/standings.ts, which seeding reads too.
  const scoring = await loadScoring(competition.id)
  const ranked = rankStandings({ visibleWorkouts, athletes, scores, scoring, tiebreakWorkoutId })
  const { decidingWorkoutId } = ranked
  const entries = ranked.entries.map((e) => ({
    athleteId: e.athleteId,
    athleteName: e.athleteName,
    members: members.get(e.athleteId) ?? [],
    divisionName: e.divisionName,
    totalPoints: e.totalPoints,
    workoutScores: e.workoutScores,
  }))

  let tvLeaderboardPercentages: Record<string, number> = {}
  try { tvLeaderboardPercentages = JSON.parse(tvLeaderboardPercentagesRaw ?? '{}') } catch { /* ignore */ }
  let tvLeaderboardOrder: Record<string, number> = {}
  try { tvLeaderboardOrder = JSON.parse(tvLeaderboardOrderRaw ?? '{}') } catch { /* ignore */ }

  return Response.json(
    {
      // The printable score card is the organizer's, and heavy for a screen
      // that polls: the leaderboard never sends it.
      workouts: visibleWorkouts.map(({ scoreCard: _card, ...w }) => w),
      entries,
      tiebreakWorkoutId,
      decidingWorkoutId,
      halfWeightIds: visibleWorkouts.filter((w) => workoutWeight(w) === 0.5).map((w) => w.id),
      doubleWeightIds: visibleWorkouts.filter((w) => workoutWeight(w) === 2).map((w) => w.id),
      tvLeaderboardPercentages,
      tvLeaderboardOrder,
      /** The TV board's pace; it reads it here, with the other TV settings. */
      tvSecondsPerScreen: tvSecondsPerScreen(tvSecondsPerScreenRaw),
      divisions: divisionsRaw,
      /** How totals are made and which way they win. */
      scoring: { system: scoring.system, ...scoring.scale },
    },
    { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' } },
  )
}
