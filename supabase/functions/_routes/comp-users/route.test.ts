import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock, drizzleMock, setAuthUser } from '@/test/setup'
import { requireCompetitionAdmin } from '@/lib/auth-competition'
import { GET, POST } from './route'

const getReq = (slug = 'default') => new Request(`http://test/api/comp-users?slug=${slug}`)
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/comp-users', { method: 'POST', body: JSON.stringify(body) })

const validBody = { slug: 'default', email: 'new@test.local', password: 'correct-horse-battery', role: 'admin' }

describe('GET /api/comp-users', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  // These are the only routes in the app that use the stricter admin gate;
  // everywhere else a role='user' member can mutate. The distinction is
  // load-bearing, so it is asserted rather than assumed.
  it('gates on competition admin, not plain membership', async () => {
    drizzleMock.queueResult([])
    await GET(getReq())
    expect(vi.mocked(requireCompetitionAdmin)).toHaveBeenCalledWith('default')
  })

  it('404s when slug is missing', async () => {
    expect((await GET(getReq(''))).status).toBe(404)
  })

  it('returns an empty list when the competition has no members', async () => {
    drizzleMock.queueResult([])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('joins each membership row to its auth email', async () => {
    drizzleMock.queueResult([
      { userId: 'u1', role: 'admin' },
      { userId: 'u2', role: 'user' },
    ])
    mock.queueResults(
      { data: { user: { id: 'u1', email: 'one@test.local' } }, error: null },
      { data: { user: { id: 'u2', email: 'two@test.local' } }, error: null },
    )

    const res = await GET(getReq())
    expect(await res.json()).toEqual([
      { userId: 'u1', email: 'one@test.local', role: 'admin' },
      { userId: 'u2', email: 'two@test.local', role: 'user' },
    ])
  })

  // A membership row whose auth user has been deleted still lists, with a null
  // email, rather than dropping out or erroring.
  it('reports a null email when the auth lookup finds nothing', async () => {
    drizzleMock.queueResult([{ userId: 'u1', role: 'admin' }])
    mock.queueResult({ data: { user: null }, error: null })
    expect(await (await GET(getReq())).json())
      .toEqual([{ userId: 'u1', email: null, role: 'admin' }])
  })
})

describe('POST /api/comp-users', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(postReq(validBody))).status).toBe(401)
  })

  it('rejects a password shorter than 12 characters', async () => {
    const res = await POST(postReq({ ...validBody, password: 'short' }))
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/at least 12 characters/)
  })

  it('rejects a malformed email', async () => {
    expect((await POST(postReq({ ...validBody, email: 'not-an-email' }))).status).toBe(400)
  })

  it('rejects a role outside admin and user', async () => {
    expect((await POST(postReq({ ...validBody, role: 'super' }))).status).toBe(400)
  })

  it('creates the auth user, then upserts the membership', async () => {
    mock.queueResults(
      { data: { users: [] }, error: null },
      { data: { user: { id: 'u9' } }, error: null },
    )
    drizzleMock.queueResult([])

    const res = await POST(postReq(validBody))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ userId: 'u9', email: 'new@test.local', role: 'admin' })

    expect(mock.calls.map(c => c.table)).toEqual(['auth:listUsers', 'auth:createUser'])
    expect(drizzleMock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ userId: 'u9', competitionId: 1, role: 'admin' })
    expect(drizzleMock.calls.some(c => c.method === 'onConflictDoUpdate')).toBe(true)
  })

  // An existing account is reused rather than recreated, and the match is
  // case-insensitive on email.
  it('reuses an existing account instead of creating a second one', async () => {
    mock.queueResult({ data: { users: [{ id: 'u1', email: 'NEW@test.local' }] }, error: null })
    drizzleMock.queueResult([])

    const res = await POST(postReq(validBody))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ userId: 'u1', email: 'new@test.local', role: 'admin' })
    expect(mock.calls.map(c => c.table)).toEqual(['auth:listUsers'])
  })

  // The existing-user scan reads a single page of 1000; past that an existing
  // account is missed and creation is attempted instead.
  it('scans only the first page of 1000 auth users', async () => {
    mock.queueResults(
      { data: { users: [] }, error: null },
      { data: { user: { id: 'u9' } }, error: null },
    )
    drizzleMock.queueResult([])
    await POST(postReq(validBody))
    expect(mock.calls[0].ops[0].args[0]).toEqual({ page: 1, perPage: 1000 })
  })

  it('surfaces an auth creation error as 500', async () => {
    mock.queueResults(
      { data: { users: [] }, error: null },
      { data: null, error: { message: 'email rate limit' } },
    )
    const res = await POST(postReq(validBody))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('email rate limit')
  })

  it('500s when creation returns no id', async () => {
    mock.queueResults(
      { data: { users: [] }, error: null },
      { data: { user: null }, error: null },
    )
    const res = await POST(postReq(validBody))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('User creation returned no id')
  })
})
