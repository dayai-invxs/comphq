import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST } from './route'

const getReq = () => new Request('http://test/api/divisions?slug=default')
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/divisions', {
    method: 'POST',
    body: JSON.stringify({ slug: 'default', ...body }),
  })

describe('GET /api/divisions', () => {
  it('returns divisions ordered by order', async () => {
    const rows = [
      { id: 1, name: 'Rx', order: 0 },
      { id: 2, name: 'Scaled', order: 1 },
    ]
    mock.queueResult({ data: rows, error: null })

    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('Division')
    expect(call.ops.find(o => o.op === 'order')?.args[0]).toBe('order')
  })
})

describe('POST /api/divisions', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(postReq({ name: 'X', order: 0 }))
    expect(res.status).toBe(401)
  })

  it('rejects empty name', async () => {
    const res = await POST(postReq({ name: ' ', order: 0 }))
    expect(res.status).toBe(400)
  })

  it('inserts and returns 201', async () => {
    const created = { id: 1, name: 'Rx', order: 0 }
    mock.queueResult({ data: created, error: null })
    const res = await POST(postReq({ name: 'Rx', order: '0' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    const call = mock.lastCall!
    expect(call.table).toBe('Division')
    const insert = call.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ name: 'Rx', order: 0 })
    expect(call.ops.find(o => o.op === 'single')).toBeTruthy()
  })

  it('makes an individual division with no gender requirement by default', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await POST(postReq({ name: 'Rx', order: 0 }))
    const insert = mock.lastCall!.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ teamSize: 1, menCount: null, womenCount: null })
  })

  it('saves a team division\'s size and gender split', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await POST(postReq({ name: 'Team', order: 1, teamSize: 4, menCount: 2, womenCount: 2 }))
    const insert = mock.lastCall!.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ teamSize: 4, menCount: 2, womenCount: 2 })
  })

  it('rejects a team size below 1', async () => {
    const res = await POST(postReq({ name: 'Team', order: 1, teamSize: 0 }))
    expect(res.status).toBe(400)
  })
})
