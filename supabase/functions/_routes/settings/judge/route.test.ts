import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

// Each test calls from its own address, so the per-caller limit on guesses
// never carries from one test into the next.
let caller = 0
const req = (body: unknown, from = `10.0.0.${++caller}`) =>
  new Request('http://test/api/settings/judge', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': from },
  })

describe('POST /api/settings/judge', () => {
  // Judges at the door are not signed in.
  it('answers without a session', async () => {
    setAuthUser(null)
    mock.queueResult([{ value: 'letmein' }])
    const res = await POST(req({ slug: 'summer', password: 'letmein' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // The token the screen sends back with its writes; never the password.
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(body)).not.toContain('letmein')
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

  // A script trying passwords is held to ten a minute from one address.
  it('stops answering a caller after ten tries in a minute', async () => {
    for (let i = 0; i < 10; i++) {
      mock.queueResult([{ value: 'letmein' }])
      expect((await POST(req({ slug: 'summer', password: `guess${i}` }, '10.9.9.9'))).status).toBe(403)
    }
    const res = await POST(req({ slug: 'summer', password: 'letmein' }, '10.9.9.9'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/)
    // Someone else at the door is not held up by it.
    mock.queueResult([{ value: 'letmein' }])
    expect((await POST(req({ slug: 'summer', password: 'letmein' }, '10.9.9.10'))).status).toBe(200)
  })
})
