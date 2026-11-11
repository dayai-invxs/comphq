import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { judgeAssignment, volunteer, volunteerRole } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { JudgeAssignmentCreate, JudgeAssignmentBulkDelete, JudgeAssignmentImport } from '@/lib/schemas'

async function fetchAssignments(workoutId: number) {
  const rows = await db
    .select({
      id: judgeAssignment.id,
      workoutId: judgeAssignment.workoutId,
      volunteerId: judgeAssignment.volunteerId,
      heatNumber: judgeAssignment.heatNumber,
      lane: judgeAssignment.lane,
      judgeName: volunteer.name,
    })
    .from(judgeAssignment)
    .innerJoin(volunteer, eq(volunteer.id, judgeAssignment.volunteerId))
    .where(eq(judgeAssignment.workoutId, workoutId))
    .orderBy(asc(judgeAssignment.heatNumber), asc(judgeAssignment.lane))
  return rows
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAccess(slug)
    const workoutId = Number((await params).id)
    await requireWorkoutInCompetition(workoutId, competition.id)
    return Response.json(await fetchAssignments(workoutId))
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') ?? ''
  const action = url.searchParams.get('action')

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const workoutId = Number((await params).id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    if (action === 'import') {
      const parsed = await parseJson(req, JudgeAssignmentImport)
      if (!parsed.ok) return parsed.response

      // Resolve judge names to volunteer IDs
      const judges = await db
        .select({ id: volunteer.id, name: volunteer.name })
        .from(volunteer)
        .innerJoin(volunteerRole, eq(volunteerRole.id, volunteer.roleId))
        .where(eq(volunteer.competitionId, competition.id))

      const judgeMap = new Map(judges.map(j => [j.name.toLowerCase().trim(), j.id]))
      const toInsert: { workoutId: number; volunteerId: number; heatNumber: number; lane: number }[] = []
      const errors: string[] = []

      for (const line of parsed.data.lines) {
        const judgeId = judgeMap.get(line.judgeName.toLowerCase().trim())
        if (!judgeId) {
          errors.push(`Judge not found: "${line.judgeName}"`)
          continue
        }
        toInsert.push({ workoutId, volunteerId: judgeId, heatNumber: line.heatNumber, lane: line.lane })
      }

      if (errors.length > 0) return new Response(errors.join('\n'), { status: 422 })
      if (toInsert.length === 0) return new Response('No valid rows', { status: 400 })

      await db.insert(judgeAssignment).values(toInsert).onConflictDoNothing()
      return Response.json(await fetchAssignments(workoutId), { status: 201 })
    }

    // Single assignment
    const parsed = await parseJson(req, JudgeAssignmentCreate)
    if (!parsed.ok) return parsed.response

    const [row] = await db
      .insert(judgeAssignment)
      .values({ workoutId, ...parsed.data })
      .onConflictDoUpdate({
        target: [judgeAssignment.workoutId, judgeAssignment.heatNumber, judgeAssignment.lane],
        set: { volunteerId: parsed.data.volunteerId },
      })
      .returning()

    return Response.json(row, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const workoutId = Number((await params).id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    // No body at all is the "clear every judge for this workout" button. A
    // body that is there but unreadable is a mistake and is refused: it used
    // to count as no body, so a typo in the payload wiped the board.
    const text = await req.text()
    if (!text.trim()) {
      await db.delete(judgeAssignment).where(eq(judgeAssignment.workoutId, workoutId))
      return Response.json({ deleted: 'all' })
    }
    let body: unknown
    try { body = JSON.parse(text) } catch { return new Response('Invalid JSON body', { status: 400 }) }
    const parsed = JudgeAssignmentBulkDelete.safeParse(body)
    if (!parsed.success) return new Response('Validation failed: ids must be a list of assignment ids', { status: 400 })

    // Only this workout's rows: an id from another workout, or another
    // competition, is not this caller's to remove.
    const removed = await db.delete(judgeAssignment).where(and(
      inArray(judgeAssignment.id, parsed.data.ids),
      eq(judgeAssignment.workoutId, workoutId),
    )).returning({ id: judgeAssignment.id })
    return Response.json({ deleted: removed.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}
