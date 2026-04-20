import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

interface CsvRow { workoutNumber: number; heatNumber: number; laneNumber: number; athleteName: string; lineIndex: number }
interface ImportResult { imported: number; workoutsAffected: number[]; errors: { line: number; message: string }[]; warnings: { message: string }[] }

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const cells: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQuote = false
        else cur += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { cells.push(cur.trim()); cur = '' }
        else cur += ch
      }
    }
    cells.push(cur.trim())
    rows.push(cells)
  }
  return rows
}

function isHeaderRow(cells: string[]): boolean {
  return cells.map((c) => c.toLowerCase()).some((c) => ['workout', 'heat', 'lane', 'athlete'].includes(c))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  let csvText: string
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return new Response('No file provided', { status: 400 })
    csvText = await file.text()
  } else {
    const body = await req.json()
    csvText = body.csv ?? ''
  }

  if (!csvText.trim()) return new Response('Empty CSV', { status: 400 })
  const allRows = parseCsv(csvText)
  if (allRows.length === 0) return new Response('No rows found', { status: 400 })

  const dataRows = isHeaderRow(allRows[0]) ? allRows.slice(1) : allRows
  const result: ImportResult = { imported: 0, workoutsAffected: [], errors: [], warnings: [] }
  const parsed: CsvRow[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const lineIndex = isHeaderRow(allRows[0]) ? i + 2 : i + 1
    if (cells.length < 4) { result.errors.push({ line: lineIndex, message: `Expected 4 columns, got ${cells.length}` }); continue }
    const [wRaw, hRaw, lRaw, ...nameParts] = cells
    const workoutNumber = parseInt(wRaw), heatNumber = parseInt(hRaw), laneNumber = parseInt(lRaw)
    const athleteName = nameParts.join(',').trim()
    if (isNaN(workoutNumber) || isNaN(heatNumber) || isNaN(laneNumber)) {
      result.errors.push({ line: lineIndex, message: `Non-numeric value in workout/heat/lane columns: "${wRaw}", "${hRaw}", "${lRaw}"` }); continue
    }
    if (!athleteName) { result.errors.push({ line: lineIndex, message: 'Athlete name is empty' }); continue }
    parsed.push({ workoutNumber, heatNumber, laneNumber, athleteName, lineIndex })
  }

  if (parsed.length === 0) return Response.json({ ...result, message: 'No valid rows to import' })

  const [workouts, athletes] = await Promise.all([
    sql`SELECT id, number FROM "Workout"`,
    sql`SELECT id, name FROM "Athlete"`,
  ])

  const workoutByNumber = new Map((workouts as unknown as Array<{ id: number; number: number }>).map((w) => [w.number, w.id]))
  const athleteByName = new Map((athletes as unknown as Array<{ id: number; name: string }>).map((a) => [a.name.toLowerCase().trim(), a.id]))

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
    const seen = new Set<string>()

    for (const row of rows) {
      const athleteId = athleteByName.get(row.athleteName.toLowerCase().trim())
      if (!athleteId) { result.errors.push({ line: row.lineIndex, message: `Athlete not found: "${row.athleteName}"` }); continue }
      const key = `${workoutId}:${athleteId}`
      if (seen.has(key)) { result.errors.push({ line: row.lineIndex, message: `Duplicate athlete "${row.athleteName}" in workout #${workoutNumber}` }); continue }
      seen.add(key)
      assignments.push({ athleteId, heatNumber: row.heatNumber, lane: row.laneNumber })
    }

    if (assignments.length === 0) continue

    await sql`DELETE FROM "HeatAssignment" WHERE "workoutId" = ${workoutId}`
    await sql`
      INSERT INTO "HeatAssignment" ("workoutId", "athleteId", "heatNumber", lane)
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(assignments.map(a => ({ workoutId, ...a })))}::jsonb)
        AS t("workoutId" int, "athleteId" int, "heatNumber" int, lane int)
    `
    await sql`UPDATE "Workout" SET "heatStartOverrides" = '{}' WHERE id = ${workoutId}`

    result.imported += assignments.length
    result.workoutsAffected.push(workoutNumber)
  }

  return Response.json(result)
}
