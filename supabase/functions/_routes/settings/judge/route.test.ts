import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const req = (body: unknown) =>
  new Request('http://test/api/settings/judge', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/settings/judge', () => {
  // Judges at the door are not signed in.
  it('answers without a session', async () => {
    setAuthUser(null)
    mock.queueResult([{ value: 'letmein' }])
    const res = await POST(req({ slug: 'summer', password: 'letmein' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('refuses a wrong password, and does not say what the right one is', async () => {
    mock.queueResult([{ value: 'letmein' }])
    const res = await POST(req({ slug: 'summer', password: 'nope' }))
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain('letmein')
  })

  it('takes the built-in default where the competition never set one', async () => {
    mock.queueResult([])
    expect((await POST(req({ slug: 'summer', password: "I'majudge" }))).status).toBe(200)
    mock.queueResult([])
    expect((await POST(req({ slug: 'summer', password: 'rug702' }))).status).toBe(403)
  })

  it('needs a competition and a password', async () => {
    expect((await POST(req({ password: 'x' }))).status).toBe(400)
    expect((await POST(req({ slug: 'summer' }))).status).toBe(400)
  })
})
