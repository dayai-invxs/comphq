import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { GET, POST, DELETE } from './route'

describe('GET /api/athletes', () => {
  it('returns athletes with division ordered by name', async () => {
    const rows = [
      { id: 1, name: 'Alice', bibNumber: null, divisionId: 1, division: { id: 1, name: 'Rx', order: 0 } },
      { id: 2, name: 'Bob', bibNumber: '42', divisionId: null, division: null },
    ]
    mock.queueResult({ data: rows, error: null })

    const res = await GET(new Request('http://test/api/athletes?slug=test'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    expect(call.ops.find(o => o.op === 'select')).toBeTruthy()
    expect(call.ops.find(o => o.op === 'order')?.args[0]).toBe('name')
  })
})

describe('POST /api/athletes', () => {
  it('rejects unauthenticated requests', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(new Request('http://test/api/athletes', { method: 'POST', body: JSON.stringify({ name: 'X' }) }))
    expect(res.status).toBe(401)
  })

  it('rejects empty name', async () => {
    const res = await POST(new Request('http://test/api/athletes', { method: 'POST', body: JSON.stringify({ slug: 'test', name: '  ' }) }))
    expect(res.status).toBe(400)
  })

  it('inserts athlete and returns 201 with division joined', async () => {
    const inserted = { id: 5, name: 'New', bibNumber: null, divisionId: 1, division: { id: 1, name: 'Rx', order: 0 } }
    mock.queueResult({ data: inserted, error: null })

    const res = await POST(new Request('http://test/api/athletes', {
      method: 'POST',
      body: JSON.stringify({ slug: 'test', name: 'New', divisionId: 1 }),
    }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(inserted)

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    const insert = call.ops.find(o => o.op === 'insert')
    expect(insert?.args[0]).toMatchObject({ name: 'New', divisionId: 1 })
    expect(call.ops.find(o => o.op === 'single')).toBeTruthy()
  })

  it('trims whitespace from name and bibNumber', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await POST(new Request('http://test/api/athletes', {
      method: 'POST',
      body: JSON.stringify({ slug: 'test', name: '  Jane  ', bibNumber: '  99  ' }),
    }))
    const insert = mock.lastCall!.ops.find(o => o.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ name: 'Jane', bibNumber: '99' })
  })
})

describe('DELETE /api/athletes', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await DELETE(new Request('http://test/api/athletes', { method: 'DELETE', body: JSON.stringify({ ids: [1] }) }))
    expect(res.status).toBe(401)
  })

  it('rejects empty ids', async () => {
    const res = await DELETE(new Request('http://test/api/athletes', { method: 'DELETE', body: JSON.stringify({ ids: [] }) }))
    expect(res.status).toBe(400)
  })

  it('deletes athletes and returns count', async () => {
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    const res = await DELETE(new Request('http://test/api/athletes', { method: 'DELETE', body: JSON.stringify({ ids: [1, 2] }) }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    expect(call.ops.find(o => o.op === 'in')?.args).toEqual(['id', [1, 2]])
  })
})
