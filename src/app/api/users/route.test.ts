import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
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
    // 1. auth.admin.listUsers → two users with email
    mock.queueResult({
      data: {
        users: [
          { id: 'u1', email: 'super@t.local' },
          { id: 'u2', email: 'member@t.local' },
        ],
      },
      error: null,
    })
    // 2. UserProfile select — isSuper per user
    mock.queueResult({ data: [{ id: 'u1', isSuper: true }, { id: 'u2', isSuper: false }], error: null })
    // 3. CompetitionAdmin + Competition join
    mock.queueResult({
      data: [
        { userId: 'u2', competitionId: 1, Competition: { id: 1, name: 'Default', slug: 'default' } },
      ],
      error: null,
    })

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
    mock.queueResult({ data: { user: { id: 'new-uuid', email: 'new@t.local' } }, error: null })

    const res = await POST(req({ email: 'new@t.local', password: 'goodpassword12' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ id: 'new-uuid', email: 'new@t.local', isSuper: false })

    const createCall = mock.calls.find((c) => c.table === 'auth:createUser')
    expect(createCall).toBeTruthy()
    const args = createCall!.ops[0].args[0] as { email: string; password: string; email_confirm: boolean }
    expect(args.email).toBe('new@t.local')
    expect(args.email_confirm).toBe(true)
  })

  it('upserts UserProfile.isSuper=true when isSuper is requested', async () => {
    mock.queueResult({ data: { user: { id: 'super-uuid', email: 's@t.local' } }, error: null })
    mock.queueResult({ data: null, error: null }) // UserProfile upsert

    const res = await POST(req({ email: 's@t.local', password: 'goodpassword12', isSuper: true }))
    expect(res.status).toBe(201)
    const upsert = mock.calls.find((c) => c.table === 'UserProfile')
    expect(upsert).toBeTruthy()
  })

  it('grants CompetitionAdmin rows when competitionIds supplied', async () => {
    mock.queueResult({ data: { user: { id: 'comp-uuid', email: 'ca@t.local' } }, error: null })
    mock.queueResult({ data: null, error: null }) // CompetitionAdmin insert

    const res = await POST(req({
      email: 'ca@t.local', password: 'goodpassword12', competitionIds: [1, 2],
    }))
    expect(res.status).toBe(201)
    const ins = mock.calls.find((c) => c.table === 'CompetitionAdmin')
    expect(ins).toBeTruthy()
    const rows = ins!.ops.find((o) => o.op === 'insert')!.args[0] as unknown[]
    expect(rows).toHaveLength(2)
  })
})
