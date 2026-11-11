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

  // The leaderboard has always been live for an unsaved setting; Setup now
  // describes the same thing.
  it('reports live, per-heat results when visibility was never saved', async () => {
    const body = await (await GET(getReq())).json()
    expect(body.leaderboardVisibility).toBe('per_heat')
  })

  // The board's pace before it became a setting.
  it('turns the TV every 10 seconds when the pace was never saved', async () => {
    const body = await (await GET(getReq())).json()
    expect(body.tvSecondsPerScreen).toBe(10)
  })

  it('reads the TV pace a competition saved', async () => {
    // Eight settings read before it, none stored.
    mock.queueResults([], [], [], [], [], [], [], [], [{ value: '25' }])
    const body = await (await GET(getReq())).json()
    expect(body.tvSecondsPerScreen).toBe(25)
  })

  it('gives the judge password to the competition\'s own people', async () => {
    const body = await (await GET(getReq())).json()
    expect(body.judgePassword).toBe("I'majudge")
  })

  it('keeps the judge password from everyone else', async () => {
    setAuthUser(null)
    const body = await (await GET(getReq())).json()
    expect(body).not.toHaveProperty('judgePassword')
    expect(body.showBib).toBe(true)
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

  it('saves the TV pace', async () => {
    await PATCH(patchReq({ tvSecondsPerScreen: 20 }))
    const valuesCall = mock.calls.find(
      (c) => c.method === 'values' && (c.args[0] as { key?: string }).key === 'tvSecondsPerScreen',
    )
    expect((valuesCall!.args[0] as { value: string }).value).toBe('20')
  })

  // Under five seconds nobody finds their lane; past two minutes the other
  // half of the board is as good as gone.
  it('refuses a TV pace outside 5 to 120 seconds', async () => {
    expect((await PATCH(patchReq({ tvSecondsPerScreen: 4 }))).status).toBe(400)
    expect((await PATCH(patchReq({ tvSecondsPerScreen: 121 }))).status).toBe(400)
    expect((await PATCH(patchReq({ tvSecondsPerScreen: 7.5 }))).status).toBe(400)
  })
})
