import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberNamesByAthlete } from '@/lib/teamMembers'
import { athlete, division, score, setting, workout } from '@/db/schema'
import { resolveCompetition } from '@/lib/competition'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import { DEFAULT_LEADERBOARD_VISIBILITY, tvSecondsPerScreen } from '@/lib/competitionDefaults'
import { compareResults } from '@/lib/scoring'
import { skippedPlaces } from '@/lib/skippedPlace'
import { workoutWeight } from '@/lib/workoutWeight'

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
  const liveLeaderboard = (leaderboardVisibilityValue ?? DEFAULT_LEADERBOARD_VISIBILITY) !== 'per_workout'
  const visibleWorkouts = workouts.filter((w) => liveLeaderboard
    ? w.status === 'active' || w.status === 'completed'
    : w.status === 'completed'
  )

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

  const scoreMap = new Map<string, { points: number; rawScore: number; capped: boolean; scoreType: string; tiebreakRawScore: number | null; tiebreakEnabled: boolean; tiebreakScoreType: string; partBPoints: number | null; knockoutLabel: string | null }>()
  for (const s of scores) {
    if (s.points != null) {
      const wo = visibleWorkouts.find((w) => w.id === s.workoutId)
      scoreMap.set(`${s.athleteId}-${s.workoutId}`, {
        points: s.points,
        rawScore: s.rawScore,
        capped: s.capped,
        scoreType: wo?.scoreType ?? '',
        tiebreakRawScore: s.tiebreakRawScore ?? null,
        tiebreakEnabled: wo?.tiebreakEnabled ?? false,
        tiebreakScoreType: wo?.tiebreakScoreType ?? 'time',
        partBPoints: s.partBPoints ?? null,
        knockoutLabel: s.knockoutLabel ?? null,
      })
    }
  }

  // A finished workout an athlete has no score in ranks them last in it
  // (lib/skippedPlace.ts), Part B the same.
  const divisionsOf = athletes.map((a) => ({ id: a.id, division: a.divisionName }))
  const skippedA = skippedPlaces(visibleWorkouts, divisionsOf, (a, w) => scoreMap.get(`${a}-${w}`)?.points)
  const skippedB = skippedPlaces(visibleWorkouts, divisionsOf, (a, w) => scoreMap.get(`${a}-${w}`)?.partBPoints)

  type WorkoutScore = {
    points: number; rawScore: number; display: string; tiebreakDisplay: string | null; partBPoints: number | null
    /** No score in a finished workout: placed last, not ranked by a result. */
    skipped?: true
  }

  const entries = athletes.map((a) => {
    let totalPoints = 0
    const workoutScores: Record<number, WorkoutScore | null> = {}
    for (const wo of visibleWorkouts) {
      const entry = scoreMap.get(`${a.id}-${wo.id}`)
      const skipped = entry ? null : skippedA(a.id, wo.id)
      if (skipped != null) {
        const partB = wo.partBEnabled ? skippedB(a.id, wo.id) : null
        const pts = skipped + (partB ?? 0)
        totalPoints += pts * workoutWeight(wo)
        workoutScores[wo.id] = { points: skipped, rawScore: 0, display: 'No score', tiebreakDisplay: null, partBPoints: partB, skipped: true }
      } else if (entry) {
        // When partBEnabled, both Part A and Part B points count toward total
        const pts = wo.partBEnabled && entry.partBPoints != null
          ? entry.points + entry.partBPoints
          : entry.points
        totalPoints += pts * workoutWeight(wo)
        const tiebreakDisplay = !wo.partBEnabled && entry.tiebreakEnabled && entry.tiebreakRawScore != null
          ? (entry.tiebreakScoreType === 'time' ? formatTiebreak(entry.tiebreakRawScore) : formatScore(entry.tiebreakRawScore, entry.tiebreakScoreType))
          : null
        workoutScores[wo.id] = { points: entry.points, rawScore: entry.rawScore, display: entry.knockoutLabel ?? formatScore(entry.rawScore, entry.scoreType, entry.capped), tiebreakDisplay, partBPoints: entry.partBPoints }
      } else {
        workoutScores[wo.id] = null
      }
    }
    return { athleteId: a.id, athleteName: a.name, members: members.get(a.id) ?? [], divisionName: a.divisionName ?? null, totalPoints, workoutScores }
  })

  // A finished knockout flagged as deciding the competition: its placings are
  // the standings. Everyone it placed takes their placing as their total and
  // ranks on that alone; anyone it did not place follows, ranked as before.
  // Placings are per division, and so is every table that reads this.
  const deciding = [...visibleWorkouts].reverse()
    .find((w) => w.knockout && w.knockoutDecides && w.status === 'completed') ?? null
  const decidingWorkoutId = deciding?.id ?? null
  if (deciding) {
    for (const e of entries) {
      const placed = e.workoutScores[deciding.id]
      if (placed && !placed.skipped) e.totalPoints = placed.points
    }
  }

  const tiebreakWorkout = tiebreakWorkoutId
    ? visibleWorkouts.find((w) => w.id === tiebreakWorkoutId)
    : undefined

  entries.sort((a, b) => {
    if (decidingWorkoutId != null) {
      // Someone the knockout did not place follows, skipped or not.
      const placing = (ws: WorkoutScore | null | undefined) => (ws && !ws.skipped ? ws.points : null)
      const aPlace = placing(a.workoutScores[decidingWorkoutId])
      const bPlace = placing(b.workoutScores[decidingWorkoutId])
      if (aPlace != null && bPlace == null) return -1
      if (aPlace == null && bPlace != null) return 1
      if (aPlace != null && bPlace != null) return aPlace - bPlace || a.athleteName.localeCompare(b.athleteName)
    }
    const aHas = Object.values(a.workoutScores).some((v) => v !== null)
    const bHas = Object.values(b.workoutScores).some((v) => v !== null)
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
    // Tied on total points: compare rank distributions — athlete with more 1st places wins,
    // then more 2nd places, etc.
    const ranksPresent = [...new Set([
      ...Object.values(a.workoutScores).filter(Boolean).map((s) => s!.points),
      ...Object.values(b.workoutScores).filter(Boolean).map((s) => s!.points),
    ])].sort((x, y) => x - y)
    for (const rank of ranksPresent) {
      const aCount = Object.values(a.workoutScores).filter((s) => s?.points === rank).length
      const bCount = Object.values(b.workoutScores).filter((s) => s?.points === rank).length
      if (aCount !== bCount) return bCount - aCount // more of a better rank wins
    }
    // Still tied: the better result in the designated tiebreaker workout. Read
    // from the scores themselves, not the cells: a capped score holds rounds
    // and reps rather than a time, so it has to lose to any finish rather than
    // be compared by value, and a "No score" cell carries a stand-in 0 that
    // would otherwise beat every real time.
    if (tiebreakWorkout) {
      const aScore = scoreMap.get(`${a.athleteId}-${tiebreakWorkout.id}`)
      const bScore = scoreMap.get(`${b.athleteId}-${tiebreakWorkout.id}`)
      if (aScore && !bScore) return -1
      if (!aScore && bScore) return 1
      if (aScore && bScore) {
        const better = compareResults(aScore.rawScore, aScore.capped, bScore.rawScore, bScore.capped, tiebreakWorkout.scoreType)
        if (better !== 0) return better
      }
    }
    return a.athleteName.localeCompare(b.athleteName)
  })

  let tvLeaderboardPercentages: Record<string, number> = {}
  try { tvLeaderboardPercentages = JSON.parse(tvLeaderboardPercentagesRaw ?? '{}') } catch { /* ignore */ }
  let tvLeaderboardOrder: Record<string, number> = {}
  try { tvLeaderboardOrder = JSON.parse(tvLeaderboardOrderRaw ?? '{}') } catch { /* ignore */ }

  return Response.json(
    {
      workouts: visibleWorkouts,
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
    },
    { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' } },
  )
}
