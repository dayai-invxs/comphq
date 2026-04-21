import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const putReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/athletes/1?slug=default', { method: 'PUT', body: JSON.stringify(body) })

const deleteReq = () => new Request('http://test/api/athletes/1?slug=default')

describe('PUT /api/athletes/[id]', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PUT(putReq({ name: 'X' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects empty name', async () => {
    const res = await PUT(putReq({ name: ' ' }), params('1'))
    expect(res.status).toBe(400)
  })

  it('updates athlete and returns with division', async () => {
    const updated = { id: 1, name: 'New', bibNumber: '7', divisionId: 2, division: { id: 2, name: 'Scaled', order: 1 } }
    mock.queueResult({ data: updated, error: null })

    const res = await PUT(putReq({ name: 'New', bibNumber: '7', divisionId: 2 }), params('1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)

    const call = mock.lastCall!
    expect(call.table).toBe('Athlete')
    const update = call.ops.find(o => o.op === 'update')!
    expect(update.args[0]).toMatchObject({ name: 'New', bibNumber: '7', divisionId: 2 })
    // Tenant isolation: should scope by competitionId in addition to id
    const eqArgs = call.ops.filter(o => o.op === 'eq').map(o => o.args[0])
    expect(eqArgs).toContain('id')
    expect(eqArgs).toContain('competitionId')
  })

  it('does not set divisionId when omitted (partial update)', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await PUT(putReq({ name: 'X', bibNumber: '1' }), params('1'))
    const update = mock.lastCall!.ops.find(o => o.op === 'update')!
    expect((update.args[0] as Record<string, unknown>).divisionId).toBeUndefined()
  })

  it('returns 404 when athlete does not belong to caller competition', async () => {
    mock.queueResult({ data: null, error: null }) // maybeSingle returns null → route 404
    const res = await PUT(putReq({ name: 'New' }), params('999'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/athletes/[id]', () => {
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
    expect(call.table).toBe('Athlete')
    expect(call.ops.find(o => o.op === 'delete')).toBeTruthy()
    const eqArgs = call.ops.filter(o => o.op === 'eq').map(o => o.args[0])
    expect(eqArgs).toContain('id')
    expect(eqArgs).toContain('competitionId')
  })
})
