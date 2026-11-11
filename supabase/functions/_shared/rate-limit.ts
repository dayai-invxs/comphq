/**
 * In-memory sliding-window rate limiter. Each Edge Function instance keeps its
 * own counts for as long as it stays warm, so this slows a script down rather
 * than enforcing a hard limit across instances. Used by the judge password
 * check (POST /api/settings/judge).
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
