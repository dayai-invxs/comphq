import { asc, eq, inArray } from 'drizzle-orm'
import { zipSync, strToU8 } from 'fflate'
import { db } from '@/lib/db'
import { athlete as athleteTable, division as divisionTable, heatAssignment, score, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
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
      assignmentRows.map((h) => {
        const wNum = workouts.find((w) => w.id === h.workoutId)?.number ?? ''
        return [h.workoutId, wNum, h.heatNumber, h.lane, h.athleteId, h.athleteName, h.bibNumber ?? '']
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
        assignments: assignmentRows.length,
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
