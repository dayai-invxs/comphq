import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
import { GET } from './route'

describe('GET /api/competitions/mine', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('super admin sees all comps with role=admin', async () => {
    mock.queueResult([
      { id: 1, name: 'A', slug: 'a' },
      { id: 2, name: 'B', slug: 'b' },
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      { id: 1, name: 'A', slug: 'a', role: 'admin' },
      { id: 2, name: 'B', slug: 'b', role: 'admin' },
    ])
  })

  it('non-super only sees comps where they are CompetitionAdmin', async () => {
    setAuthSuper(false)
    mock.queueResult([{ id: 1, name: 'Mine', slug: 'mine' }])

    const res = await GET()
    expect(res.status).toBe(200)
    // Non-super path uses an inner join against CompetitionAdmin.
    const joinCall = mock.calls.find((c) => c.method === 'innerJoin')
    expect(joinCall).toBeTruthy()
  })
})
