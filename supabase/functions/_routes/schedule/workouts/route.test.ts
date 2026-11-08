import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (slug: string) => new Request(`http://test/api/schedule/workouts?slug=${slug}`)

describe('GET /api/schedule/workouts', () => {
  it('is public and returns each workout with its description', async () => {
    setAuthUser(null)
    const rows = [
      { id: 1, number: 1, name: 'Fran', description: '21-15-9\nThrusters, pull-ups', status: 'completed' },
      { id: 2, number: 2, name: 'Grace', description: null, status: 'active' },
    ]
    mock.queueResult(rows)
    const res = await GET(req('default'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
  })

  it('filters out drafts', async () => {
    mock.queueResult([])
    await GET(req('default'))
    expect(mock.calls.some((c) => c.method === 'where')).toBe(true)
  })
})
