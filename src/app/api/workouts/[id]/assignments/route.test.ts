import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST, PATCH } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

const req = (method = 'GET', body?: unknown) =>
  new Request(`http://test/api/workouts/1/assignments${url}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

describe('GET /api/workouts/[id]/assignments', () => {
  it('returns assignments ordered by heatNumber then lane', async () => {
    mock.queueResult({ data: { id: 1 }, error: null }) // requireWorkoutInCompetition
    const rows = [{ id: 1, heatNumber: 1, lane: 1, athlete: { id: 1, name: 'A' } }]
    mock.queueResult({ data: rows, error: null })
    const res = await GET(req(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
    const haCall = mock.calls.find((c) => c.table === 'HeatAssignment')!
    expect(haCall.ops.filter(o => o.op === 'order').map(o => o.args[0])).toEqual(['heatNumber', 'lane'])
  })
})

describe('POST /api/workouts/[id]/assignments', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(req('POST', {}), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult({ data: null, error: null }) // requireWorkoutInCompetition
    const res = await POST(req('POST', {}), params('99'))
    expect(res.status).toBe(404)
  })

  it('generates assignments and calls replace_workout_heat_assignments RPC', async () => {
    mock.queueResult({ data: { id: 1, lanes: 2, mixedHeats: true }, error: null }) // requireWorkoutInCompetition
    mock.queueResult({ data: [{ id: 10, divisionId: null, scores: [] }, { id: 11, divisionId: null, scores: [] }], error: null })
    mock.queueResult({ data: [], error: null })
    mock.queueResult({ data: null, error: null }) // RPC replace_workout_heat_assignments
    mock.queueResult({ data: [{ id: 1, heatNumber: 1, lane: 1 }, { id: 2, heatNumber: 1, lane: 2 }], error: null })

    const res = await POST(req('POST', {}), params('1'))
    expect(res.status).toBe(201)
    expect(Array.isArray(await res.json())).toBe(true)

    const rpcCall = mock.calls.find(c => c.table === 'rpc:replace_workout_heat_assignments')
    expect(rpcCall).toBeTruthy()
    const args = rpcCall!.ops[0].args[0] as { p_workout_id: number; p_assignments: unknown[] }
    expect(args.p_workout_id).toBe(1)
    expect(args.p_assignments).toHaveLength(2)
  })
})

describe('PATCH /api/workouts/[id]/assignments', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PATCH(req('PATCH', { id: 1, heatNumber: 1, lane: 1 }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when assignment not in caller competition', async () => {
    mock.queueResult({ data: null, error: null }) // existing lookup
    const res = await PATCH(req('PATCH', { id: 999, heatNumber: 1, lane: 1 }))
    expect(res.status).toBe(404)
  })

  it('updates assignment and returns fresh row with embed', async () => {
    mock.queueResult({ data: { id: 5 }, error: null }) // existing lookup
    mock.queueResult({ data: null, error: null })      // update
    mock.queueResult({ data: { id: 5, heatNumber: 2, lane: 3, athlete: { id: 1 } }, error: null })
    const res = await PATCH(req('PATCH', { id: 5, heatNumber: 2, lane: 3 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: 5, heatNumber: 2, lane: 3 })
    const updateCall = mock.calls.find((c) => c.ops.find((o) => o.op === 'update'))!
    expect(updateCall.ops.find(o => o.op === 'update')?.args[0]).toEqual({ heatNumber: 2, lane: 3 })
  })
})
