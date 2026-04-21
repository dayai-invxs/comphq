import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

function loginPost(ip = '203.0.113.1') {
  return new NextRequest('http://test/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  })
}

describe('middleware login rate-limit', () => {
  it('lets the first 5 login attempts through', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await middleware(loginPost('203.0.113.2'))
      expect(res.status).toBe(200) // NextResponse.next() resolves as 200
    }
  })

  it('returns 429 on the 6th attempt within the window', async () => {
    for (let i = 0; i < 5; i++) await middleware(loginPost('203.0.113.3'))
    const res = await middleware(loginPost('203.0.113.3'))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/)
  })

  it('does not rate-limit non-login routes', async () => {
    const req = new NextRequest('http://test/api/auth/session', { method: 'GET' })
    const res = await middleware(req)
    expect(res.status).toBe(200)
  })

  it('tracks IPs independently', async () => {
    for (let i = 0; i < 5; i++) await middleware(loginPost('203.0.113.4'))
    const blocked = await middleware(loginPost('203.0.113.4'))
    expect(blocked.status).toBe(429)

    const other = await middleware(loginPost('203.0.113.5'))
    expect(other.status).toBe(200)
  })
})
