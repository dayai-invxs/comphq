import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/workouts/[id]', () => {
  it('returns workout with assignments and scores', async () => {
    mock.queueResult({ data: { id: 1, name: 'WOD 1' }, error: null })
    mock.queueResult({ data: [{ id: 10, heatNumber: 1, lane: 1, athlete: { id: 1 } }], error: null })
    mock.queueResult({ data: [{ id: 20, athleteId: 1, rawScore: 100, athlete: { id: 1 } }], error: null })

    const res = await GET(new Request('http://test'), params('1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(1)
    expect(body.assignments).toHaveLength(1)
    expect(body.scores).toHaveLength(1)
  })

  it('returns 404 when not found', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await GET(new Request('http://test'), params('999'))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/workouts/[id]', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PUT(new Request('http://test', { method: 'PUT', body: JSON.stringify({ name: 'X' }) }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects empty patch', async () => {
    const res = await PUT(new Request('http://test', { method: 'PUT', body: '{}' }), params('1'))
    expect(res.status).toBe(400)
  })

  it('updates provided fields only', async () => {
    mock.queueResult({ data: { id: 1, name: 'New' }, error: null })
    await PUT(
      new Request('http://test', { method: 'PUT', body: JSON.stringify({ name: 'New', status: 'active' }) }),
      params('1'),
    )
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    expect(update.args[0]).toEqual({ name: 'New', status: 'active' })
    expect(mock.lastCall!.ops.find(o => o.op === 'eq')?.args).toEqual(['id', 1])
  })
})

describe('DELETE /api/workouts/[id]', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await DELETE(new Request('http://test'), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(new Request('http://test'), params('1'))
    expect(res.status).toBe(204)
    expect(mock.lastCall!.ops.find(o => o.op === 'delete')).toBeTruthy()
  })
})
