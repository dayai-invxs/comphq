import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { POST, DELETE } from './route'

const params = (id: string, heatNum: string) => ({ params: Promise.resolve({ id, heatNum }) })
const url = 'http://test/api/workouts/1/heats/1/complete?slug=default'

describe('POST /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await POST(new Request(url, { method: 'POST' }), params('99', '1'))
    expect(res.status).toBe(404)
  })

  it('upserts HeatCompletion, ranks, reports workout completed when all heats done', async () => {
    // 1. requireWorkoutInCompetition
    mock.queueResult({ data: { id: 1, status: 'active', scoreType: 'time', tiebreakEnabled: false, partBEnabled: false, partBScoreType: 'time' }, error: null })
    // 2. HeatCompletion upsert
    mock.queueResult({ data: null, error: null })
    // 3. getCompletedHeats internal query (async fn body runs first, awaits before Promise.all iterates)
    mock.queueResult({ data: [{ heatNumber: 1 }], error: null })
    // 4. Promise.all iteration — Score.select
    mock.queueResult({ data: [{ athleteId: 1, workoutId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null }], error: null })
    // 5. Promise.all iteration — HeatAssignment.select
    mock.queueResult({ data: [{ heatNumber: 1 }], error: null })
    // 6. rankAndPersist upsert
    mock.queueResult({ data: null, error: null })
    // 7. Workout status update
    mock.queueResult({ data: null, error: null })

    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completedHeats).toEqual([1])
    expect(body.workoutCompleted).toBe(true)

    // HeatCompletion upsert happened (idempotent insert)
    const upsert = mock.calls.find((c) => c.table === 'HeatCompletion' && c.ops.find((o) => o.op === 'upsert'))!
    expect(upsert.ops.find(o => o.op === 'upsert')?.args[0]).toEqual({ workoutId: 1, heatNumber: 1 })
    expect(upsert.ops.find(o => o.op === 'upsert')?.args[1]).toMatchObject({ onConflict: 'workoutId,heatNumber', ignoreDuplicates: true })

    // Workout status set to completed
    const workoutUpdate = mock.calls.find((c) => c.table === 'Workout' && c.ops.find((o) => o.op === 'update'))!
    expect(workoutUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({ status: 'completed' })
  })
})

describe('DELETE /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('removes HeatCompletion row, clears points, resets workout if was completed', async () => {
    // requireWorkoutInCompetition
    mock.queueResult({ data: { status: 'completed' }, error: null })
    // HeatCompletion delete
    mock.queueResult({ data: null, error: null })
    // HeatAssignment athletes
    mock.queueResult({ data: [{ athleteId: 5 }, { athleteId: 6 }], error: null })
    // Score points clear
    mock.queueResult({ data: null, error: null })
    // Workout status revert
    mock.queueResult({ data: null, error: null })
    // getCompletedHeats
    mock.queueResult({ data: [{ heatNumber: 2 }], error: null })

    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completedHeats).toEqual([2])

    const completionDelete = mock.calls.find((c) => c.table === 'HeatCompletion' && c.ops.find((o) => o.op === 'delete'))!
    expect(completionDelete).toBeDefined()
    const eqArgs = completionDelete.ops.filter(o => o.op === 'eq').map(o => o.args)
    expect(eqArgs).toEqual(expect.arrayContaining([
      ['workoutId', 1],
      ['heatNumber', 1],
    ]))

    const scoreUpdate = mock.calls.find(c => c.table === 'Score' && c.ops.find(o => o.op === 'update'))!
    expect(scoreUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({ points: null })
    expect(scoreUpdate.ops.find(o => o.op === 'in')?.args).toEqual(['athleteId', [5, 6]])

    const workoutUpdate = mock.calls.find((c) => c.table === 'Workout' && c.ops.find((o) => o.op === 'update'))!
    expect(workoutUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({ status: 'active' })
  })
})
