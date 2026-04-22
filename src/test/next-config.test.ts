import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

describe('next.config headers()', () => {
  it('applies security headers to every route', async () => {
    const groups = await nextConfig.headers?.()
    expect(groups).toHaveLength(1)
    expect(groups![0].source).toBe('/:path*')

    const byKey = Object.fromEntries(groups![0].headers.map((h) => [h.key, h.value]))
    expect(byKey['X-Content-Type-Options']).toBe('nosniff')
    expect(byKey['X-Frame-Options']).toBe('DENY')
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(byKey['Strict-Transport-Security']).toMatch(/max-age=\d+/)
    expect(byKey['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    expect(byKey['Content-Security-Policy']).toContain('supabase.co')
    expect(byKey['Permissions-Policy']).toContain('camera=()')
  })
})
