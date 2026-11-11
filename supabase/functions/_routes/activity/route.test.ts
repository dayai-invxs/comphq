import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (query = 'slug=default') => new Request(`http://test/api/activity?${query}`)

describe('GET /api/activity', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('answers the trail newest first, with the names to describe it', async () => {
    const entry = { id: 5, at: '2026-11-11T15:00:00Z', who: 'sam@example.test', action: 'POST /workouts/:id/scores', resourceId: '3', diff: { body: { athleteId: 4, rawScore: 95 } } }
    mock.queueResults([entry], [{ id: 3, number: 1, name: 'Fran', scoreType: 'time' }], [{ id: 4, name: 'Ada' }])
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entries: [entry],
      workouts: [{ id: 3, number: 1, name: 'Fran', scoreType: 'time' }],
      athletes: [{ id: 4, name: 'Ada' }],
    })
    expect(mock.calls.some((c) => c.method === 'orderBy')).toBe(true)
  })

  it('reads at most a thousand entries, two hundred unless asked', async () => {
    await GET(req('slug=default&limit=50000'))
    await GET(req('slug=default&limit=nope'))
    const limits = mock.calls.filter((c) => c.method === 'limit').map((c) => c.args[0])
    expect(limits).toContain(1000)
    expect(limits).toContain(200)
  })
})
