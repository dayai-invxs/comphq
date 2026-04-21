import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const putReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/divisions/1?slug=default', { method: 'PUT', body: JSON.stringify(body) })

const deleteReq = () => new Request('http://test/api/divisions/1?slug=default')

describe('PUT /api/divisions/[id]', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PUT(putReq({ name: 'X' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects empty body (no fields)', async () => {
    const res = await PUT(putReq({}), params('1'))
    expect(res.status).toBe(400)
  })

  it('updates name only', async () => {
    mock.queueResult({ data: { id: 1, name: 'New', order: 0 }, error: null })
    const res = await PUT(putReq({ name: 'New' }), params('1'))
    expect(res.status).toBe(200)
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    expect(update.args[0]).toEqual({ name: 'New' })
    const eqArgs = mock.lastCall!.ops.filter(o => o.op === 'eq').map(o => o.args[0])
    expect(eqArgs).toContain('id')
    expect(eqArgs).toContain('competitionId')
  })

  it('updates order', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await PUT(putReq({ order: 5 }), params('1'))
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    expect(update.args[0]).toEqual({ order: 5 })
  })

  it('updates both fields', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await PUT(putReq({ name: 'X', order: 2 }), params('1'))
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    expect(update.args[0]).toEqual({ name: 'X', order: 2 })
  })
})

describe('DELETE /api/divisions/[id]', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(204)
    const call = mock.lastCall!
    expect(call.table).toBe('Division')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    const eqArgs = call.ops.filter(o => o.op === 'eq').map(o => o.args[0])
    expect(eqArgs).toContain('id')
    expect(eqArgs).toContain('competitionId')
  })
})
