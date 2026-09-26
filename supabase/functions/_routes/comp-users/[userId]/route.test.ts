import { describe, it, expect, vi } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { requireCompetitionAdmin } from '@/lib/auth-competition'
import { PATCH, DELETE } from './route'

const params = (userId: string) => ({ params: Promise.resolve({ userId }) })
const patchReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/comp-users/u2', { method: 'PATCH', body: JSON.stringify(body) })
const deleteReq = (slug = 'default') =>
  new Request(`http://test/api/comp-users/u2?slug=${slug}`, { method: 'DELETE' })

describe('PATCH /api/comp-users/[userId]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await PATCH(patchReq({ slug: 'default', role: 'user' }), params('u2'))).status).toBe(401)
  })

  it('gates on competition admin, not plain membership', async () => {
    mock.queueResult([])
    await PATCH(patchReq({ slug: 'default', role: 'user' }), params('u2'))
    expect(vi.mocked(requireCompetitionAdmin)).toHaveBeenCalledWith('default')
  })

  it('rejects a role outside admin and user', async () => {
    expect((await PATCH(patchReq({ slug: 'default', role: 'owner' }), params('u2'))).status).toBe(400)
  })

  it('updates the role scoped to userId and competitionId', async () => {
    mock.queueResult([])
    const res = await PATCH(patchReq({ slug: 'default', role: 'user' }), params('u2'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mock.calls.find(c => c.method === 'set')!.args[0]).toEqual({ role: 'user' })
  })

  // The update is unconditional: demoting a user who is not a member of this
  // competition matches no rows but still reports ok.
  it('reports ok even when no membership row matched', async () => {
    mock.queueResult([])
    expect(await (await PATCH(patchReq({ slug: 'default', role: 'user' }), params('nobody'))).json())
      .toEqual({ ok: true })
  })

  // PATCH has no self-demotion guard, unlike DELETE's self-removal guard.
  it('lets an admin demote themselves', async () => {
    mock.queueResult([])
    expect((await PATCH(patchReq({ slug: 'default', role: 'user' }), params('user-1'))).status).toBe(200)
  })
})

describe('DELETE /api/comp-users/[userId]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(deleteReq(), params('u2'))).status).toBe(401)
  })

  it('refuses to remove the calling user', async () => {
    const res = await DELETE(deleteReq(), params('user-1'))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Cannot remove yourself')
    expect(mock.calls.some(c => c.method === 'delete')).toBe(false)
  })

  it('deletes the membership scoped to userId and competitionId', async () => {
    mock.queueResult([])
    const res = await DELETE(deleteReq(), params('u2'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mock.calls.some(c => c.method === 'delete')).toBe(true)
  })

  // Removing a member drops the competition membership only; the auth account
  // itself is left intact.
  it('leaves the auth account intact', async () => {
    mock.queueResult([])
    await DELETE(deleteReq(), params('u2'))
    expect(mock.calls.filter(c => c.method === 'delete')).toHaveLength(1)
  })
})
