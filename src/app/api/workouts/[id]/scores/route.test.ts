import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/workouts/[id]/scores', () => {
  it('returns scores with athlete embedded for workout', async () => {
    const rows = [{ id: 1, athleteId: 1, workoutId: 1, rawScore: 100, athlete: { id: 1, name: 'A' } }]
    mock.queueResult({ data: rows, error: null })
    const res = await GET(new Request('http://test'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
    expect(mock.lastCall!.table).toBe('Score')
    expect(mock.lastCall!.ops.find(o => o.op === 'eq')?.args).toEqual(['workoutId', 1])
  })
})

describe('POST /api/workouts/[id]/scores', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(new Request('http://test', { method: 'POST', body: '{}' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('upserts score with onConflict athleteId,workoutId', async () => {
    mock.queueResult({ data: { id: 1, athleteId: 2, workoutId: 1, rawScore: 95 }, error: null })
    await POST(
      new Request('http://test', { method: 'POST', body: JSON.stringify({ athleteId: 2, rawScore: 95 }) }),
      params('1'),
    )
    const call = mock.lastCall!
    expect(call.table).toBe('Score')
    const upsert = call.ops.find(o => o.op === 'upsert')!
    expect(upsert.args[0]).toMatchObject({ athleteId: 2, workoutId: 1, rawScore: 95, points: null })
    expect(upsert.args[1]).toMatchObject({ onConflict: 'athleteId,workoutId' })
  })
})

describe('DELETE /api/workouts/[id]/scores', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await DELETE(new Request('http://test'), params('1'))
    expect(res.status).toBe(401)
  })

  it('deletes all scores for workout and resets status', async () => {
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(new Request('http://test'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
    expect(mock.calls[0].table).toBe('Score')
    expect(mock.calls[0].ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(mock.calls[1].table).toBe('Workout')
    expect(mock.calls[1].ops.find(o => o.op === 'update')?.args[0]).toEqual({ status: 'active' })
  })
})
