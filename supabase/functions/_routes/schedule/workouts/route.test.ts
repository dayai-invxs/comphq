import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (slug: string) => new Request(`http://test/api/schedule/workouts?slug=${slug}`)

describe('GET /api/schedule/workouts', () => {
  it('is public and returns each workout with its description', async () => {
    setAuthUser(null)
    const rows = [
      { id: 1, number: 1, name: 'Fran', description: '21-15-9\nThrusters, pull-ups', status: 'completed', secret: false },
      { id: 2, number: 2, name: 'Grace', description: null, status: 'active', secret: true },
    ]
    mock.queueResult(rows)
    const res = await GET(req('default'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows.map(({ secret: _, ...w }) => ({ ...w, tba: false })))
  })

  it('sends a secret workout that is not active yet as only its number, named TBA', async () => {
    mock.queueResult([
      { id: 4, number: 4, name: 'The Surprise', description: 'Row 2k', status: 'draft', secret: true },
    ])
    const res = await GET(req('default'))
    expect(await res.json()).toEqual([
      { id: 4, number: 4, name: 'TBA', description: null, status: 'draft', tba: true },
    ])
  })
})
