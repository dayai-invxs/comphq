import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { judgeAssignment, volunteer, workout } from '@/db/schema'
import { requireCompetitionAccess } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { parseCsv } from '@/lib/csv'
import { CsvImport } from '@/lib/schemas'

interface ImportResult {
  imported: number
  workoutsAffected: number[]
  errors: { line: number; message: string }[]
}

export async function POST(req: Request) {
  const parsed = await parseJson(req, CsvImport)
  if (!parsed.ok) return Response.json({ imported: 0, workoutsAffected: [], errors: [{ line: 0, message: await parsed.response.text() }] } satisfies ImportResult, { status: 400 })

  try {
    const { competition } = await requireCompetitionAccess(parsed.data.slug)

    // Load all workouts for this competition
    const workouts = await db
      .select({ id: workout.id, number: workout.number })
      .from(workout)
      .where(eq(workout.competitionId, competition.id))
    const workoutByNumber = new Map(workouts.map(w => [w.number, w.id]))

    // Load all volunteers for this competition (any role or none)
    const judgeRows = await db
      .select({ id: volunteer.id, name: volunteer.name })
      .from(volunteer)
      .where(eq(volunteer.competitionId, competition.id))
    const judgeByName = new Map(judgeRows.map(j => [j.name.toLowerCase().trim(), j.id]))

    const errors: { line: number; message: string }[] = []
    const toInsert: { workoutId: number; volunteerId: number; heatNumber: number; lane: number }[] = []
    const workoutsAffected = new Set<number>()

    const rows = parseCsv(parsed.data.csv)
    const hasHeader = rows[0]?.join(',').toLowerCase().includes('workout') ?? false
    const dataRows = hasHeader ? rows.slice(1) : rows

    for (let i = 0; i < dataRows.length; i++) {
      const lineNum = i + (hasHeader ? 2 : 1)
      const cells = dataRows[i]

      if (cells.length < 4) {
        errors.push({ line: lineNum, message: `Expected 4 columns (workout, heat, lane, judge_name), got ${cells.length}` })
        continue
      }

      const [workoutRaw, heatRaw, laneRaw, ...nameParts] = cells
      const judgeName = nameParts.join(',').trim()
      const workoutNumber = parseInt(workoutRaw, 10)
      const heatNumber = parseInt(heatRaw, 10)
      const lane = parseInt(laneRaw, 10)

      if (isNaN(workoutNumber) || isNaN(heatNumber) || isNaN(lane)) {
        errors.push({ line: lineNum, message: `Invalid numbers in: "${cells.join(',')}"` })
        continue
      }

      const workoutId = workoutByNumber.get(workoutNumber)
      if (!workoutId) {
        errors.push({ line: lineNum, message: `Workout #${workoutNumber} not found` })
        continue
      }

      if (!judgeName) continue

      const judgeId = judgeByName.get(judgeName.toLowerCase())
      if (!judgeId) {
        errors.push({ line: lineNum, message: `Judge not found: "${judgeName}"` })
        continue
      }

      toInsert.push({ workoutId, volunteerId: judgeId, heatNumber, lane })
      workoutsAffected.add(workoutNumber)
    }

    // Bad rows are reported and skipped; the good ones still land (COM-114).
    if (toInsert.length > 0) {
      await db.transaction(async (tx) => {
        // Rows apply in file order. Each first clears whatever holds its lane
        // or its judge in that heat, so neither unique constraint trips and a
        // later row for the same slot replaces an earlier one:
        // (workoutId, heatNumber, lane) OR (workoutId, heatNumber, volunteerId)
        for (const row of toInsert) {
          await tx.delete(judgeAssignment).where(
            and(
              eq(judgeAssignment.workoutId, row.workoutId),
              eq(judgeAssignment.heatNumber, row.heatNumber),
              or(
                eq(judgeAssignment.lane, row.lane),
                eq(judgeAssignment.volunteerId, row.volunteerId),
              ),
            ),
          )
          await tx.insert(judgeAssignment).values(row)
        }
      })
    }

    return Response.json({
      imported: toInsert.length,
      workoutsAffected: [...workoutsAffected].sort((a, b) => a - b),
      errors,
    } satisfies ImportResult)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = (e as { status?: number }).status ?? 500
    return Response.json({ imported: 0, workoutsAffected: [], errors: [{ line: 0, message: msg }] } satisfies ImportResult, { status })
  }
}
