import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { athlete, division, heatAssignment, workout, workoutEquipment } from '@/db/schema'
import { authErrorResponse, requireCompetitionAdmin } from '@/lib/auth-competition'

export type EquipmentSummaryItem = {
  item: string
  maxCount: number
  breakdown: {
    workoutId: number
    workoutNumber: number
    workoutName: string
    divisionNames: (string | null)[] // null = All Divisions
    maxCount: number
  }[]
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? ''

  try {
    const { competition } = await requireCompetitionAdmin(slug)

    const workouts = await db
      .select({ id: workout.id, number: workout.number, name: workout.name })
      .from(workout)
      .where(eq(workout.competitionId, competition.id))

    if (workouts.length === 0) return Response.json({ items: [] })

    const workoutIds = workouts.map((w) => w.id)
    const workoutMap = new Map(workouts.map((w) => [w.id, w]))

    const equipRows = await db
      .select({
        workoutId: workoutEquipment.workoutId,
        item: workoutEquipment.item,
        divisionId: workoutEquipment.divisionId,
        divisionName: division.name,
      })
      .from(workoutEquipment)
      .leftJoin(division, eq(division.id, workoutEquipment.divisionId))
      .where(inArray(workoutEquipment.workoutId, workoutIds))

    if (equipRows.length === 0) return Response.json({ items: [] })

    const assignments = await db
      .select({
        workoutId: heatAssignment.workoutId,
        heatNumber: heatAssignment.heatNumber,
        athleteId: heatAssignment.athleteId,
        divisionId: athlete.divisionId,
      })
      .from(heatAssignment)
      .innerJoin(athlete, eq(athlete.id, heatAssignment.athleteId))
      .where(inArray(heatAssignment.workoutId, workoutIds))

    // workoutId → heatNumber → Set<athleteId> per divisionId (null = all)
    // Build: workoutId → heatNumber → athletes[]
    type AthleteSlim = { athleteId: number; divisionId: number | null }
    const heatAthletes = new Map<string, AthleteSlim[]>()
    for (const a of assignments) {
      const key = `${a.workoutId}-${a.heatNumber}`
      if (!heatAthletes.has(key)) heatAthletes.set(key, [])
      heatAthletes.get(key)!.push({ athleteId: a.athleteId, divisionId: a.divisionId })
    }

    // Group equipment by (workoutId, itemName) → divisions[]
    type EquipGroup = { divisionId: number | null; divisionName: string | null }
    const equipGroups = new Map<string, EquipGroup[]>()
    for (const row of equipRows) {
      const key = `${row.workoutId}::${row.item}`
      if (!equipGroups.has(key)) equipGroups.set(key, [])
      equipGroups.get(key)!.push({ divisionId: row.divisionId, divisionName: row.divisionName ?? null })
    }

    // For each (workoutId, item) group, find max count across heats
    type WorkoutBreakdown = {
      workoutId: number
      workoutNumber: number
      workoutName: string
      divisionNames: (string | null)[]
      maxCount: number
    }

    const workoutBreakdowns = new Map<string, WorkoutBreakdown>() // keyed by `${workoutId}::${item}`

    for (const [groupKey, divGroups] of equipGroups) {
      const [workoutIdStr, item] = groupKey.split('::')
      const workoutId = Number(workoutIdStr)
      const wk = workoutMap.get(workoutId)!

      const hasAllDivisions = divGroups.some((g) => g.divisionId === null)
      const specificDivisionIds = new Set(divGroups.filter((g) => g.divisionId !== null).map((g) => g.divisionId!))

      // For each heat in this workout, count athletes who need this item
      const heatKeys = [...heatAthletes.keys()].filter((k) => k.startsWith(`${workoutId}-`))
      let maxCount = 0
      for (const heatKey of heatKeys) {
        const athletes = heatAthletes.get(heatKey)!
        const count = athletes.filter((a) =>
          hasAllDivisions || (a.divisionId !== null && specificDivisionIds.has(a.divisionId))
        ).length
        if (count > maxCount) maxCount = count
      }

      const divisionNames = divGroups.map((g) => g.divisionName)

      workoutBreakdowns.set(groupKey, {
        workoutId,
        workoutNumber: wk.number,
        workoutName: wk.name,
        divisionNames,
        maxCount,
      })
    }

    // Roll up by item name: max across workouts
    const summary = new Map<string, EquipmentSummaryItem>()
    for (const [groupKey, bd] of workoutBreakdowns) {
      const item = groupKey.split('::').slice(1).join('::') // handles '::' in item name
      if (!summary.has(item)) {
        summary.set(item, { item, maxCount: 0, breakdown: [] })
      }
      const entry = summary.get(item)!
      entry.breakdown.push(bd)
      if (bd.maxCount > entry.maxCount) entry.maxCount = bd.maxCount
    }

    const items = [...summary.values()].sort((a, b) => a.item.localeCompare(b.item))

    return Response.json({ items })
  } catch (e) {
    return authErrorResponse(e)
  }
}
