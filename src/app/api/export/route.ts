import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete as athleteTable, division as divisionTable, heatAssignment, score, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { formatScore } from '@/lib/scoreFormat'

function esc(val: string | number | null | undefined): string {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(esc).join(',')
}

function section(title: string): string {
  return `\n${title}\n`
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  let competition: { id: number; name: string; slug: string }
  try {
    ({ competition } = await requireCompetitionAdmin(slug))
  } catch (e) {
    return authErrorResponse(e)
  }

  const workouts = await db
    .select()
    .from(workout)
    .where(eq(workout.competitionId, competition.id))
    .orderBy(asc(workout.number))
  const workoutIds = workouts.map((w) => w.id)

  const [athletes, divisions, assignmentRows, scores] = await Promise.all([
    db.select().from(athleteTable).where(eq(athleteTable.competitionId, competition.id)).orderBy(asc(athleteTable.name)),
    db.select().from(divisionTable).where(eq(divisionTable.competitionId, competition.id)).orderBy(asc(divisionTable.order)),
    workoutIds.length > 0
      ? db
          .select({
            workoutId: heatAssignment.workoutId,
            heatNumber: heatAssignment.heatNumber,
            lane: heatAssignment.lane,
            athleteId: athleteTable.id,
            athleteName: athleteTable.name,
            bibNumber: athleteTable.bibNumber,
            divisionId: athleteTable.divisionId,
          })
          .from(heatAssignment)
          .innerJoin(athleteTable, eq(athleteTable.id, heatAssignment.athleteId))
          .where(inArray(heatAssignment.workoutId, workoutIds))
      : Promise.resolve([]),
    workoutIds.length > 0
      ? db.select().from(score).where(inArray(score.workoutId, workoutIds))
      : Promise.resolve([]),
  ])

  const divMap = new Map(divisions.map((d) => [d.id, d.name]))
  const scoreKey = (athleteId: number, workoutId: number) => `${athleteId}-${workoutId}`
  const scoreMap = new Map(scores.map((s) => [scoreKey(s.athleteId, s.workoutId), s]))

  const lines: string[] = []
  const now = new Date().toLocaleString()

  lines.push(row('Competition', competition.name))
  lines.push(row('Exported', now))

  // ── WORKOUTS ─────────────────────────────────────────────────────────────
  lines.push(section('WORKOUTS'))
  lines.push(row('WOD #', 'Name', 'Score Type', 'Status', 'Lanes', 'Half Weight'))
  for (const w of workouts) {
    lines.push(row(w.number, w.name, w.scoreType, w.status, w.lanes, w.halfWeight ? 'Yes' : 'No'))
  }

  // ── HEAT ASSIGNMENTS ─────────────────────────────────────────────────────
  for (const w of workouts) {
    lines.push(section(`HEAT ASSIGNMENTS — WOD ${w.number}: ${w.name}`))
    lines.push(row('Heat', 'Lane', 'Athlete', 'Division', 'Bib #'))
    const wAssignments = assignmentRows
      .filter((h) => h.workoutId === w.id)
      .sort((a, b) => a.heatNumber - b.heatNumber || a.lane - b.lane)
    for (const h of wAssignments) {
      lines.push(row(
        h.heatNumber,
        h.lane,
        h.athleteName,
        h.divisionId ? (divMap.get(h.divisionId) ?? '—') : '—',
        h.bibNumber ?? '—',
      ))
    }
  }

  // ── ATHLETES & SCORES ────────────────────────────────────────────────────
  lines.push(section('ATHLETES & SCORES'))
  const scoreHeaders = workouts.map((w) => `WOD ${w.number}${w.halfWeight ? ' (½)' : ''}`)
  lines.push(row('Name', 'Division', 'Bib #', ...scoreHeaders, 'Total Points'))

  const byDivision = new Map<string, typeof athletes>()
  for (const a of athletes) {
    const divName = a.divisionId ? (divMap.get(a.divisionId) ?? 'No Division') : 'No Division'
    if (!byDivision.has(divName)) byDivision.set(divName, [])
    byDivision.get(divName)!.push(a)
  }

  for (const [divName, divAthletes] of byDivision) {
    lines.push(row(`— ${divName} —`))
    for (const a of divAthletes) {
      let total = 0
      const workoutCols = workouts.map((w) => {
        const s = scoreMap.get(scoreKey(a.id, w.id))
        if (!s || s.points == null) return 'DNS'
        total += w.halfWeight ? s.points * 0.5 : s.points
        const display = formatScore(s.rawScore, w.scoreType)
        return `#${s.points} (${display})`
      })
      lines.push(row(
        a.name,
        a.divisionId ? (divMap.get(a.divisionId) ?? '—') : '—',
        a.bibNumber ?? '—',
        ...workoutCols,
        total > 0 ? total : '—',
      ))
    }
  }

  // ── OVERALL LEADERBOARD ──────────────────────────────────────────────────
  lines.push(section('OVERALL LEADERBOARD'))
  lines.push(row('Rank', 'Name', 'Division', ...scoreHeaders, 'Total Points'))

  const completedWorkouts = workouts.filter((w) => w.status === 'completed')
  const leaderboardEntries = athletes.map((a) => {
    let total = 0
    const workoutScores: Record<number, { points: number; rawScore: number } | null> = {}
    for (const w of completedWorkouts) {
      const s = scoreMap.get(scoreKey(a.id, w.id))
      if (s && s.points != null) {
        total += w.halfWeight ? s.points * 0.5 : s.points
        workoutScores[w.id] = { points: s.points, rawScore: s.rawScore }
      } else {
        workoutScores[w.id] = null
      }
    }
    return { athlete: a, total, workoutScores, hasAny: Object.values(workoutScores).some((v) => v !== null) }
  })

  leaderboardEntries.sort((a, b) => {
    if (a.hasAny && !b.hasAny) return -1
    if (!a.hasAny && b.hasAny) return 1
    if (a.total !== b.total) return a.total - b.total
    for (const w of [...completedWorkouts].sort((x, y) => y.number - x.number)) {
      const as = a.workoutScores[w.id], bs = b.workoutScores[w.id]
      if (as && bs && as.points !== bs.points) return as.points - bs.points
      if (as && !bs) return -1
      if (!as && bs) return 1
    }
    return a.athlete.name.localeCompare(b.athlete.name)
  })

  let rank = 1
  for (let i = 0; i < leaderboardEntries.length; i++) {
    const e = leaderboardEntries[i]
    if (!e.hasAny) { lines.push(row('—', e.athlete.name, e.athlete.divisionId ? (divMap.get(e.athlete.divisionId) ?? '—') : '—', ...completedWorkouts.map(() => 'DNS'), '—')); continue }
    if (i > 0 && leaderboardEntries[i - 1].hasAny) {
      const prev = leaderboardEntries[i - 1]
      if (e.total > prev.total) rank = i + 1
    }
    const divName = e.athlete.divisionId ? (divMap.get(e.athlete.divisionId) ?? '—') : '—'
    const wodCols = completedWorkouts.map((w) => {
      const s = e.workoutScores[w.id]
      return s ? `#${s.points} (${formatScore(s.rawScore, w.scoreType)})` : 'DNS'
    })
    lines.push(row(rank, e.athlete.name, divName, ...wodCols, Number.isInteger(e.total) ? e.total : e.total.toFixed(1)))
  }

  const csv = lines.join('\n')
  const filename = `${competition.slug}-export-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
