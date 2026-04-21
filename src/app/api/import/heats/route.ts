import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireCompetitionMember } from '@/lib/auth-competition'

interface CsvRow {
  workoutNumber: number; heatNumber: number; laneNumber: number; athleteName: string; lineIndex: number
}
interface ImportResult {
  imported: number
  workoutsAffected: number[]
  errors: { line: number; message: string }[]
  warnings: { message: string }[]
}

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

  let csvText: string
  let slug = ''
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return new Response('No file provided', { status: 400 })
      csvText = await file.text()
      slug = (form.get('slug') as string) ?? ''
    } else {
      const body = await req.json()
      csvText = body.csv ?? ''
      slug = body.slug ?? ''
    }

    const { competition } = await requireCompetitionMember(session, slug, 'admin')
    return await runImport(csvText, competition.id)
  } catch (e) {
    return authErrorResponse(e)
  }
}

async function runImport(csvText: string, competitionId: number): Promise<Response> {

  if (!csvText.trim()) return new Response('Empty CSV', { status: 400 })
  const allRows = parseCsv(csvText)
  if (allRows.length === 0) return new Response('No rows found', { status: 400 })

  const headerPresent = isHeaderRow(allRows[0])
  const dataRows = headerPresent ? allRows.slice(1) : allRows
  const result: ImportResult = { imported: 0, workoutsAffected: [], errors: [], warnings: [] }
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
    if (!athleteName) {
      result.errors.push({ line: lineIndex, message: 'Athlete name is empty' })
      continue
    }
    parsed.push({ workoutNumber, heatNumber, laneNumber, athleteName, lineIndex })
  }

  if (parsed.length === 0) return Response.json({ ...result, message: 'No valid rows to import' })

  const [workoutsRes, athletesRes] = await Promise.all([
    supabase.from('Workout').select('id, number').eq('competitionId', competitionId),
    supabase.from('Athlete').select('id, name').eq('competitionId', competitionId),
  ])

  const workoutByNumber = new Map(
    ((workoutsRes.data ?? []) as Array<{ id: number; number: number }>).map((w) => [w.number, w.id]),
  )
  const athleteByName = new Map(
    ((athletesRes.data ?? []) as Array<{ id: number; name: string }>).map((a) => [a.name.toLowerCase().trim(), a.id]),
  )

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

    const assignments: { workoutId: number; athleteId: number; heatNumber: number; lane: number }[] = []
    const seen = new Set<string>()

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
      assignments.push({ workoutId, athleteId, heatNumber: row.heatNumber, lane: row.laneNumber })
    }

    if (assignments.length === 0) continue

    await supabase.from('HeatAssignment').delete().eq('workoutId', workoutId)
    const { error: ierr } = await supabase.from('HeatAssignment').insert(assignments)
    if (ierr) {
      result.errors.push({ line: rows[0].lineIndex, message: `Insert failed: ${ierr.message}` })
      continue
    }
    await supabase.from('Workout').update({ heatStartOverrides: '{}' }).eq('id', workoutId)

    result.imported += assignments.length
    result.workoutsAffected.push(workoutNumber)
  }

  return Response.json(result)
}
