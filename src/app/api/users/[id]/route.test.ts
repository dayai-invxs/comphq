import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
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
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(req('DELETE'), params('target-uuid'))
    expect(res.status).toBe(200)
    const call = mock.calls.find((c) => c.table === 'auth:deleteUser')
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
    mock.queueResult({ data: null, error: null })
    const res = await PATCH(req('PATCH', { isSuper: false }), params('target-uuid'))
    expect(res.status).toBe(200)
    const upsert = mock.calls.find((c) => c.table === 'UserProfile')
    expect(upsert).toBeTruthy()
  })

  it('syncs competition memberships (delete + insert)', async () => {
    // delete call
    mock.queueResult({ data: null, error: null })
    // insert call
    mock.queueResult({ data: null, error: null })

    const res = await PATCH(req('PATCH', { competitionIds: [1, 2] }), params('target-uuid'))
    expect(res.status).toBe(200)
    const compAdminCalls = mock.calls.filter((c) => c.table === 'CompetitionAdmin')
    expect(compAdminCalls.length).toBeGreaterThanOrEqual(2)
    const inserted = compAdminCalls.find((c) => c.ops.some((o) => o.op === 'insert'))
    expect(inserted).toBeTruthy()
    const rows = inserted!.ops.find((o) => o.op === 'insert')!.args[0] as unknown[]
    expect(rows).toHaveLength(2)
  })

  it('empty competitionIds array clears all memberships', async () => {
    mock.queueResult({ data: null, error: null }) // delete only
    const res = await PATCH(req('PATCH', { competitionIds: [] }), params('target-uuid'))
    expect(res.status).toBe(200)
    const deleted = mock.calls.find((c) =>
      c.table === 'CompetitionAdmin' && c.ops.some((o) => o.op === 'delete'),
    )
    expect(deleted).toBeTruthy()
  })
})
