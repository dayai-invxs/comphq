import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { judgeAssignment, volunteer, volunteerRole, workout } from '@/db/schema'
import { requireCompetitionAdmin } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
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
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)

    // Load all workouts for this competition
    const workouts = await db
      .select({ id: workout.id, number: workout.number })
      .from(workout)
      .where(eq(workout.competitionId, competition.id))
    const workoutByNumber = new Map(workouts.map(w => [w.number, w.id]))

    // Load all judges (volunteers with Judge role)
    const judgeRows = await db
      .select({ id: volunteer.id, name: volunteer.name, roleName: volunteerRole.name })
      .from(volunteer)
      .innerJoin(volunteerRole, eq(volunteerRole.id, volunteer.roleId))
      .where(eq(volunteer.competitionId, competition.id))
    const judges = judgeRows.filter(r => r.roleName.toLowerCase() === 'judge')
    const judgeByName = new Map(judges.map(j => [j.name.toLowerCase().trim(), j.id]))

    const errors: { line: number; message: string }[] = []
    const toInsert: { workoutId: number; volunteerId: number; heatNumber: number; lane: number }[] = []
    const workoutsAffected = new Set<number>()

    const lines = parsed.data.csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const dataLines = lines[0]?.toLowerCase().includes('workout') ? lines.slice(1) : lines

    for (let i = 0; i < dataLines.length; i++) {
      const lineNum = i + (lines.length !== dataLines.length ? 2 : 1)
      const cells = dataLines[i].split(',').map(c => c.trim())

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
        errors.push({ line: lineNum, message: `Invalid numbers in: "${dataLines[i]}"` })
        continue
      }

      const workoutId = workoutByNumber.get(workoutNumber)
      if (!workoutId) {
        errors.push({ line: lineNum, message: `Workout #${workoutNumber} not found` })
        continue
      }

      const judgeId = judgeByName.get(judgeName.toLowerCase())
      if (!judgeId) {
        errors.push({ line: lineNum, message: `Judge not found: "${judgeName}"` })
        continue
      }

      toInsert.push({ workoutId, volunteerId: judgeId, heatNumber, lane })
      workoutsAffected.add(workoutNumber)
    }

    if (errors.length > 0) {
      return Response.json({ imported: 0, workoutsAffected: [], errors } satisfies ImportResult)
    }

    if (toInsert.length > 0) {
      await db.insert(judgeAssignment).values(toInsert).onConflictDoUpdate({
        target: [judgeAssignment.workoutId, judgeAssignment.heatNumber, judgeAssignment.lane],
        set: { volunteerId: sql`excluded."volunteerId"` },
      })
    }

    return Response.json({
      imported: toInsert.length,
      workoutsAffected: [...workoutsAffected].sort((a, b) => a - b),
      errors: [],
    } satisfies ImportResult)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = (e as { status?: number }).status ?? 500
    return Response.json({ imported: 0, workoutsAffected: [], errors: [{ line: 0, message: msg }] } satisfies ImportResult, { status })
  }
}
