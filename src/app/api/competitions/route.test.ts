import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
import { GET, POST } from './route'

const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/competitions', {
    method: 'POST',
    body: JSON.stringify(body),
  })

describe('GET /api/competitions', () => {
  it('is public — unauthenticated users see the full list', async () => {
    setAuthUser(null)
    const rows = [
      { id: 1, name: 'A', slug: 'a' },
      { id: 2, name: 'B', slug: 'b' },
    ]
    mock.queueResult(rows)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
  })

  it('returns the same public list to super admins (no scoping)', async () => {
    const rows = [{ id: 1, name: 'A', slug: 'a' }]
    mock.queueResult(rows)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
  })
})

describe('POST /api/competitions', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(postReq({ name: 'Test', slug: 'test' }))
    expect(res.status).toBe(401)
  })

  it('rejects non-super users', async () => {
    setAuthSuper(false)
    const res = await POST(postReq({ name: 'Test', slug: 'test' }))
    expect(res.status).toBe(403)
  })

  it('rejects empty body', async () => {
    const res = await POST(postReq({}))
    expect(res.status).toBe(400)
  })

  it('rejects invalid slug (starts with dash)', async () => {
    const res = await POST(postReq({ name: 'Test', slug: '-bad' }))
    expect(res.status).toBe(400)
  })

  it('creates comp, normalizes slug, and grants creator admin', async () => {
    const created = { id: 42, name: 'Rugged Rumble', slug: 'rugged-rumble' }
    // First returning() → competition row; second insert (no returning) → empty.
    mock.queueResult([created])
    mock.queueResult(undefined)

    const res = await POST(postReq({ name: 'Rugged Rumble', slug: 'Rugged Rumble' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    // Two inserts fired: Competition, then CompetitionAdmin.
    const inserts = mock.calls.filter((c) => c.method === 'insert')
    expect(inserts).toHaveLength(2)

    // The competition insert's values should have the normalized slug.
    // `.values` records the payload as args[0].
    const valuesCalls = mock.calls.filter((c) => c.method === 'values')
    expect(valuesCalls[0].args[0]).toMatchObject({ name: 'Rugged Rumble', slug: 'rugged-rumble' })
    expect(valuesCalls[1].args[0]).toMatchObject({ userId: 'user-1', competitionId: 42 })
  })
})
