import { describe, it, expect } from 'vitest'
import { drizzleMock, supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

const url = (path = '/api/athletes') => `http://test${path}?slug=default`
const getReq = () => new Request(url())
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/athletes', {
    method: 'POST',
    body: JSON.stringify({ slug: 'default', ...body }),
  })
const deleteReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/athletes', {
    method: 'DELETE',
    body: JSON.stringify({ slug: 'default', ...body }),
  })

describe('GET /api/athletes', () => {
  it('returns athletes with division ordered by name', async () => {
    const rows = [
      { id: 1, name: 'Alice', bibNumber: null, divisionId: 1, division: { id: 1, name: 'Rx', order: 0 } },
      { id: 2, name: 'Bob', bibNumber: '42', divisionId: null, division: null },
    ]
    mock.queueResult({ data: rows, error: null })

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows.map((r) => ({ ...r, members: [] })))

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    expect(call.ops.find(o => o.op === 'select')).toBeTruthy()
    expect(call.ops.find(o => o.op === 'order')?.args[0]).toBe('name')
  })
})

describe('POST /api/athletes', () => {
  it('rejects unauthenticated requests', async () => {
    setAuthUser(null)
    const res = await POST(postReq({ name: 'X' }))
    expect(res.status).toBe(401)
  })

  it('rejects empty name', async () => {
    const res = await POST(postReq({ name: '  ' }))
    expect(res.status).toBe(400)
  })

  it('inserts athlete and returns 201 with division joined', async () => {
    const inserted = { id: 5, name: 'New', bibNumber: null, divisionId: 1, division: { id: 1, name: 'Rx', order: 0 } }
    mock.queueResult({ data: inserted, error: null })

    const res = await POST(postReq({ name: 'New', divisionId: 1 }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ...inserted, members: [] })

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    const insert = call.ops.find(o => o.op === 'insert')
    expect(insert?.args[0]).toMatchObject({ name: 'New', divisionId: 1 })
    expect(call.ops.find(o => o.op === 'single')).toBeTruthy()
  })

  it('saves an individual\'s gender', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await POST(postReq({ name: 'Jane', gender: 'female' }))
    const insert = mock.lastCall!.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ gender: 'female' })
  })

  it('rejects a gender that is not male or female', async () => {
    const res = await POST(postReq({ name: 'Jane', gender: 'x' }))
    expect(res.status).toBe(400)
  })

  it('creates a team with its members, in the order given', async () => {
    mock.queueResult({ data: { id: 9, name: 'Team A', members: [] }, error: null })
    drizzleMock.queueResults(undefined, [{ id: 1, name: 'Kami', gender: 'female', order: 0 }, { id: 2, name: 'Lee', gender: null, order: 1 }])

    const res = await POST(postReq({ name: 'Team A', members: [{ name: ' Kami ', gender: 'female' }, { name: 'Lee' }] }))

    expect(res.status).toBe(201)
    expect((await res.json()).members).toEqual([
      { id: 1, name: 'Kami', gender: 'female', order: 0 },
      { id: 2, name: 'Lee', gender: null, order: 1 },
    ])
    const values = drizzleMock.calls.find(c => c.method === 'values')!.args[0]
    expect(values).toEqual([
      { athleteId: 9, name: 'Kami', gender: 'female', order: 0, externalId: null },
      { athleteId: 9, name: 'Lee', gender: null, order: 1, externalId: null },
    ])
  })

  // A team nobody has filled in yet still competes.
  it('creates a team with no members without writing any', async () => {
    mock.queueResult({ data: { id: 9, name: 'Team A', members: [] }, error: null })

    const res = await POST(postReq({ name: 'Team A', members: [] }))

    expect(res.status).toBe(201)
    expect((await res.json()).members).toEqual([])
    expect(drizzleMock.calls).toEqual([])
  })

  it('returns members in the order they were listed', async () => {
    mock.queueResult({ data: [{ id: 1, name: 'T', members: [{ id: 5, name: 'B', order: 1 }, { id: 4, name: 'A', order: 0 }] }], error: null })

    const res = await GET(getReq())

    expect((await res.json())[0].members.map((m: { name: string }) => m.name)).toEqual(['A', 'B'])
  })

  it('trims whitespace from name and bibNumber', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await POST(postReq({ name: '  Jane  ', bibNumber: '  99  ' }))
    const insert = mock.lastCall!.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ name: 'Jane', bibNumber: '99' })
  })
})

describe('DELETE /api/athletes', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(deleteReq({ ids: [1] }))
    expect(res.status).toBe(401)
  })

  it('rejects empty ids', async () => {
    const res = await DELETE(deleteReq({ ids: [] }))
    expect(res.status).toBe(400)
  })

  it('deletes athletes and returns count', async () => {
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    const res = await DELETE(deleteReq({ ids: [1, 2] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(call.ops.find(o => o.op === 'in')?.args).toEqual(['id', [1, 2]])
  })
})
