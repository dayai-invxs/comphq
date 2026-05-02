import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { heatAssignment, judgeAssignment, volunteer, volunteerRole, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAccess, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { JudgeAssignmentGenerate } from '@/lib/schemas'

function scheduleJudges(
  heatNumbers: number[],
  judgeIds: number[],
  lanes: number,
  maxConsecutive: number,
): { volunteerId: number; heatNumber: number; lane: number }[] {
  if (judgeIds.length === 0 || heatNumbers.length === 0) return []

  const consecutive = new Map(judgeIds.map(id => [id, 0]))
  const totalAssigned = new Map(judgeIds.map(id => [id, 0]))
  const result: { volunteerId: number; heatNumber: number; lane: number }[] = []

  for (const heatNumber of heatNumbers) {
    let available = judgeIds.filter(id => (consecutive.get(id) ?? 0) < maxConsecutive)

    // If no one is available (all need a break simultaneously), reset everyone
    if (available.length === 0) {
      judgeIds.forEach(id => consecutive.set(id, 0))
      available = [...judgeIds]
    }

    available.sort((a, b) => (totalAssigned.get(a) ?? 0) - (totalAssigned.get(b) ?? 0))

    const assignedThisHeat = new Set<number>()
    for (let lane = 1; lane <= lanes; lane++) {
      const judge = available.find(id => !assignedThisHeat.has(id))
      if (!judge) break
      result.push({ volunteerId: judge, heatNumber, lane })
      assignedThisHeat.add(judge)
      consecutive.set(judge, (consecutive.get(judge) ?? 0) + 1)
      totalAssigned.set(judge, (totalAssigned.get(judge) ?? 0) + 1)
    }

    for (const id of judgeIds) {
      if (!assignedThisHeat.has(id)) consecutive.set(id, 0)
    }
  }

  return result
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  try {
    const { competition } = await requireCompetitionAccess(slug)
    const workoutId = Number((await params).id)
    const wk = await requireWorkoutInCompetition<{ id: number; lanes: number }>(workoutId, competition.id)

    const parsed = await parseJson(req, JudgeAssignmentGenerate)
    if (!parsed.ok) return parsed.response
    const { maxConsecutive } = parsed.data

    // Get judges for this competition (volunteers with a role named "judge", case-insensitive)
    const judges = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .innerJoin(volunteerRole, eq(volunteerRole.id, volunteer.roleId))
      .where(eq(volunteer.competitionId, competition.id))

    // Filter client-side for "judge" role name (case-insensitive)
    // Re-query with name filter
    const judgeRows = await db
      .select({ id: volunteer.id, roleName: volunteerRole.name })
      .from(volunteer)
      .innerJoin(volunteerRole, eq(volunteerRole.id, volunteer.roleId))
      .where(eq(volunteer.competitionId, competition.id))

    const judgeIds = judgeRows
      .filter(r => r.roleName.toLowerCase() === 'judge')
      .map(r => r.id)

    void judges // unused, using judgeRows instead

    // Get distinct heat numbers from athlete assignments
    const heatRows = await db
      .select({ heatNumber: heatAssignment.heatNumber })
      .from(heatAssignment)
      .where(eq(heatAssignment.workoutId, workoutId))
      .orderBy(asc(heatAssignment.heatNumber))

    const heatNumbers = [...new Set(heatRows.map(r => r.heatNumber))].sort((a, b) => a - b)

    if (judgeIds.length === 0) return new Response('No judges found. Add volunteers with a "Judge" role first.', { status: 422 })
    if (heatNumbers.length === 0) return new Response('No heats found. Generate athlete assignments first.', { status: 422 })

    const newAssignments = scheduleJudges(heatNumbers, judgeIds, wk.lanes, maxConsecutive)

    // Replace existing assignments for this workout
    await db.delete(judgeAssignment).where(eq(judgeAssignment.workoutId, workoutId))
    if (newAssignments.length > 0) {
      await db.insert(judgeAssignment).values(newAssignments.map(a => ({ ...a, workoutId })))
    }

    // Return full list with judge names
    const result = await db
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

    return Response.json(result, { status: 201 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
