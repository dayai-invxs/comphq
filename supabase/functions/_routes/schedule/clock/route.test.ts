import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /api/schedule/clock', () => {
  it('answers with the server\'s time, never cached', async () => {
    const before = Date.now()
    const res = await GET()
    const { now } = await res.json()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
