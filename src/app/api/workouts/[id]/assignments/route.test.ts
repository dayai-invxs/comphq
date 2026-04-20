import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST, PATCH } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/workouts/[id]/assignments', () => {
  it('returns assignments ordered by heatNumber then lane', async () => {
    const rows = [{ id: 1, heatNumber: 1, lane: 1, athlete: { id: 1, name: 'A' } }]
    mock.queueResult({ data: rows, error: null })
    const res = await GET(new Request('http://test'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
    expect(mock.lastCall!.table).toBe('HeatAssignment')
    expect(mock.lastCall!.ops.filter(o => o.op === 'order').map(o => o.args[0])).toEqual(['heatNumber', 'lane'])
  })
})

describe('POST /api/workouts/[id]/assignments', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(new Request('http://test', { method: 'POST', body: '{}' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not found', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await POST(new Request('http://test', { method: 'POST', body: '{}' }), params('99'))
    expect(res.status).toBe(404)
  })

  it('generates assignments, deletes old, inserts new, and returns 201', async () => {
    mock.queueResult({ data: { id: 1, lanes: 2, mixedHeats: true }, error: null })
    mock.queueResult({ data: [{ id: 10, divisionId: null, scores: [] }, { id: 11, divisionId: null, scores: [] }], error: null })
    mock.queueResult({ data: [], error: null })
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: [{ id: 1, heatNumber: 1, lane: 1 }, { id: 2, heatNumber: 1, lane: 2 }], error: null })

    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({}) }), params('1'))
    expect(res.status).toBe(201)
    expect(Array.isArray(await res.json())).toBe(true)

    const deleteCall = mock.calls.find(c => c.table === 'HeatAssignment' && c.ops.find(o => o.op === 'delete'))
    expect(deleteCall).toBeTruthy()
    const insertCall = mock.calls.find(c => c.table === 'HeatAssignment' && c.ops.find(o => o.op === 'insert'))
    expect(insertCall).toBeTruthy()
    const override = mock.calls.find(c => c.table === 'Workout' && c.ops.find(o => o.op === 'update'))
    expect((override!.ops.find(o => o.op === 'update')!.args[0] as Record<string, unknown>).heatStartOverrides).toBe('{}')
  })
})

describe('PATCH /api/workouts/[id]/assignments', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PATCH(new Request('http://test', { method: 'PATCH', body: JSON.stringify({ id: 1, heatNumber: 1, lane: 1 }) }))
    expect(res.status).toBe(401)
  })

  it('updates assignment and returns fresh row with embed', async () => {
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: { id: 5, heatNumber: 2, lane: 3, athlete: { id: 1 } }, error: null })
    const res = await PATCH(new Request('http://test', { method: 'PATCH', body: JSON.stringify({ id: 5, heatNumber: 2, lane: 3 }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: 5, heatNumber: 2, lane: 3 })
    const update = mock.calls[0].ops.find(o => o.op === 'update')!
    expect(update.args[0]).toEqual({ heatNumber: 2, lane: 3 })
  })
})
