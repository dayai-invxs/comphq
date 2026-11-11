import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, heatAssignment, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseCsv } from '@/lib/csv'
import { workoutHasScores } from '@/lib/heatDeletion'
import { planMerge } from '@/lib/heatMerge'

// POST /api/import/heats { slug, csv, mode }
//   preview — writes nothing; names the workouts in the file that already
//             have heats, so the admin can choose how to import
//   replace — (default) each workout in the file gets exactly the file's heats
//   merge   — "add / update": the file decides the lanes it lists and the
//             athletes it names; everything else in the workout stays
type Mode = 'preview' | 'replace' | 'merge'
const MODES: Mode[] = ['preview', 'replace', 'merge']

interface CsvRow {
  workoutNumber: number; heatNumber: number; laneNumber: number; athleteName: string; lineIndex: number
}
interface ImportResult {
  imported: number
  workoutsAffected: number[]
  errors: { line: number; message: string }[]
  warnings: { message: string }[]
  /** What an add / update left in place, per workout. */
  notes: { message: string }[]
}

/** A workout in the file that already has heats (preview). */
interface ExistingWorkout { number: number; name: string; heats: number; lanes: number; scored: boolean }

function isHeaderRow(cells: string[]): boolean {
  return cells.map((c) => c.toLowerCase()).some((c) => ['workout', 'heat', 'lane', 'athlete'].includes(c))
}

export async function POST(req: Request) {
  let csvText: string
  let slug = ''
  let modeRaw: unknown
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return new Response('No file provided', { status: 400 })
      csvText = await file.text()
      slug = (form.get('slug') as string) ?? ''
      modeRaw = form.get('mode')
    } else {
      const body = await req.json()
      csvText = body.csv ?? ''
      slug = body.slug ?? ''
      modeRaw = body.mode
    }
    const mode = (modeRaw ?? 'replace') as Mode
    if (!MODES.includes(mode)) return new Response(`Unknown mode "${String(modeRaw)}"`, { status: 400 })

    const { competition } = await requireCompetitionAdmin(slug)
    return await runImport(csvText, competition.id, mode)
  } catch (e) {
    return authErrorResponse(e)
  }
}

async function runImport(csvText: string, competitionId: number, mode: Mode): Promise<Response> {
  if (!csvText.trim()) return new Response('Empty CSV', { status: 400 })
  const allRows = parseCsv(csvText)
  if (allRows.length === 0) return new Response('No rows found', { status: 400 })

  const headerPresent = isHeaderRow(allRows[0])
  const dataRows = headerPresent ? allRows.slice(1) : allRows
  const result: ImportResult = { imported: 0, workoutsAffected: [], errors: [], warnings: [], notes: [] }
  const parsed: CsvRow[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const lineIndex = headerPresent ? i + 2 : i + 1
    if (cells.length < 4) {
      result.errors.push({ line: lineIndex, message: `Expected 4 columns, got ${cells.length}` })
      continue
    }
    const [wRaw, hRaw, lRaw, ...nameParts] = cells
    const workoutNumber = parseInt(wRaw), heatNumber = parseInt(hRaw), laneNumber = parseInt(lRaw)
    const athleteName = nameParts.join(',').trim()
    if (isNaN(workoutNumber) || isNaN(heatNumber) || isNaN(laneNumber)) {
      result.errors.push({ line: lineIndex, message: `Non-numeric value in workout/heat/lane columns: "${wRaw}", "${hRaw}", "${lRaw}"` })
      continue
    }
    if (!athleteName) continue
    parsed.push({ workoutNumber, heatNumber, laneNumber, athleteName, lineIndex })
  }

  if (parsed.length === 0) return Response.json({ ...result, message: 'No valid rows to import' })

  const [workoutRows, athleteRows] = await Promise.all([
    db
      .select({ id: workout.id, number: workout.number, name: workout.name })
      .from(workout)
      .where(eq(workout.competitionId, competitionId)),
    db
      .select({ id: athlete.id, name: athlete.name })
      .from(athlete)
      .where(eq(athlete.competitionId, competitionId)),
  ])

  const workoutByNumber = new Map(workoutRows.map((w) => [w.number, w.id]))

  if (mode === 'preview') return Response.json({ existing: await existingHeats(workoutRows, parsed) })
  const athleteByName = new Map(athleteRows.map((a) => [a.name.toLowerCase().trim(), a.id]))

  const byWorkout = new Map<number, CsvRow[]>()
  for (const row of parsed) {
    if (!byWorkout.has(row.workoutNumber)) byWorkout.set(row.workoutNumber, [])
    byWorkout.get(row.workoutNumber)!.push(row)
  }

  for (const [workoutNumber, rows] of byWorkout) {
    const workoutId = workoutByNumber.get(workoutNumber)
    if (!workoutId) {
      for (const row of rows) result.errors.push({ line: row.lineIndex, message: `Workout #${workoutNumber} not found` })
      continue
    }

    const assignments: { athleteId: number; heatNumber: number; lane: number }[] = []
    const taken = new Set<string>()
    // A team listed more than once is allowed (some sheets run a team in two
    // heats); it is placed every time and reported as a warning.
    const heatsByAthlete = new Map<number, { name: string; heats: number[] }>()

    for (const row of rows) {
      const athleteId = athleteByName.get(row.athleteName.toLowerCase().trim())
      if (!athleteId) {
        result.errors.push({ line: row.lineIndex, message: `Athlete not found: "${row.athleteName}"` })
        continue
      }
      const laneKey = `${row.heatNumber}|${row.laneNumber}`
      if (taken.has(laneKey)) {
        result.errors.push({ line: row.lineIndex, message: `Heat ${row.heatNumber} lane ${row.laneNumber} is listed more than once in workout #${workoutNumber}` })
        continue
      }
      taken.add(laneKey)
      const placed = heatsByAthlete.get(athleteId) ?? { name: row.athleteName, heats: [] }
      placed.heats.push(row.heatNumber)
      heatsByAthlete.set(athleteId, placed)
      assignments.push({ athleteId, heatNumber: row.heatNumber, lane: row.laneNumber })
    }

    for (const { name, heats } of heatsByAthlete.values()) {
      if (heats.length < 2) continue
      result.warnings.push({ message: `"${name}" is in workout #${workoutNumber} ${heats.length} times (heats ${heats.join(', ')})` })
    }

    if (assignments.length === 0) continue

    try {
      if (mode === 'merge') {
        const note = await mergeHeats(workoutId, assignments)
        if (note) result.notes.push({ message: `Workout #${workoutNumber}: ${note}` })
      } else {
        await db.execute(
          sql`SELECT replace_workout_heat_assignments(${workoutId}::int, ${JSON.stringify(assignments)}::jsonb)`,
        )
      }
      result.imported += assignments.length
      result.workoutsAffected.push(workoutNumber)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      result.errors.push({ line: rows[0].lineIndex, message: `Import failed: ${msg}` })
    }
  }

  return Response.json(result)
}

/** The workouts named in the file that already have heats. */
async function existingHeats(
  workouts: Array<{ id: number; number: number; name: string }>, rows: CsvRow[],
): Promise<ExistingWorkout[]> {
  const inFile = new Set(rows.map((r) => r.workoutNumber))
  const named = workouts.filter((w) => inFile.has(w.number))
  if (named.length === 0) return []
  const lanes = await db
    .select({ workoutId: heatAssignment.workoutId, heatNumber: heatAssignment.heatNumber })
    .from(heatAssignment)
    .where(inArray(heatAssignment.workoutId, named.map((w) => w.id)))
  const out: ExistingWorkout[] = []
  for (const w of [...named].sort((a, b) => a.number - b.number)) {
    const mine = lanes.filter((l) => l.workoutId === w.id)
    if (mine.length === 0) continue
    out.push({
      number: w.number, name: w.name,
      heats: new Set(mine.map((l) => l.heatNumber)).size, lanes: mine.length,
      scored: await workoutHasScores(w.id),
    })
  }
  return out
}

/** Add / update one workout's heats from the file; see heatMerge.ts. */
async function mergeHeats(
  workoutId: number, incoming: Array<{ athleteId: number; heatNumber: number; lane: number }>,
): Promise<string | null> {
  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: heatAssignment.id, athleteId: heatAssignment.athleteId, heatNumber: heatAssignment.heatNumber, lane: heatAssignment.lane, round: heatAssignment.round })
      .from(heatAssignment)
      .where(eq(heatAssignment.workoutId, workoutId))
    const plan = planMerge(existing, incoming)
    if (plan.remove.length) await tx.delete(heatAssignment).where(inArray(heatAssignment.id, plan.remove.map((r) => r.id)))
    if (plan.insert.length) await tx.insert(heatAssignment).values(plan.insert.map((r) => ({ workoutId, ...r })))
    const parts = [
      plan.remove.length ? `${plan.remove.length} existing lane${plan.remove.length === 1 ? '' : 's'} replaced or moved` : '',
      plan.untouched ? `${plan.untouched} lane${plan.untouched === 1 ? '' : 's'} not in the file left as they were` : '',
      plan.kept ? `${plan.kept} already matched` : '',
    ].filter(Boolean)
    return parts.length ? `${parts.join('; ')}.` : null
  })
}
