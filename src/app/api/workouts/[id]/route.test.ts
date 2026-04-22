import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

const getReq = () => new Request(`http://test/api/workouts/1${url}`)
const putReq = (body: Record<string, unknown>) =>
  new Request(`http://test/api/workouts/1${url}`, { method: 'PUT', body: JSON.stringify(body) })
const deleteReq = () => new Request(`http://test/api/workouts/1${url}`)

describe('GET /api/workouts/[id]', () => {
  it('returns workout with assignments, scores, and completedHeats', async () => {
    // 1. requireWorkoutInCompetition
    mock.queueResult({ data: { id: 1, name: 'WOD 1' }, error: null })
    // 2. getCompletedHeats internal (async fn runs first in Promise.all)
    mock.queueResult({ data: [{ heatNumber: 1 }], error: null })
    // 3. HeatAssignment
    mock.queueResult({ data: [{ id: 10, heatNumber: 1, lane: 1, athlete: { id: 1 } }], error: null })
    // 4. Score
    mock.queueResult({ data: [{ id: 20, athleteId: 1, rawScore: 100, athlete: { id: 1 } }], error: null })

    const res = await GET(getReq(), params('1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(1)
    expect(body.assignments).toHaveLength(1)
    expect(body.scores).toHaveLength(1)
    expect(body.completedHeats).toEqual([1])
  })

  it('returns 404 when not found in caller competition', async () => {
    mock.queueResult({ data: null, error: null }) // requireWorkoutInCompetition → 404
    const res = await GET(getReq(), params('999'))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/workouts/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PUT(putReq({ name: 'X' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects empty patch', async () => {
    const res = await PUT(putReq({}), params('1'))
    expect(res.status).toBe(400)
  })

  it('updates provided fields only', async () => {
    mock.queueResult({ data: { id: 1, name: 'New' }, error: null })
    await PUT(putReq({ name: 'New', status: 'active' }), params('1'))
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    expect(update.args[0]).toEqual({ name: 'New', status: 'active' })
    const eqArgs = mock.lastCall!.ops.filter(o => o.op === 'eq').map(o => o.args[0])
    expect(eqArgs).toContain('id')
    expect(eqArgs).toContain('competitionId')
  })

  it('nulls all partBRawScore / partBPoints when partBEnabled flips off', async () => {
    mock.queueResult({ data: { id: 1, partBEnabled: false }, error: null })
    mock.queueResult({ data: null, error: null })
    await PUT(putReq({ partBEnabled: false }), params('1'))

    const scoreUpdate = mock.calls.find((c) => c.table === 'Score' && c.ops.find((o) => o.op === 'update'))!
    expect(scoreUpdate).toBeDefined()
    expect(scoreUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({
      partBRawScore: null,
      partBPoints: null,
    })
    expect(scoreUpdate.ops.find(o => o.op === 'eq')?.args).toEqual(['workoutId', 1])
  })

  it('does not touch Score when partBEnabled flips on (true)', async () => {
    mock.queueResult({ data: { id: 1, partBEnabled: true }, error: null })
    await PUT(putReq({ partBEnabled: true }), params('1'))
    const scoreUpdate = mock.calls.find((c) => c.table === 'Score')
    expect(scoreUpdate).toBeUndefined()
  })
})

describe('DELETE /api/workouts/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(204)
    expect(mock.lastCall!.ops.find(o => o.op === 'delete')).toBeTruthy()
    const eqArgs = mock.lastCall!.ops.filter(o => o.op === 'eq').map(o => o.args[0])
    expect(eqArgs).toContain('id')
    expect(eqArgs).toContain('competitionId')
  })
})
