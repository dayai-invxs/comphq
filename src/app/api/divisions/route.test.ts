import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST } from './route'

describe('GET /api/divisions', () => {
  it('returns divisions ordered by order', async () => {
    const rows = [
      { id: 1, name: 'Rx', order: 0 },
      { id: 2, name: 'Scaled', order: 1 },
    ]
    mock.queueResult({ data: rows, error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('Division')
    expect(call.ops.find(o => o.op === 'order')?.args[0]).toBe('order')
  })
})

describe('POST /api/divisions', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(new Request('http://test/api/divisions', { method: 'POST', body: JSON.stringify({ name: 'X', order: 0 }) }))
    expect(res.status).toBe(401)
  })

  it('rejects empty name', async () => {
    const res = await POST(new Request('http://test/api/divisions', { method: 'POST', body: JSON.stringify({ name: ' ', order: 0 }) }))
    expect(res.status).toBe(400)
  })

  it('inserts and returns 201', async () => {
    const created = { id: 1, name: 'Rx', order: 0 }
    mock.queueResult({ data: created, error: null })
    const res = await POST(new Request('http://test/api/divisions', { method: 'POST', body: JSON.stringify({ name: 'Rx', order: '0' }) }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    const call = mock.lastCall!
    expect(call.table).toBe('Division')
    const insert = call.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ name: 'Rx', order: 0 })
    expect(call.ops.find(o => o.op === 'single')).toBeTruthy()
  })
})
