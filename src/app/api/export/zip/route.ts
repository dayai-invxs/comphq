import { getServerSession } from 'next-auth'
import { zipSync, strToU8 } from 'fflate'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'
import { formatScore } from '@/lib/scoreFormat'

// CSV helpers kept local — duplicating 6 lines here is cheaper than an
// import dance for a rarely-used endpoint.
function esc(val: unknown): string {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}
function rows(header: string[], data: (string | number | null | undefined)[][]): string {
  return [header.map(esc).join(','), ...data.map((r) => r.map(esc).join(','))].join('\n')
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

  const { data: workoutsRes } = await supabase
    .from('Workout').select('*').eq('competitionId', competition.id).order('number')
  const workouts = (workoutsRes ?? []) as Array<{
    id: number; number: number; name: string; scoreType: string; status: string;
    lanes: number; halfWeight?: boolean
  }>
  const workoutIds = workouts.map((w) => w.id)

  const [
    { data: athletesRes },
    { data: divisionsRes },
    { data: assignmentsRes },
    { data: scoresRes },
  ] = await Promise.all([
    supabase.from('Athlete').select('*').eq('competitionId', competition.id).order('name'),
    supabase.from('Division').select('*').eq('competitionId', competition.id).order('order'),
    supabase.from('HeatAssignment').select('*, athlete:Athlete(id, name, bibNumber, divisionId)').in('workoutId', workoutIds),
    supabase.from('Score').select('*').in('workoutId', workoutIds),
  ])

  const athletes = (athletesRes ?? []) as Array<{ id: number; name: string; bibNumber: string | null; divisionId: number | null }>
  const divisions = (divisionsRes ?? []) as Array<{ id: number; name: string; order: number }>
  const assignments = (assignmentsRes ?? []) as Array<{ workoutId: number; heatNumber: number; lane: number; athlete: { id: number; name: string; bibNumber: string | null; divisionId: number | null } }>
  const scores = (scoresRes ?? []) as Array<{ athleteId: number; workoutId: number; rawScore: number; tiebreakRawScore: number | null; points: number | null; partBRawScore: number | null; partBPoints: number | null }>

  const divName = new Map(divisions.map((d) => [d.id, d.name]))

  const exportedAt = new Date().toISOString()

  const files: Record<string, string> = {
    'athletes.csv': rows(
      ['id', 'name', 'bibNumber', 'divisionId', 'divisionName'],
      athletes.map((a) => [a.id, a.name, a.bibNumber ?? '', a.divisionId ?? '', a.divisionId ? (divName.get(a.divisionId) ?? '') : '']),
    ),
    'divisions.csv': rows(
      ['id', 'name', 'order'],
      divisions.map((d) => [d.id, d.name, d.order]),
    ),
    'workouts.csv': rows(
      ['id', 'number', 'name', 'scoreType', 'status', 'lanes', 'halfWeight'],
      workouts.map((w) => [w.id, w.number, w.name, w.scoreType, w.status, w.lanes, w.halfWeight ? 'true' : 'false']),
    ),
    'heat_assignments.csv': rows(
      ['workoutId', 'workoutNumber', 'heatNumber', 'lane', 'athleteId', 'athleteName', 'bibNumber'],
      assignments.map((h) => {
        const wNum = workouts.find((w) => w.id === h.workoutId)?.number ?? ''
        return [h.workoutId, wNum, h.heatNumber, h.lane, h.athlete.id, h.athlete.name, h.athlete.bibNumber ?? '']
      }),
    ),
    'scores.csv': rows(
      ['workoutId', 'workoutNumber', 'athleteId', 'athleteName', 'rawScore', 'formattedScore', 'tiebreakRawScore', 'points', 'partBRawScore', 'partBPoints'],
      scores.map((s) => {
        const w = workouts.find((x) => x.id === s.workoutId)
        const aName = athletes.find((x) => x.id === s.athleteId)?.name ?? ''
        return [
          s.workoutId, w?.number ?? '', s.athleteId, aName,
          s.rawScore, w ? formatScore(s.rawScore, w.scoreType) : '',
          s.tiebreakRawScore ?? '',
          s.points ?? '',
          s.partBRawScore ?? '',
          s.partBPoints ?? '',
        ]
      }),
    ),
    'manifest.json': JSON.stringify({
      competition: { id: competition.id, name: competition.name, slug: competition.slug },
      exportedAt,
      counts: {
        athletes: athletes.length,
        divisions: divisions.length,
        workouts: workouts.length,
        assignments: assignments.length,
        scores: scores.length,
      },
      version: 1,
    }, null, 2),
  }

  const u8 = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
  const filename = `${competition.slug}-export-${exportedAt.slice(0, 10)}.zip`

  return new Response(new Blob([u8 as BlobPart], { type: 'application/zip' }), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(u8.length),
    },
  })
}
