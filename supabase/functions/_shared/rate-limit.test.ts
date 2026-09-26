import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows up to max hits in the window', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 3 })
    const now = 1000
    expect(rl.check('k', now).ok).toBe(true)
    expect(rl.check('k', now).ok).toBe(true)
    expect(rl.check('k', now).ok).toBe(true)
    expect(rl.check('k', now).ok).toBe(false)
  })

  it('resets after the window elapses', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 2 })
    expect(rl.check('k', 1000).ok).toBe(true)
    expect(rl.check('k', 1500).ok).toBe(true)
    expect(rl.check('k', 1800).ok).toBe(false)   // still in window
    expect(rl.check('k', 2100).ok).toBe(true)    // 1000ms after first hit expired
  })

  it('tracks keys independently', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1 })
    expect(rl.check('a', 1000).ok).toBe(true)
    expect(rl.check('a', 1000).ok).toBe(false)
    expect(rl.check('b', 1000).ok).toBe(true)
  })

  it('reports remaining and resetAt', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 5 })
    const r = rl.check('k', 2000)
    expect(r.remaining).toBe(4)
    expect(r.resetAt).toBe(3000)
  })
})
