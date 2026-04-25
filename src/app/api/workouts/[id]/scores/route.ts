import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete as athleteTable, score, workout } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin, requireWorkoutInCompetition } from '@/lib/auth-competition'
import { parseJson } from '@/lib/parseJson'
import { ScoreUpsert, ScorePointsOverride } from '@/lib/schemas'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const rows = await db
      .select({
        id: score.id,
        athleteId: score.athleteId,
        workoutId: score.workoutId,
        rawScore: score.rawScore,
        tiebreakRawScore: score.tiebreakRawScore,
        points: score.points,
        partBRawScore: score.partBRawScore,
        partBPoints: score.partBPoints,
        athleteName: athleteTable.name,
        bibNumber: athleteTable.bibNumber,
        divisionId: athleteTable.divisionId,
      })
      .from(score)
      .innerJoin(athleteTable, eq(athleteTable.id, score.athleteId))
      .where(eq(score.workoutId, workoutId))

    return Response.json(rows.map((r) => ({
      id: r.id,
      athleteId: r.athleteId,
      workoutId: r.workoutId,
      rawScore: r.rawScore,
      tiebreakRawScore: r.tiebreakRawScore,
      points: r.points,
      partBRawScore: r.partBRawScore,
      partBPoints: r.partBPoints,
      athlete: { id: r.athleteId, name: r.athleteName, bibNumber: r.bibNumber, divisionId: r.divisionId },
    })))
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''
  const parsed = await parseJson(req, ScoreUpsert)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const [row] = await db
      .insert(score)
      .values({
        athleteId: parsed.data.athleteId,
        workoutId,
        rawScore: parsed.data.rawScore,
        tiebreakRawScore: parsed.data.tiebreakRawScore ?? null,
        points: null,
        partBRawScore: parsed.data.partBRawScore ?? null,
        partBPoints: null,
      })
      .onConflictDoUpdate({
        target: [score.athleteId, score.workoutId],
        set: {
          rawScore: sql`excluded."rawScore"`,
          tiebreakRawScore: sql`excluded."tiebreakRawScore"`,
          points: sql`NULL`,
          partBRawScore: sql`excluded."partBRawScore"`,
          partBPoints: sql`NULL`,
        },
      })
      .returning()

    return Response.json(row)
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    const deleted = await db
      .delete(score)
      .where(eq(score.workoutId, workoutId))
      .returning({ id: score.id })

    await db
      .update(workout)
      .set({ status: 'active' })
      .where(and(eq(workout.id, workoutId), eq(workout.status, 'completed')))

    return Response.json({ deleted: deleted.length })
  } catch (e) {
    return authErrorResponse(e)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseJson(req, ScorePointsOverride)
  if (!parsed.ok) return parsed.response

  try {
    const { competition } = await requireCompetitionAdmin(parsed.data.slug)
    const { id } = await params
    const workoutId = Number(id)
    await requireWorkoutInCompetition(workoutId, competition.id)

    await db
      .update(score)
      .set({ points: parsed.data.points })
      .where(and(eq(score.athleteId, parsed.data.athleteId), eq(score.workoutId, workoutId)))

    return new Response(null, { status: 204 })
  } catch (e) {
    return authErrorResponse(e)
  }
}
