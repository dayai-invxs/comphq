import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST } from './route'

describe('GET /api/users', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns users ordered by id', async () => {
    mock.queueResult({ data: [{ id: 1, username: 'admin', role: 'admin' }], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 1, username: 'admin', role: 'admin' }])
    expect(mock.lastCall!.table).toBe('User')
    expect(mock.lastCall!.ops.find(o => o.op === 'select')?.args[0]).toBe('id, username, role')
    expect(mock.lastCall!.ops.find(o => o.op === 'order')?.args[0]).toBe('id')
  })
})

describe('POST /api/users', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ username: 'a', password: 'twelve-chars-minimum' }) }))
    expect(res.status).toBe(401)
  })

  it('rejects missing username', async () => {
    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ password: 'twelve-chars-minimum' }) }))
    expect(res.status).toBe(400)
  })

  it('rejects short password (< 12 chars)', async () => {
    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ username: 'new', password: 'eleven-char' }) }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when username taken', async () => {
    mock.queueResult({ data: { id: 5 }, error: null })
    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ username: 'taken', password: 'twelve-chars-minimum' }) }))
    expect(res.status).toBe(409)
  })

  it('creates user with hashed password and returns 201', async () => {
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: { id: 2, username: 'new' }, error: null })

    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ username: 'new', password: 'twelve-chars-minimum' }) }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 2, username: 'new' })

    const insertCall = mock.calls[1]
    const insert = insertCall.ops.find(o => o.op === 'insert')!
    const row = insert.args[0] as { username: string; password: string }
    expect(row.username).toBe('new')
    expect(row.password).not.toBe('twelve-chars-minimum')
    expect(row.password.length).toBeGreaterThan(20)
  })
})
