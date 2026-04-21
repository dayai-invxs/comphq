/**
 * In-memory sliding-window rate limiter. Fine for single-instance deploys
 * (Vercel functions share memory per region per warm instance — good enough
 * for MVP). Swap for Upstash Redis when scaling beyond one instance.
 */
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number }

export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>()

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const windowStart = now - opts.windowMs
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart)

      const ok = recent.length < opts.max
      if (ok) recent.push(now)
      hits.set(key, recent)

      const resetAt = recent.length ? recent[0] + opts.windowMs : now + opts.windowMs
      return { ok, remaining: Math.max(0, opts.max - recent.length), resetAt }
    },
  }
}
