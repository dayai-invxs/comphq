import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
import { PATCH, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const patchReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/competitions/1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

const deleteReq = () =>
  new Request('http://test/api/competitions/1', { method: 'DELETE' })

describe('PATCH /api/competitions/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PATCH(patchReq({ name: 'New' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects non-super', async () => {
    setAuthSuper(false)
    const res = await PATCH(patchReq({ name: 'New' }), params('1'))
    expect(res.status).toBe(403)
  })

  it('rejects invalid slug', async () => {
    const res = await PATCH(patchReq({ slug: '-bad-' }), params('1'))
    expect(res.status).toBe(400)
  })

  it('updates name and normalized slug', async () => {
    const updated = { id: 1, name: 'Renamed', slug: 'new-slug' }
    mock.queueResult({ data: updated, error: null })

    const res = await PATCH(patchReq({ name: 'Renamed', slug: 'New Slug' }), params('1'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)

    const call = mock.lastCall!
    expect(call.table).toBe('Competition')
    const update = call.ops.find((o) => o.op === 'update')!
    expect(update.args[0]).toMatchObject({ name: 'Renamed', slug: 'new-slug' })
  })

  it('ignores fields the user did not send (partial update)', async () => {
    mock.queueResult({ data: { id: 1 }, error: null })
    await PATCH(patchReq({ name: 'Only Name' }), params('1'))
    const update = mock.lastCall!.ops.find((o) => o.op === 'update')!
    const patch = update.args[0] as Record<string, unknown>
    expect(patch.name).toBe('Only Name')
    expect(patch.slug).toBeUndefined()
  })
})

describe('DELETE /api/competitions/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects non-super', async () => {
    setAuthSuper(false)
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(403)
  })

  it('deletes and returns 204', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(204)

    const call = mock.lastCall!
    expect(call.table).toBe('Competition')
    expect(call.ops.find((o) => o.op === 'delete')).toBeTruthy()
    const eqOp = call.ops.find((o) => o.op === 'eq')!
    expect(eqOp.args).toEqual(['id', 1])
  })
})
