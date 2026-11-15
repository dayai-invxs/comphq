import { asc, eq, getTableColumns } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  athlete, competition, division, heatAssignment, heatCompletion, judgeAssignment, score, setting,
  teamMember, volunteer, volunteerRole, workout, workoutEquipment, workoutLocation,
} from '@/db/schema'
import { SCORING_SETTING_KEYS, scoringFromSettings, type Scoring } from '@/lib/pointsScale'
import { rankStandings, visibleWorkoutsOf, hasResults, type StandingsEntry } from '@/lib/standings'

// Everything a competition holds, read once for the two exports (CSV and ZIP).
// One loader so a new table or column is added in one place, and neither
// export quietly falls behind the other again.
//
// Left out on purpose: the judge password (a live credential, and the export
// is a file that gets passed around), comp users and their emails, and the
// activity log.

/** Setting keys never written to an export. */
export const PRIVATE_SETTING_KEYS = new Set(['judgePassword'])

export async function loadCompetitionData(competitionId: number) {
  // Rows that hang off a workout or athlete are found through it, so every
  // read below can run at once.
  const ofWorkout = eq(workout.competitionId, competitionId)
  const [
    competitionRows, workouts, divisions, athletes, teamMembers, assignments,
    completions, scores, settingRows, locations, roles, volunteers, judges, equipment,
  ] = await Promise.all([
    db.select().from(competition).where(eq(competition.id, competitionId)).limit(1),
    db.select().from(workout).where(ofWorkout).orderBy(asc(workout.number)),
    db.select().from(division).where(eq(division.competitionId, competitionId)).orderBy(asc(division.order), asc(division.id)),
    db.select().from(athlete).where(eq(athlete.competitionId, competitionId)).orderBy(asc(athlete.name), asc(athlete.id)),
    db.select(getTableColumns(teamMember)).from(teamMember)
      .innerJoin(athlete, eq(athlete.id, teamMember.athleteId))
      .where(eq(athlete.competitionId, competitionId))
      .orderBy(asc(teamMember.athleteId), asc(teamMember.order), asc(teamMember.id)),
    db.select(getTableColumns(heatAssignment)).from(heatAssignment)
      .innerJoin(workout, eq(workout.id, heatAssignment.workoutId))
      .where(ofWorkout)
      .orderBy(asc(workout.number), asc(heatAssignment.heatNumber), asc(heatAssignment.lane)),
    db.select(getTableColumns(heatCompletion)).from(heatCompletion)
      .innerJoin(workout, eq(workout.id, heatCompletion.workoutId))
      .where(ofWorkout)
      .orderBy(asc(workout.number), asc(heatCompletion.heatNumber)),
    db.select(getTableColumns(score)).from(score)
      .innerJoin(workout, eq(workout.id, score.workoutId))
      .where(ofWorkout)
      .orderBy(asc(workout.number), asc(score.points), asc(score.id)),
    db.select({ key: setting.key, value: setting.value }).from(setting)
      .where(eq(setting.competitionId, competitionId))
      .orderBy(asc(setting.key)),
    db.select().from(workoutLocation).where(eq(workoutLocation.competitionId, competitionId)).orderBy(asc(workoutLocation.id)),
    db.select().from(volunteerRole).where(eq(volunteerRole.competitionId, competitionId)).orderBy(asc(volunteerRole.name)),
    db.select().from(volunteer).where(eq(volunteer.competitionId, competitionId)).orderBy(asc(volunteer.name)),
    db.select(getTableColumns(judgeAssignment)).from(judgeAssignment)
      .innerJoin(workout, eq(workout.id, judgeAssignment.workoutId))
      .where(ofWorkout)
      .orderBy(asc(workout.number), asc(judgeAssignment.heatNumber), asc(judgeAssignment.lane)),
    db.select(getTableColumns(workoutEquipment)).from(workoutEquipment)
      .innerJoin(workout, eq(workout.id, workoutEquipment.workoutId))
      .where(ofWorkout)
      .orderBy(asc(workout.number), asc(workoutEquipment.id)),
  ])

  const settings = settingRows.filter((s) => !PRIVATE_SETTING_KEYS.has(s.key))
  const settingMap = new Map(settings.map((s) => [s.key, s.value]))
  const scoring = scoringFromSettings((key: (typeof SCORING_SETTING_KEYS)[number]) => settingMap.get(key))

  return {
    competition: competitionRows[0] ?? null,
    workouts, divisions, athletes, teamMembers, assignments, completions, scores,
    settings, settingMap, scoring, locations, roles, volunteers, judges, equipment,
  }
}

export type CompetitionData = Awaited<ReturnType<typeof loadCompetitionData>>

export type StandingsRow = { entry: StandingsEntry; rank: number | null }

/**
 * The overall standings, per division, exactly as the leaderboard ranks them
 * (lib/standings.ts): same visible workouts, tiebreaker workout, deciding
 * knockout and Part B. Rank numbers follow the leaderboard screen's rule
 * (apps/web/src/lib/standings.ts `rankRows`): athletes share a number only
 * when their totals and every workout's place match; nothing scored has none.
 */
export function standingsByDivision(data: CompetitionData): {
  scoring: Scoring
  visibleWorkouts: CompetitionData['workouts']
  decidingWorkoutId: number | null
  divisions: { name: string | null; rows: StandingsRow[] }[]
} {
  const visibleWorkouts = visibleWorkoutsOf(data.workouts, data.settingMap.get('leaderboardVisibility') ?? null)
  const divName = new Map(data.divisions.map((d) => [d.id, d.name]))
  const tiebreakRaw = data.settingMap.get('tiebreakWorkoutId')
  const visibleIds = new Set(visibleWorkouts.map((w) => w.id))
  const { entries, decidingWorkoutId } = rankStandings({
    visibleWorkouts,
    athletes: data.athletes.map((a) => ({ id: a.id, name: a.name, divisionName: a.divisionId ? (divName.get(a.divisionId) ?? null) : null })),
    scores: data.scores.filter((s) => visibleIds.has(s.workoutId)),
    scoring: data.scoring,
    tiebreakWorkoutId: tiebreakRaw ? Number(tiebreakRaw) : null,
  })

  const workoutIds = visibleWorkouts.map((w) => w.id)
  const tied = (a: StandingsEntry, b: StandingsEntry) => {
    if (decidingWorkoutId != null) {
      const pa = a.workoutScores[decidingWorkoutId]?.points ?? null
      const pb = b.workoutScores[decidingWorkoutId]?.points ?? null
      if (pa != null || pb != null) return pa === pb
    }
    return a.totalPoints === b.totalPoints
      && workoutIds.every((id) => (a.workoutScores[id]?.points ?? null) === (b.workoutScores[id]?.points ?? null))
  }

  // Divisions in their set order, then any name not among them, then none.
  const order = [...data.divisions.map((d) => d.name as string | null)]
  for (const e of entries) if (!order.includes(e.divisionName)) order.push(e.divisionName)
  order.sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0))

  const divisions = order.map((name) => {
    const list = entries.filter((e) => e.divisionName === name)
    let rank = 1
    const rows = list.map((entry, i) => {
      const scored = hasResults(entry)
      if (i > 0 && scored && !tied(list[i - 1], entry)) rank = i + 1
      return { entry, rank: scored ? rank : null }
    })
    return { name, rows }
  }).filter((d) => d.rows.length > 0)

  return { scoring: data.scoring, visibleWorkouts, decidingWorkoutId, divisions }
}

// ── CSV cells ────────────────────────────────────────────────────────────────

export function csvCell(val: unknown): string {
  const s = val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

/** A whole table: the header, then one line per row. */
export function csvTable(header: string[], data: unknown[][]): string {
  return [csvRow(header), ...data.map(csvRow)].join('\n')
}

