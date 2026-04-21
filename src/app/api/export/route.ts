import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'
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
  const session = await getServerSession(authOptions)
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  let competition: { id: number; name: string; slug: string }
  try {
    ({ competition } = await requireCompetitionMember(session, slug))
  } catch (e) {
    return authErrorResponse(e)
  }

  const { data: workouts } = await supabase.from('Workout').select('*').eq('competitionId', competition.id).order('number')
  const workoutIds = (workouts ?? []).map((w) => (w as { id: number }).id)

  const [
    { data: athletes },
    { data: divisions },
    { data: assignments },
    { data: scores },
  ] = await Promise.all([
    supabase.from('Athlete').select('*').eq('competitionId', competition.id).order('name'),
    supabase.from('Division').select('*').eq('competitionId', competition.id).order('order'),
    supabase.from('HeatAssignment').select('*, athlete:Athlete(id, name, bibNumber, divisionId)').in('workoutId', workoutIds),
    supabase.from('Score').select('*').in('workoutId', workoutIds),
  ])

  type Workout = { id: number; number: number; name: string; scoreType: string; status: string; lanes: number; halfWeight?: boolean }
  type Athlete = { id: number; name: string; bibNumber: string | null; divisionId: number | null }
  type Division = { id: number; name: string; order: number }
  type Assignment = { workoutId: number; heatNumber: number; lane: number; athlete: Athlete }
  type Score = { athleteId: number; workoutId: number; rawScore: number; points: number | null; partBRawScore: number | null; partBPoints: number | null }

  const ws = (workouts ?? []) as Workout[]
  const as_ = (athletes ?? []) as Athlete[]
  const ds = (divisions ?? []) as Division[]
  const hs = (assignments ?? []) as Assignment[]
  const ss = (scores ?? []) as Score[]

  const divMap = new Map(ds.map((d) => [d.id, d.name]))
  const scoreKey = (athleteId: number, workoutId: number) => `${athleteId}-${workoutId}`
  const scoreMap = new Map(ss.map((s) => [scoreKey(s.athleteId, s.workoutId), s]))

  const lines: string[] = []
  const now = new Date().toLocaleString()

  // Header
  lines.push(row('Competition', competition.name))
  lines.push(row('Exported', now))

  // ── WORKOUTS ─────────────────────────────────────────────────────────────
  lines.push(section('WORKOUTS'))
  lines.push(row('WOD #', 'Name', 'Score Type', 'Status', 'Lanes', 'Half Weight'))
  for (const w of ws) {
    lines.push(row(w.number, w.name, w.scoreType, w.status, w.lanes, w.halfWeight ? 'Yes' : 'No'))
  }

  // ── HEAT ASSIGNMENTS ─────────────────────────────────────────────────────
  for (const w of ws) {
    lines.push(section(`HEAT ASSIGNMENTS — WOD ${w.number}: ${w.name}`))
    lines.push(row('Heat', 'Lane', 'Athlete', 'Division', 'Bib #'))
    const wAssignments = hs
      .filter((h) => h.workoutId === w.id)
      .sort((a, b) => a.heatNumber - b.heatNumber || a.lane - b.lane)
    for (const h of wAssignments) {
      lines.push(row(
        h.heatNumber,
        h.lane,
        h.athlete.name,
        h.athlete.divisionId ? (divMap.get(h.athlete.divisionId) ?? '—') : '—',
        h.athlete.bibNumber ?? '—',
      ))
    }
  }

  // ── ATHLETES & SCORES ────────────────────────────────────────────────────
  lines.push(section('ATHLETES & SCORES'))
  const scoreHeaders = ws.map((w) => `WOD ${w.number}${w.halfWeight ? ' (½)' : ''}`)
  lines.push(row('Name', 'Division', 'Bib #', ...scoreHeaders, 'Total Points'))

  // Group athletes by division
  const byDivision = new Map<string, Athlete[]>()
  for (const a of as_) {
    const divName = a.divisionId ? (divMap.get(a.divisionId) ?? 'No Division') : 'No Division'
    if (!byDivision.has(divName)) byDivision.set(divName, [])
    byDivision.get(divName)!.push(a)
  }

  for (const [divName, divAthletes] of byDivision) {
    lines.push(row(`— ${divName} —`))
    for (const a of divAthletes) {
      let total = 0
      const workoutCols = ws.map((w) => {
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

  const completedWorkouts = ws.filter((w) => w.status === 'completed')
  const leaderboardEntries = as_.map((a) => {
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
