import { describe, it, expect } from 'vitest'
import { drizzleMock as dmock, supabaseMock as smock, setAuthUser, setAuthSuper } from '@/test/setup'
import { GET, POST } from './route'

function req(body?: unknown) {
  return new Request('http://test/api/users', {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/users (super-admin only)', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('rejects non-super user', async () => {
    setAuthSuper(false)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns list merging auth email, UserProfile.isSuper, and CompetitionAdmin rows', async () => {
    // 1. auth.admin.listUsers → two users (still on supabase-js)
    smock.queueResult({
      data: { users: [{ id: 'u1', email: 'super@t.local' }, { id: 'u2', email: 'member@t.local' }] },
      error: null,
    })
    // 2. UserProfile select → isSuper per user (Drizzle)
    dmock.queueResult([{ id: 'u1', isSuper: true }, { id: 'u2', isSuper: false }])
    // 3. CompetitionAdmin ⨝ Competition (Drizzle)
    dmock.queueResult([
      { userId: 'u2', competitionId: 1, name: 'Default', slug: 'default' },
    ])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({ id: 'u1', email: 'super@t.local', isSuper: true, competitions: [] })
    expect(body[1]).toMatchObject({ id: 'u2', email: 'member@t.local', isSuper: false })
    expect(body[1].competitions).toEqual([{ id: 1, name: 'Default', slug: 'default' }])
  })
})

describe('POST /api/users', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(req({ email: 'x@x.com', password: 'xxxxxxxxxxxx' }))
    expect(res.status).toBe(401)
  })

  it('rejects non-super', async () => {
    setAuthSuper(false)
    const res = await POST(req({ email: 'x@x.com', password: 'xxxxxxxxxxxx' }))
    expect(res.status).toBe(403)
  })

  it('rejects weak passwords (<12 chars)', async () => {
    const res = await POST(req({ email: 'x@x.com', password: 'short' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing email', async () => {
    const res = await POST(req({ password: 'secretpassword12' }))
    expect(res.status).toBe(400)
  })

  it('creates user with email_confirm: true and returns id/email/isSuper', async () => {
    smock.queueResult({ data: { user: { id: 'new-uuid', email: 'new@t.local' } }, error: null })

    const res = await POST(req({ email: 'new@t.local', password: 'goodpassword12' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ id: 'new-uuid', email: 'new@t.local', isSuper: false })
  })

  it('upserts UserProfile.isSuper=true when isSuper is requested', async () => {
    smock.queueResult({ data: { user: { id: 'super-uuid', email: 's@t.local' } }, error: null })
    dmock.queueResult(undefined) // Drizzle upsert

    const res = await POST(req({ email: 's@t.local', password: 'goodpassword12', isSuper: true }))
    expect(res.status).toBe(201)
    // The UserProfile upsert's values payload carries isSuper=true.
    const valuesCall = dmock.calls.find(
      (c) => c.method === 'values' && (c.args[0] as { isSuper?: boolean }).isSuper === true,
    )
    expect(valuesCall).toBeTruthy()
  })

  it('grants CompetitionAdmin rows when competitionIds supplied', async () => {
    smock.queueResult({ data: { user: { id: 'comp-uuid', email: 'ca@t.local' } }, error: null })
    dmock.queueResult(undefined) // CompetitionAdmin insert

    const res = await POST(req({
      email: 'ca@t.local', password: 'goodpassword12', competitionIds: [1, 2],
    }))
    expect(res.status).toBe(201)
    const valuesCall = dmock.calls.find((c) => c.method === 'values' && Array.isArray(c.args[0]))
    expect(valuesCall).toBeTruthy()
    expect((valuesCall!.args[0] as unknown[])).toHaveLength(2)
  })
})
