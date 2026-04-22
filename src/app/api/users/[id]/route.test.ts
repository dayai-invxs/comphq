import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PUT /api/users/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PUT(new Request('http://test', { method: 'PUT', body: JSON.stringify({ password: 'twelve-chars-minimum' }) }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects short password', async () => {
    const res = await PUT(new Request('http://test', { method: 'PUT', body: JSON.stringify({ password: 'x' }) }), params('1'))
    expect(res.status).toBe(400)
  })

  it('hashes password and updates user', async () => {
    mock.queueResult({ data: { id: 1, username: 'admin' }, error: null })
    const res = await PUT(
      new Request('http://test', { method: 'PUT', body: JSON.stringify({ password: 'twelve-chars-secret' }) }),
      params('1'),
    )
    expect(res.status).toBe(200)
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    const patch = update.args[0] as { password: string }
    expect(patch.password).not.toBe('twelve-chars-secret')
    expect(patch.password.length).toBeGreaterThan(20)
  })
})

describe('DELETE /api/users/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(new Request('http://test'), params('1'))
    expect(res.status).toBe(401)
  })

  it('refuses to delete last user', async () => {
    mock.queueResult({ data: [{ id: 1 }], error: null })
    const res = await DELETE(new Request('http://test'), params('1'))
    expect(res.status).toBe(400)
  })

  it('deletes user when multiple exist', async () => {
    mock.queueResult({ data: [{ id: 1 }, { id: 2 }], error: null })
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(new Request('http://test'), params('2'))
    expect(res.status).toBe(204)
  })
})
