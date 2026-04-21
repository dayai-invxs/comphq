import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST } from './route'

describe('GET /api/workouts', () => {
  it('returns workouts ordered by number', async () => {
    const rows = [{ id: 1, number: 1, name: 'WOD 1' }]
    mock.queueResult({ data: rows, error: null })
    const res = await GET(new Request('http://test/api/workouts?slug=test'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
    expect(mock.lastCall!.table).toBe('Workout')
    expect(mock.lastCall!.ops.find(o => o.op === 'order')?.args[0]).toBe('number')
  })
})

describe('POST /api/workouts', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(new Request('http://test', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('inserts workout with defaults and returns 201', async () => {
    const created = { id: 1, number: 1, name: 'WOD 1', status: 'draft' }
    mock.queueResult({ data: created, error: null })
    const res = await POST(new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'test', number: 1, name: 'WOD 1', scoreType: 'time', lanes: 5,
        heatIntervalSecs: 300, callTimeSecs: 60, walkoutTimeSecs: 30,
      }),
    }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)
    const insert = mock.lastCall!.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({
      number: 1, name: 'WOD 1', scoreType: 'time', lanes: 5,
      timeBetweenHeatsSecs: 120, status: 'draft', mixedHeats: true,
      tiebreakEnabled: false, partBEnabled: false, partBScoreType: 'time',
    })
  })
})
