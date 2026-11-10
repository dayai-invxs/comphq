import { describe, expect, it } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (slug: string) => new Request(`http://test/api/schedule/equipment?slug=${slug}`)

describe('GET /api/schedule/equipment', () => {
  it('404s when the slug does not resolve', async () => {
    expect((await GET(req(''))).status).toBe(404)
  })

  it('is public and returns every workout\'s equipment in one read', async () => {
    setAuthUser(null)
    mock.queueResults(
      [{ id: 1, secret: false, status: 'active' }, { id: 2, secret: false, status: 'draft' }],
      [
        { id: 10, workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null },
        { id: 11, workoutId: 1, item: 'Rower', divisionId: 5, divisionName: 'RX' },
      ],
    )
    const res = await GET(req('default'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      byWorkout: {
        1: [
          { id: 10, item: 'Barbell', divisionId: null, division: null },
          { id: 11, item: 'Rower', divisionId: 5, division: { id: 5, name: 'RX' } },
        ],
        2: [],
      },
    })
  })

  it('leaves out a secret workout that is not active yet', async () => {
    mock.queueResults(
      [{ id: 1, secret: true, status: 'draft' }, { id: 2, secret: true, status: 'active' }],
      [{ id: 20, workoutId: 2, item: 'Sled', divisionId: null, divisionName: null }],
    )
    const body = await (await GET(req('default'))).json()
    expect(Object.keys(body.byWorkout)).toEqual(['2'])
  })

  it('skips the equipment read when every workout is still secret', async () => {
    mock.queueResults([{ id: 1, secret: true, status: 'draft' }])
    expect(await (await GET(req('default'))).json()).toEqual({ byWorkout: {} })
  })
})
