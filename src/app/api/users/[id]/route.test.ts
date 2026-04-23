import { describe, it, expect } from 'vitest'
import { drizzleMock as dmock, supabaseMock as smock, setAuthUser, setAuthSuper } from '@/test/setup'
import { DELETE, PATCH } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function req(method: 'PATCH' | 'DELETE', body?: unknown) {
  return new Request('http://test/api/users/abc', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('DELETE /api/users/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(req('DELETE'), params('abc'))
    expect(res.status).toBe(401)
  })

  it('rejects non-super', async () => {
    setAuthSuper(false)
    const res = await DELETE(req('DELETE'), params('abc'))
    expect(res.status).toBe(403)
  })

  it('rejects super trying to delete themselves', async () => {
    setAuthUser({ id: 'self-uuid', email: 'self@t.local' })
    const res = await DELETE(req('DELETE'), params('self-uuid'))
    expect(res.status).toBe(400)
  })

  it('calls auth.admin.deleteUser with the target id', async () => {
    setAuthUser({ id: 'super-uuid', email: 'super@t.local' })
    smock.queueResult({ data: null, error: null })
    const res = await DELETE(req('DELETE'), params('target-uuid'))
    expect(res.status).toBe(200)
    const call = smock.calls.find((c) => c.table === 'auth:deleteUser')
    expect(call).toBeTruthy()
    expect(call!.ops[0].args[0]).toBe('target-uuid')
  })
})

describe('PATCH /api/users/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PATCH(req('PATCH', { isSuper: true }), params('abc'))
    expect(res.status).toBe(401)
  })

  it('rejects non-super', async () => {
    setAuthSuper(false)
    const res = await PATCH(req('PATCH', { isSuper: true }), params('abc'))
    expect(res.status).toBe(403)
  })

  it('upserts UserProfile.isSuper when isSuper provided', async () => {
    dmock.queueResult(undefined)
    const res = await PATCH(req('PATCH', { isSuper: false }), params('target-uuid'))
    expect(res.status).toBe(200)
    // UserProfile upsert carries isSuper in its values payload.
    const valuesCall = dmock.calls.find(
      (c) => c.method === 'values' && 'isSuper' in (c.args[0] as Record<string, unknown>),
    )
    expect(valuesCall).toBeTruthy()
  })

  it('syncs competition memberships (delete + insert)', async () => {
    dmock.queueResult(undefined) // delete
    dmock.queueResult(undefined) // insert

    const res = await PATCH(req('PATCH', { competitionIds: [1, 2] }), params('target-uuid'))
    expect(res.status).toBe(200)
    expect(dmock.calls.some((c) => c.method === 'delete')).toBe(true)
    const valuesCall = dmock.calls.find((c) => c.method === 'values' && Array.isArray(c.args[0]))
    expect((valuesCall!.args[0] as unknown[])).toHaveLength(2)
  })

  it('empty competitionIds array clears all memberships', async () => {
    dmock.queueResult(undefined)
    const res = await PATCH(req('PATCH', { competitionIds: [] }), params('target-uuid'))
    expect(res.status).toBe(200)
    expect(dmock.calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
