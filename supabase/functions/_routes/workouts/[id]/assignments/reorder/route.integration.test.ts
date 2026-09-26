import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Integration coverage for the `reorder_workout_assignments` RPC and the
 * DEFERRABLE UNIQUE(workoutId, heatNumber, lane) constraint added in
 * migration 20260423000000. Uses the service-role client — bypasses RLS —
 * because the goal here is to prove the DB-level guarantees, not the HTTP
 * auth layer (that is covered by route.test.ts).
 *
 * Each test seeds its own comp + workout + athletes + assignments so the
 * suite is reentrant and can run against a shared DB.
 */

const URL = process.env.SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_KEY!

let admin: SupabaseClient
let compId: number
let workoutId: number
let athleteIds: number[] = []
let assignmentIds: number[] = []

async function seed() {
  const ts = Date.now()
  const { data: comp } = await admin
    .from('Competition')
    .insert({ name: `reorder-${ts}`, slug: `reorder-${ts}` })
    .select('id').single()
  compId = (comp as { id: number }).id

  const { data: wk } = await admin
    .from('Workout')
    .insert({
      competitionId: compId,
      number: 1,
      name: 'Reorder IT',
      scoreType: 'time',
      lanes: 4,
      heatIntervalSecs: 300,
      callTimeSecs: 60,
      walkoutTimeSecs: 30,
    })
    .select('id').single()
  workoutId = (wk as { id: number }).id

  const athleteRows = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) =>
      admin.from('Athlete').insert({ competitionId: compId, name: `R${n}` }).select('id').single()
    ),
  )
  athleteIds = athleteRows.map((r) => (r.data as { id: number }).id)

  // Heat 1: athletes 0,1,2 in lanes 1,2,3. Heat 2: athletes 3,4,5 in lanes 1,2,3.
  const rows = [
    { workoutId, athleteId: athleteIds[0], heatNumber: 1, lane: 1 },
    { workoutId, athleteId: athleteIds[1], heatNumber: 1, lane: 2 },
    { workoutId, athleteId: athleteIds[2], heatNumber: 1, lane: 3 },
    { workoutId, athleteId: athleteIds[3], heatNumber: 2, lane: 1 },
    { workoutId, athleteId: athleteIds[4], heatNumber: 2, lane: 2 },
    { workoutId, athleteId: athleteIds[5], heatNumber: 2, lane: 3 },
  ]
  const { data: ins } = await admin
    .from('HeatAssignment')
    .insert(rows)
    .select('id, athleteId, heatNumber, lane')
    .order('heatNumber').order('lane')
  assignmentIds = (ins ?? []).map((r) => (r as { id: number }).id)
}

async function currentState() {
  const { data } = await admin
    .from('HeatAssignment')
    .select('id, heatNumber, lane')
    .eq('workoutId', workoutId)
    .order('heatNumber').order('lane')
  return data as Array<{ id: number; heatNumber: number; lane: number }>
}

beforeAll(async () => {
  if (!URL || !SERVICE) throw new Error('Integration test requires SUPABASE_URL + SUPABASE_SERVICE_KEY')
  admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  await seed()
})

afterAll(async () => {
  if (compId) await admin.from('Competition').delete().eq('id', compId)
})

describe('reorder_workout_assignments RPC', () => {
  it('applies a cross-heat move atomically, end state lanes contiguous 1..N', async () => {
    // Move assignmentIds[0] (heat1 lane1) to heat 2 index 0.
    // Source heat1 (ids[1], ids[2]) compacts to lanes 1,2.
    // Dest heat2 (ids[0], ids[3], ids[4], ids[5]) lanes 1,2,3,4.
    const updates = [
      { id: assignmentIds[0], heatNumber: 2, lane: 1 },
      { id: assignmentIds[1], heatNumber: 1, lane: 1 },
      { id: assignmentIds[2], heatNumber: 1, lane: 2 },
      { id: assignmentIds[3], heatNumber: 2, lane: 2 },
      { id: assignmentIds[4], heatNumber: 2, lane: 3 },
      { id: assignmentIds[5], heatNumber: 2, lane: 4 },
    ]
    const { error } = await admin.rpc('reorder_workout_assignments', {
      p_workout_id: workoutId,
      p_updates: updates,
    })
    expect(error).toBeNull()

    const after = await currentState()
    const byHeat = new Map<number, number[]>()
    for (const r of after) {
      const list = byHeat.get(r.heatNumber) ?? []
      list.push(r.lane)
      byHeat.set(r.heatNumber, list)
    }
    for (const [, lanes] of byHeat) {
      const sorted = [...lanes].sort((a, b) => a - b)
      expect(sorted).toEqual(sorted.map((_, i) => i + 1))
    }
  })

  it('unique constraint rejects a same-transaction duplicate (heat, lane)', async () => {
    // Try to set two rows to the same (heat, lane). Transaction must fail.
    const updates = [
      { id: assignmentIds[1], heatNumber: 1, lane: 1 },
      { id: assignmentIds[2], heatNumber: 1, lane: 1 }, // collide
    ]
    const { error } = await admin.rpc('reorder_workout_assignments', {
      p_workout_id: workoutId,
      p_updates: updates,
    })
    // Postgres reports 23505 on unique constraint violation. Exposed as error.code.
    expect(error).not.toBeNull()
    expect((error as unknown as { code?: string })?.code).toBe('23505')
  })

  it('DEFERRABLE constraint allows a mid-transaction swap', async () => {
    // Swap heat1/lane1 with heat1/lane2 atomically. If the constraint
    // weren't DEFERRABLE this would fail on the first UPDATE statement.
    const state = await currentState()
    const h1 = state.filter((r) => r.heatNumber === 1).sort((a, b) => a.lane - b.lane)
    if (h1.length < 2) throw new Error('expected at least 2 rows in heat 1 for swap test')

    const updates = [
      { id: h1[0].id, heatNumber: 1, lane: h1[1].lane },
      { id: h1[1].id, heatNumber: 1, lane: h1[0].lane },
    ]
    const { error } = await admin.rpc('reorder_workout_assignments', {
      p_workout_id: workoutId,
      p_updates: updates,
    })
    expect(error).toBeNull()

    const after = await currentState()
    const lanes = after.filter((r) => r.heatNumber === 1).map((r) => r.lane).sort((a, b) => a - b)
    // Still contiguous — and no duplicates.
    expect(lanes).toEqual(lanes.map((_, i) => i + 1))
  })
})
