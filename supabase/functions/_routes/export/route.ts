import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { csvRow, loadCompetitionData, standingsByDivision } from '@/lib/competitionExport'
import { displayScoreType, formatScore, formatTiebreak } from '@/lib/scoreFormat'
import { workoutWeight } from '@/lib/workoutWeight'
import type { Workout } from '@/db/schema'

// One CSV of results for a person to open in a spreadsheet: the standings as
// the leaderboard shows them, then every workout's scores and heats, the
// roster, volunteers and equipment. The ZIP export is the complete copy of
// the data; this one is for reading.

const section = (title: string) => `\n${title}`

const eventLabel = (w: Pick<Workout, 'number' | 'name'>) => `Event ${w.number} - ${w.name}`

const weightMark = (w: Workout) => (workoutWeight(w) === 2 ? ' (2×)' : workoutWeight(w) === 0.5 ? ' (½)' : '')

const yes = (b: boolean | null | undefined) => (b ? 'Yes' : '')

const formatTotal = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1))

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  let competition: { id: number; name: string; slug: string }
  try {
    ({ competition } = await requireCompetitionAccess(slug))
  } catch (e) {
    return authErrorResponse(e)
  }

  const data = await loadCompetitionData(competition.id)
  const { workouts, athletes, divisions, scoring } = data
  const pointsMode = scoring.system === 'points'

  const divName = new Map(divisions.map((d) => [d.id, d.name]))
  const athleteById = new Map(athletes.map((a) => [a.id, a]))
  const memberById = new Map(data.teamMembers.map((m) => [m.id, m]))
  const membersOf = new Map<number, typeof data.teamMembers>()
  for (const m of data.teamMembers) membersOf.set(m.athleteId, [...(membersOf.get(m.athleteId) ?? []), m])
  const memberNames = (athleteId: number) => (membersOf.get(athleteId) ?? []).map((m) => m.name).join('; ')
  const divisionOf = (athleteId: number) => {
    const d = athleteById.get(athleteId)?.divisionId
    return d ? (divName.get(d) ?? '') : ''
  }
  const volunteerById = new Map(data.volunteers.map((v) => [v.id, v]))
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]))
  const locationName = new Map(data.locations.map((l) => [l.id, l.name]))

  const lines: string[] = []
  const push = (...cells: unknown[]) => lines.push(csvRow(cells))

  // ── HEADER ───────────────────────────────────────────────────────────────
  const tiebreakId = Number(data.settingMap.get('tiebreakWorkoutId') ?? NaN)
  const tiebreakWorkout = workouts.find((w) => w.id === tiebreakId)
  push('Competition', competition.name)
  push('Exported', new Date().toISOString())
  push('Scoring', pointsMode
    ? `Highest points wins (1st = ${scoring.scale.first}, ${scoring.scale.step} fewer per place)`
    : 'Lowest total wins (a place is worth its number)')
  push('Tiebreaker workout', tiebreakWorkout ? eventLabel(tiebreakWorkout) : 'None')
  push('Leaderboard shows', data.settingMap.get('leaderboardVisibility') === 'per_workout'
    ? 'Finished workouts only'
    : 'Live, as heats finish')

  // ── STANDINGS ────────────────────────────────────────────────────────────
  // The leaderboard's own ranking (lib/standings.ts), one table per division.
  const standings = standingsByDivision(data)
  const decider = workouts.find((w) => w.id === standings.decidingWorkoutId)
  for (const d of standings.divisions) {
    lines.push(section(`STANDINGS — ${d.name ?? 'No Division'}`))
    if (decider) push(`Final standings decided by the ${eventLabel(decider)} knockout`)
    push('Rank', 'Name', 'Bib #', 'Team Members',
      ...standings.visibleWorkouts.map((w) => `Event ${w.number}${weightMark(w)}`), 'Total')
    for (const { entry, rank } of d.rows) {
      const cells = standings.visibleWorkouts.map((w) => {
        const ws = entry.workoutScores[w.id]
        if (!ws) return ''
        let text = `#${ws.points}`
        if (w.partBEnabled && ws.partBPoints != null) text += ` / B #${ws.partBPoints}`
        if (pointsMode && ws.awarded != null) text += ` · ${ws.awarded} pts`
        text += ` (${ws.display}${ws.tiebreakDisplay ? `, TB ${ws.tiebreakDisplay}` : ''})`
        return text
      })
      push(rank ?? '—', entry.athleteName, athleteById.get(entry.athleteId)?.bibNumber ?? '',
        memberNames(entry.athleteId), ...cells, rank == null ? '—' : formatTotal(entry.totalPoints))
    }
  }

  // ── WORKOUTS ─────────────────────────────────────────────────────────────
  lines.push(section('WORKOUTS'))
  push('Event #', 'Name', 'Score Type', 'Status', 'Start Time', 'Location', 'Lanes', 'Weight',
    'Tiebreak', 'Part B', 'Knockout', 'Secret', 'Description')
  for (const w of workouts) {
    push(
      w.number, w.name, w.scoreType, w.status, w.startTime ?? '',
      w.locationId ? (locationName.get(w.locationId) ?? '') : '',
      w.lanes,
      w.doubleWeight ? 'Double' : w.halfWeight ? 'Half' : 'Normal',
      w.tiebreakEnabled ? w.tiebreakScoreType : '',
      w.partBEnabled ? w.partBScoreType : '',
      w.knockout
        ? [
            `${w.knockoutRounds ?? '?'} rounds, top ${w.knockoutAdvance ?? '?'} advance`,
            w.knockoutConsolation ? 'consolation heats' : '',
            w.knockoutDecides ? 'decides the competition' : '',
          ].filter(Boolean).join('; ')
        : '',
      yes(w.secret),
      w.description ?? '',
    )
  }

  // ── SCORES, per workout ──────────────────────────────────────────────────
  for (const w of workouts) {
    const ws = data.scores.filter((s) => s.workoutId === w.id)
    if (ws.length === 0) continue
    // Rounds + reps with no rounds anywhere reads as reps, as on the board.
    const shown = displayScoreType(w.scoreType, ws.filter((s) => s.points != null).map((s) => s.rawScore))
    const shownB = displayScoreType(w.partBScoreType, ws.map((s) => s.partBRawScore))
    lines.push(section(`SCORES — ${eventLabel(w)}`))
    push('Division', 'Place', 'Athlete/Team', 'Score', 'Capped',
      ...(w.tiebreakEnabled ? ['Tiebreak'] : []),
      ...(w.partBEnabled ? ['Part B Place', 'Part B Score', 'Part B Capped'] : []),
      ...(w.knockout ? ['Knockout Result'] : []))
    const sorted = [...ws].sort((a, b) =>
      divisionOf(a.athleteId).localeCompare(divisionOf(b.athleteId))
      || (a.points ?? Infinity) - (b.points ?? Infinity)
      || (athleteById.get(a.athleteId)?.name ?? '').localeCompare(athleteById.get(b.athleteId)?.name ?? ''))
    for (const s of sorted) {
      push(
        divisionOf(s.athleteId), s.points ?? '', athleteById.get(s.athleteId)?.name ?? '',
        formatScore(s.rawScore, shown, s.capped), yes(s.capped),
        ...(w.tiebreakEnabled
          ? [s.tiebreakRawScore == null ? '' : w.tiebreakScoreType === 'time' ? formatTiebreak(s.tiebreakRawScore) : formatScore(s.tiebreakRawScore, w.tiebreakScoreType)]
          : []),
        ...(w.partBEnabled
          ? [s.partBPoints ?? '', s.partBRawScore == null ? '' : formatScore(s.partBRawScore, shownB, s.partBCapped), yes(s.partBCapped)]
          : []),
        ...(w.knockout ? [s.knockoutLabel ?? ''] : []),
      )
    }
  }

  // ── HEATS, per workout ───────────────────────────────────────────────────
  for (const w of workouts) {
    const lanes = data.assignments.filter((h) => h.workoutId === w.id)
    if (lanes.length === 0) continue
    const done = new Set(data.completions.filter((c) => c.workoutId === w.id).map((c) => c.heatNumber))
    const judge = new Map(data.judges.filter((j) => j.workoutId === w.id).map((j) => [`${j.heatNumber}-${j.lane}`, j.volunteerId]))
    const laneScores = lanes.some((h) => h.rawScore != null)
    lines.push(section(`HEATS — ${eventLabel(w)}`))
    push(...(w.knockout ? ['Round'] : []), 'Heat', 'Lane', 'Athlete/Team', 'Running', 'Division', 'Bib #',
      ...(laneScores ? ['Lane Score'] : []),
      ...(w.knockout ? ['Consolation', 'Advanced'] : []),
      'Judge', 'Heat Finished')
    const sorted = [...lanes].sort((a, b) => (a.round ?? 1) - (b.round ?? 1) || a.heatNumber - b.heatNumber || a.lane - b.lane)
    for (const h of sorted) {
      const a = athleteById.get(h.athleteId)
      const judgeId = judge.get(`${h.heatNumber}-${h.lane}`)
      push(
        ...(w.knockout ? [h.round ?? 1] : []),
        h.heatNumber, h.lane, a?.name ?? '',
        h.teamMemberId ? (memberById.get(h.teamMemberId)?.name ?? '') : '',
        divisionOf(h.athleteId), a?.bibNumber ?? '',
        ...(laneScores ? [h.rawScore == null ? '' : formatScore(h.rawScore, w.scoreType, h.capped)] : []),
        ...(w.knockout ? [yes(h.consolation), h.advanced == null ? '' : h.advanced ? 'Yes' : 'No'] : []),
        judgeId ? (volunteerById.get(judgeId)?.name ?? '') : '',
        yes(done.has(h.heatNumber)),
      )
    }
  }

  // ── ATHLETES/TEAMS ───────────────────────────────────────────────────────
  lines.push(section('ATHLETES/TEAMS'))
  push('Name', 'Division', 'Bib #', 'Gender', 'Withdrawn', 'Team Members')
  for (const a of athletes) {
    const members = (membersOf.get(a.id) ?? []).map((m) => (m.gender ? `${m.name} (${m.gender})` : m.name)).join('; ')
    push(a.name, divisionOf(a.id), a.bibNumber ?? '', a.gender ?? '', yes(a.withdrawn), members)
  }

  // ── VOLUNTEERS ───────────────────────────────────────────────────────────
  if (data.volunteers.length > 0) {
    lines.push(section('VOLUNTEERS'))
    push('Name', 'Role')
    for (const v of data.volunteers) push(v.name, v.roleId ? (roleName.get(v.roleId) ?? '') : '')
  }

  // ── EQUIPMENT ────────────────────────────────────────────────────────────
  if (data.equipment.length > 0) {
    const eventOf = new Map(workouts.map((w) => [w.id, w]))
    lines.push(section('EQUIPMENT'))
    push('Event', 'Item', 'Division')
    for (const e of data.equipment) {
      const w = eventOf.get(e.workoutId)
      push(w ? eventLabel(w) : '', e.item, e.divisionId ? (divName.get(e.divisionId) ?? '') : 'All')
    }
  }

  // The byte-order mark tells Excel the file is UTF-8 (names with accents, ½, ×).
  const csv = '\uFEFF' + lines.join('\n') + '\n'
  const filename = `${competition.slug}-export-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
