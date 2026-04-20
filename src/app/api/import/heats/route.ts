import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface CsvRow {
  workoutNumber: number
  heatNumber: number
  laneNumber: number
  athleteName: string
  lineIndex: number
}

interface ImportResult {
  imported: number
  workoutsAffected: number[]
  errors: { line: number; message: string }[]
  warnings: { message: string }[]
}

// Minimal CSV parser: handles quoted fields, trims whitespace
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const cells: string[] = []
    let cur = ''
    let inQuote = false
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
  const lower = cells.map((c) => c.toLowerCase())
  return lower.some((c) => ['workout', 'heat', 'lane', 'athlete'].includes(c))
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

  // Strip header row if present
  const dataRows = isHeaderRow(allRows[0]) ? allRows.slice(1) : allRows

  const result: ImportResult = { imported: 0, workoutsAffected: [], errors: [], warnings: [] }

  // Parse rows into typed objects
  const parsed: CsvRow[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const lineIndex = isHeaderRow(allRows[0]) ? i + 2 : i + 1 // 1-based line number

    if (cells.length < 4) {
      result.errors.push({ line: lineIndex, message: `Expected 4 columns, got ${cells.length}` })
      continue
    }

    const [wRaw, hRaw, lRaw, ...nameParts] = cells
    const workoutNumber = parseInt(wRaw)
    const heatNumber = parseInt(hRaw)
    const laneNumber = parseInt(lRaw)
    const athleteName = nameParts.join(',').trim() // rejoin if name had commas

    if (isNaN(workoutNumber) || isNaN(heatNumber) || isNaN(laneNumber)) {
      result.errors.push({ line: lineIndex, message: `Non-numeric value in workout/heat/lane columns: "${wRaw}", "${hRaw}", "${lRaw}"` })
      continue
    }
    if (!athleteName) {
      result.errors.push({ line: lineIndex, message: 'Athlete name is empty' })
      continue
    }

    parsed.push({ workoutNumber, heatNumber, laneNumber, athleteName, lineIndex })
  }

  if (parsed.length === 0) {
    return Response.json({ ...result, message: 'No valid rows to import' })
  }

  // Fetch all workouts and athletes once
  const workouts = await prisma.workout.findMany({ select: { id: true, number: true } })
  const athletes = await prisma.athlete.findMany({ select: { id: true, name: true } })

  const workoutByNumber = new Map(workouts.map((w) => [w.number, w.id]))
  // Name → id map, case-insensitive
  const athleteByName = new Map(athletes.map((a) => [a.name.toLowerCase().trim(), a.id]))

  // Group rows by workout number
  const byWorkout = new Map<number, CsvRow[]>()
  for (const row of parsed) {
    if (!byWorkout.has(row.workoutNumber)) byWorkout.set(row.workoutNumber, [])
    byWorkout.get(row.workoutNumber)!.push(row)
  }

  // Process each workout
  for (const [workoutNumber, rows] of byWorkout) {
    const workoutId = workoutByNumber.get(workoutNumber)
    if (!workoutId) {
      for (const row of rows) {
        result.errors.push({ line: row.lineIndex, message: `Workout #${workoutNumber} not found` })
      }
      continue
    }

    const assignments: { athleteId: number; heatNumber: number; lane: number }[] = []
    const seen = new Set<string>() // track duplicate athlete-in-workout

    for (const row of rows) {
      const athleteId = athleteByName.get(row.athleteName.toLowerCase().trim())
      if (!athleteId) {
        result.errors.push({ line: row.lineIndex, message: `Athlete not found: "${row.athleteName}"` })
        continue
      }
      const key = `${workoutId}:${athleteId}`
      if (seen.has(key)) {
        result.errors.push({ line: row.lineIndex, message: `Duplicate athlete "${row.athleteName}" in workout #${workoutNumber}` })
        continue
      }
      seen.add(key)
      assignments.push({ athleteId, heatNumber: row.heatNumber, lane: row.laneNumber })
    }

    if (assignments.length === 0) continue

    // Overwrite existing assignments for this workout
    await prisma.$transaction([
      prisma.heatAssignment.deleteMany({ where: { workoutId } }),
      prisma.heatAssignment.createMany({
        data: assignments.map((a) => ({ workoutId, ...a })),
      }),
      // Reset heat time overrides since heat structure changed
      prisma.workout.update({ where: { id: workoutId }, data: { heatStartOverrides: '{}' } }),
    ])

    result.imported += assignments.length
    result.workoutsAffected.push(workoutNumber)
  }

  return Response.json(result)
}
