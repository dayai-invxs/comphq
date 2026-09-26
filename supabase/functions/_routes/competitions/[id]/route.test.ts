import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser, setAuthSuper } from '@/test/setup'
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
    mock.queueResult([updated])

    const res = await PATCH(patchReq({ name: 'Renamed', slug: 'New Slug' }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)

    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toMatchObject({ name: 'Renamed', slug: 'new-slug' })
  })

  it('ignores fields the user did not send (partial update)', async () => {
    mock.queueResult([{ id: 1 }])
    await PATCH(patchReq({ name: 'Only Name' }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')!
    const patch = setCall.args[0] as Record<string, unknown>
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
    mock.queueResult(undefined)
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(204)
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(true)
  })
})
