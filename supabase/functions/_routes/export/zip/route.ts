import { getTableColumns, type Table } from 'drizzle-orm'
import { zipSync, strToU8 } from 'fflate'
import {
  athlete, competition as competitionTable, division, heatAssignment, heatCompletion, judgeAssignment, score,
  teamMember, volunteer, volunteerRole, workout, workoutEquipment, workoutLocation,
} from '@/db/schema'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionAccess } from '@/lib/auth-competition'
import { csvTable, loadCompetitionData, standingsByDivision, type CompetitionData } from '@/lib/competitionExport'
import { formatScore, formatTiebreak } from '@/lib/scoreFormat'

// The whole competition, one CSV per table with every column under its
// database name and every id kept, so the rows still point at each other
// (a lane's teamMemberId, a judge's volunteerId). data.json holds the same
// rows with their types intact (nulls, booleans, the score card), for
// anything that reads the file back. The *Name / formatted columns are extras
// for a person reading the CSV; the rest is the database as it stands.
//
// Left out on purpose: the judge password, comp users, the activity log
// (lib/competitionExport.ts).

const FORMAT_VERSION = 2

/** The table's own column names, in schema order. */
const columnsOf = (table: Table) => Object.keys(getTableColumns(table))

/** Every column of the table, then the extras after them. */
function dump<T extends Record<string, unknown>>(
  table: Table,
  rows: T[],
  extras: Record<string, (row: T) => unknown> = {},
): string {
  const cols = columnsOf(table)
  const extraNames = Object.keys(extras)
  return csvTable(
    [...cols, ...extraNames],
    rows.map((r) => [...cols.map((c) => r[c]), ...extraNames.map((n) => extras[n](r))]),
  )
}

function standingsCsv(data: CompetitionData): string {
  const { scoring, visibleWorkouts, divisions } = standingsByDivision(data)
  const pointsMode = scoring.system === 'points'
  const header = ['division', 'rank', 'athleteId', 'name', 'totalPoints']
  for (const w of visibleWorkouts) {
    header.push(`event${w.number}Place`, `event${w.number}Result`)
    if (w.partBEnabled) header.push(`event${w.number}PartBPlace`)
    if (pointsMode) header.push(`event${w.number}Points`)
  }
  const out: unknown[][] = []
  for (const d of divisions) {
    for (const { entry, rank } of d.rows) {
      const cells: unknown[] = [d.name ?? '', rank ?? '', entry.athleteId, entry.athleteName, entry.totalPoints]
      for (const w of visibleWorkouts) {
        const ws = entry.workoutScores[w.id]
        cells.push(ws?.points ?? '', ws ? ws.display + (ws.tiebreakDisplay ? ` (TB ${ws.tiebreakDisplay})` : '') : '')
        if (w.partBEnabled) cells.push(ws?.partBPoints ?? '')
        if (pointsMode) cells.push(ws?.awarded ?? '')
      }
      out.push(cells)
    }
  }
  return csvTable(header, out)
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  let competition: { id: number; name: string; slug: string }
  try {
    ({ competition } = await requireCompetitionAccess(slug))
  } catch (e) {
    return authErrorResponse(e)
  }

  const data = await loadCompetitionData(competition.id)
  const exportedAt = new Date().toISOString()

  const workoutById = new Map(data.workouts.map((w) => [w.id, w]))
  const athleteName = new Map(data.athletes.map((a) => [a.id, a.name]))
  const divisionName = new Map(data.divisions.map((d) => [d.id, d.name]))
  const memberName = new Map(data.teamMembers.map((m) => [m.id, m.name]))
  const volunteerName = new Map(data.volunteers.map((v) => [v.id, v.name]))
  const roleName = new Map(data.roles.map((r) => [r.id, r.name]))
  const locationName = new Map(data.locations.map((l) => [l.id, l.name]))
  const eventNumber = (row: { workoutId: number }) => workoutById.get(row.workoutId)?.number ?? ''
  const nameOfAthlete = (row: { athleteId: number }) => athleteName.get(row.athleteId) ?? ''
  const scoreText = (workoutId: number, raw: number | null, type: 'main' | 'tiebreak' | 'partB', capped = false) => {
    const w = workoutById.get(workoutId)
    if (raw == null || !w) return ''
    if (type === 'tiebreak') return w.tiebreakScoreType === 'time' ? formatTiebreak(raw) : formatScore(raw, w.tiebreakScoreType)
    return formatScore(raw, type === 'partB' ? w.partBScoreType : w.scoreType, capped)
  }

  const files: Record<string, string> = {
    'competition.csv': dump(competitionTable, data.competition ? [data.competition] : []),
    'settings.csv': csvTable(['key', 'value'], data.settings.map((s) => [s.key, s.value])),
    'divisions.csv': dump(division, data.divisions),
    'athletes.csv': dump(athlete, data.athletes, {
      divisionName: (a) => (a.divisionId ? divisionName.get(a.divisionId) ?? '' : ''),
    }),
    // One line per person on a team, under the athlete row that competes.
    'team_members.csv': dump(teamMember, data.teamMembers, { athleteName: nameOfAthlete }),
    'workout_locations.csv': dump(workoutLocation, data.locations),
    'workouts.csv': dump(workout, data.workouts, {
      locationName: (w) => (w.locationId ? locationName.get(w.locationId) ?? '' : ''),
    }),
    'heat_assignments.csv': dump(heatAssignment, data.assignments, {
      workoutNumber: eventNumber,
      athleteName: nameOfAthlete,
      teamMemberName: (h) => (h.teamMemberId ? memberName.get(h.teamMemberId) ?? '' : ''),
      formattedLaneScore: (h) => scoreText(h.workoutId, h.rawScore, 'main', h.capped),
    }),
    'heat_completions.csv': dump(heatCompletion, data.completions, { workoutNumber: eventNumber }),
    'scores.csv': dump(score, data.scores, {
      workoutNumber: eventNumber,
      athleteName: nameOfAthlete,
      formattedScore: (s) => scoreText(s.workoutId, s.rawScore, 'main', s.capped),
      formattedTiebreak: (s) => scoreText(s.workoutId, s.tiebreakRawScore, 'tiebreak'),
      formattedPartB: (s) => scoreText(s.workoutId, s.partBRawScore, 'partB', s.partBCapped),
    }),
    'standings.csv': standingsCsv(data),
    'volunteer_roles.csv': dump(volunteerRole, data.roles),
    'volunteers.csv': dump(volunteer, data.volunteers, {
      roleName: (v) => (v.roleId ? roleName.get(v.roleId) ?? '' : ''),
    }),
    'judge_assignments.csv': dump(judgeAssignment, data.judges, {
      workoutNumber: eventNumber,
      volunteerName: (j) => volunteerName.get(j.volunteerId) ?? '',
    }),
    'equipment.csv': dump(workoutEquipment, data.equipment, {
      workoutNumber: eventNumber,
      divisionName: (e) => (e.divisionId ? divisionName.get(e.divisionId) ?? '' : ''),
    }),
  }

  const tables = {
    competition: data.competition,
    settings: data.settings,
    divisions: data.divisions,
    athletes: data.athletes,
    teamMembers: data.teamMembers,
    workoutLocations: data.locations,
    workouts: data.workouts,
    heatAssignments: data.assignments,
    heatCompletions: data.completions,
    scores: data.scores,
    volunteerRoles: data.roles,
    volunteers: data.volunteers,
    judgeAssignments: data.judges,
    equipment: data.equipment,
  }
  files['data.json'] = JSON.stringify({ version: FORMAT_VERSION, exportedAt, ...tables }, null, 2)

  const binary: Record<string, Uint8Array> = {}
  const logo = await readLogo(competition.id, data.settingMap.get('logoUrl'))
  if (logo) binary[logo.name] = logo.bytes

  files['manifest.json'] = JSON.stringify({
    competition: { id: competition.id, name: competition.name, slug: competition.slug },
    exportedAt,
    version: FORMAT_VERSION,
    counts: Object.fromEntries(Object.entries(tables)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, (v as unknown[]).length])),
    files: [...Object.keys(files), ...Object.keys(binary)].sort(),
    notLeftIn: ['judge password', 'competition users', 'activity log'],
  }, null, 2)

  const u8 = zipSync({
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
    ...binary,
  })
  const filename = `${competition.slug}-export-${exportedAt.slice(0, 10)}.zip`

  return new Response(new Blob([u8 as BlobPart], { type: 'application/zip' }), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(u8.length),
    },
  })
}

const LOGO_BUCKET = 'logos'

/** The competition's logo file, read from storage (never fetched by URL). A
    logo that cannot be read is left out rather than failing the export: the
    data matters more than the picture. */
async function readLogo(competitionId: number, url: string | undefined): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (!url) return null
  try {
    // logos/<competitionId>/logo.<ext>, as the logo route stores it.
    const { pathname } = new URL(url)
    const marker = `/${LOGO_BUCKET}/`
    const at = pathname.indexOf(marker)
    if (at < 0) return null
    const path = decodeURIComponent(pathname.slice(at + marker.length))
    const m = new RegExp(`^${competitionId}/logo\\.(png|jpg|gif|webp)$`).exec(path)
    if (!m) return null
    const { data, error } = await supabase.storage.from(LOGO_BUCKET).download(path)
    if (error || !data) return null
    return { name: `logo.${m[1]}`, bytes: new Uint8Array(await data.arrayBuffer()) }
  } catch {
    return null
  }
}
