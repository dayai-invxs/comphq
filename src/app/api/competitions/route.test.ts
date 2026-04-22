import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
import { GET, POST } from './route'

const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/competitions', {
    method: 'POST',
    body: JSON.stringify(body),
  })

describe('GET /api/competitions', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('super admin sees all comps ordered by id', async () => {
    const rows = [
      { id: 1, name: 'A', slug: 'a' },
      { id: 2, name: 'B', slug: 'b' },
    ]
    mock.queueResult({ data: rows, error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('Competition')
    expect(call.ops.find((o) => o.op === 'order')?.args[0]).toBe('id')
  })

  it('non-super only sees comps where they are CompetitionAdmin', async () => {
    setAuthSuper(false)
    mock.queueResult({ data: [{ id: 1, name: 'Mine', slug: 'mine' }], error: null })

    const res = await GET()
    expect(res.status).toBe(200)

    const call = mock.lastCall!
    expect(call.table).toBe('Competition')
    // The inner join on CompetitionAdmin + eq on userId are the tenant filter.
    const select = call.ops.find((o) => o.op === 'select')!
    expect(select.args[0]).toContain('CompetitionAdmin!inner')
    const eqArgs = call.ops.filter((o) => o.op === 'eq').map((o) => o.args[0])
    expect(eqArgs).toContain('CompetitionAdmin.userId')
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
    // First result: insert competition. Second result: insert CompetitionAdmin.
    mock.queueResult({ data: created, error: null })
    mock.queueResult({ data: null, error: null })

    const res = await POST(postReq({ name: 'Rugged Rumble', slug: 'Rugged Rumble' }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    // Competition insert normalized slug.
    const [compCall, adminCall] = mock.calls
    expect(compCall.table).toBe('Competition')
    const compInsert = compCall.ops.find((o: { op: string }) => o.op === 'insert')!
    expect(compInsert.args[0]).toMatchObject({ name: 'Rugged Rumble', slug: 'rugged-rumble' })

    // Creator added as CompetitionAdmin of the newly created comp.
    expect(adminCall.table).toBe('CompetitionAdmin')
    const adminInsert = adminCall.ops.find((o: { op: string }) => o.op === 'insert')!
    expect(adminInsert.args[0]).toMatchObject({ userId: 'user-1', competitionId: 42 })
  })
})
