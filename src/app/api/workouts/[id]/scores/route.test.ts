import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

const req = (method = 'GET', body?: unknown) =>
  new Request(`http://test/api/workouts/1/scores${url}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

describe('GET /api/workouts/[id]/scores', () => {
  it('returns scores with athlete embedded for workout', async () => {
    mock.queueResult({ data: { id: 1 }, error: null }) // requireWorkoutInCompetition
    const rows = [{ id: 1, athleteId: 1, workoutId: 1, rawScore: 100, athlete: { id: 1, name: 'A' } }]
    mock.queueResult({ data: rows, error: null })
    const res = await GET(req(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
    const scoreCall = mock.calls.find((c) => c.table === 'Score')!
    expect(scoreCall.ops.find(o => o.op === 'eq')?.args).toEqual(['workoutId', 1])
  })
})

describe('POST /api/workouts/[id]/scores', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(req('POST', {}), params('1'))
    expect(res.status).toBe(401)
  })

  it('upserts score with onConflict athleteId,workoutId', async () => {
    mock.queueResult({ data: { id: 1 }, error: null }) // requireWorkoutInCompetition
    mock.queueResult({ data: { id: 1, athleteId: 2, workoutId: 1, rawScore: 95 }, error: null })
    await POST(req('POST', { athleteId: 2, rawScore: 95 }), params('1'))
    const scoreCall = mock.calls.find((c) => c.table === 'Score')!
    const upsert = scoreCall.ops.find(o => o.op === 'upsert')!
    expect(upsert.args[0]).toMatchObject({ athleteId: 2, workoutId: 1, rawScore: 95, points: null })
    expect(upsert.args[1]).toMatchObject({ onConflict: 'athleteId,workoutId' })
  })
})

describe('DELETE /api/workouts/[id]/scores', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await DELETE(req('DELETE'), params('1'))
    expect(res.status).toBe(401)
  })

  it('deletes all scores for workout and resets status', async () => {
    mock.queueResult({ data: { id: 1 }, error: null }) // requireWorkoutInCompetition
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(req('DELETE'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
    const scoreDelete = mock.calls.find((c) => c.table === 'Score' && c.ops.find(o => o.op === 'delete'))!
    expect(scoreDelete).toBeDefined()
    const workoutUpdate = mock.calls.find((c) => c.table === 'Workout' && c.ops.find(o => o.op === 'update'))!
    expect(workoutUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({ status: 'active' })
  })
})
