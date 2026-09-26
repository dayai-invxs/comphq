import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET, PATCH } from './route'

const getReq = () => new Request('http://test/api/settings?slug=default')
const patchReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ slug: 'default', ...body }),
  })

describe('GET /api/settings', () => {
  it('returns showBib=true by default', async () => {
    // Three separate getSetting() calls, no rows for any.
    mock.queueResults([], [], [])
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.showBib).toBe(true)
  })

  it('returns showBib=false when stored as false', async () => {
    // First getSetting returns the stored 'false'; others empty.
    mock.queueResults([{ value: 'false' }], [], [])
    const res = await GET(getReq())
    const body = await res.json()
    expect(body.showBib).toBe(false)
  })
})

describe('PATCH /api/settings', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PATCH(patchReq({ showBib: true }))
    expect(res.status).toBe(401)
  })

  it('upserts setting when showBib provided', async () => {
    // Queue: 1 upsert + 3 getSetting selects for the re-read return.
    mock.queueResults(undefined, [{ value: 'false' }], [], [])
    await PATCH(patchReq({ showBib: false }))

    // `.values()` args[0] holds the upsert payload.
    const valuesCall = mock.calls.find(
      (c) => c.method === 'values' && (c.args[0] as { key?: string }).key === 'showBib',
    )
    expect(valuesCall).toBeTruthy()
    expect((valuesCall!.args[0] as { value: string }).value).toBe('false')
  })
})
