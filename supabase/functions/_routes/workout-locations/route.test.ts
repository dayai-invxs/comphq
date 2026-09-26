import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST } from './route'

const getReq = (slug = 'default') => new Request(`http://test/api/workout-locations?slug=${slug}`)
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/workout-locations', { method: 'POST', body: JSON.stringify(body) })

describe('GET /api/workout-locations', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('404s when slug is missing', async () => {
    expect((await GET(getReq(''))).status).toBe(404)
  })

  it('returns locations scoped to the competition, ordered by name', async () => {
    const rows = [{ id: 1, name: 'Floor A' }, { id: 2, name: 'Rig' }]
    mock.queueResult({ data: rows, error: null })

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('WorkoutLocation')
    expect(call.ops.find(o => o.op === 'select')?.args[0]).toBe('id, name')
    expect(call.ops.find(o => o.op === 'eq')?.args).toEqual(['competitionId', 1])
    expect(call.ops.find(o => o.op === 'order')?.args[0]).toBe('name')
  })

  it('coalesces a null data payload to an empty array', async () => {
    mock.queueResult({ data: null, error: null })
    expect(await (await GET(getReq())).json()).toEqual([])
  })

  it('surfaces a query error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'boom' } })
    expect((await GET(getReq())).status).toBe(500)
  })
})

describe('POST /api/workout-locations', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(postReq({ slug: 'default', name: 'Floor A' }))).status).toBe(401)
  })

  it('rejects a name longer than 80 characters', async () => {
    expect((await POST(postReq({ slug: 'default', name: 'x'.repeat(81) }))).status).toBe(400)
  })

  it('inserts against the resolved competition and returns 201', async () => {
    const created = { id: 4, name: 'Floor A' }
    mock.queueResult({ data: created, error: null })

    const res = await POST(postReq({ slug: 'default', name: 'Floor A' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    const call = mock.lastCall!
    expect(call.table).toBe('WorkoutLocation')
    expect(call.ops.find(o => o.op === 'insert')!.args[0]).toEqual({ competitionId: 1, name: 'Floor A' })
    expect(call.ops.find(o => o.op === 'single')).toBeTruthy()
  })

  it('surfaces an insert error as 500', async () => {
    mock.queueResult({ data: null, error: { message: 'duplicate key' } })
    expect((await POST(postReq({ slug: 'default', name: 'Floor A' }))).status).toBe(500)
  })
})
