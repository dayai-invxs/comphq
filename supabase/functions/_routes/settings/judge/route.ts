import { z } from 'zod'
import { resolveCompetition } from '@/lib/competition'
import { judgePassword, judgeToken } from '@/lib/judgeToken'
import { createRateLimiter } from '@/lib/rate-limit'

// The judge and equipment screens' password, checked here. It used to be
// read out of the public settings and compared in the browser, so anyone could
// read it. The answer is yes or no; the password itself never leaves.
//
// A yes carries a token (lib/judgeToken.ts) the screens send back with the
// writes behind the gate, so those writes are not open to anyone who knows the
// competition's address.
//
// Guesses are limited per caller and competition. The limiter lives in the
// function's memory, so it holds for as long as an instance stays warm — it
// slows a guessing script down rather than making guessing impossible.

const JudgeUnlock = z.strictObject({
  slug: z.string().min(1),
  password: z.string().max(200),
})

const attempts = createRateLimiter({ windowMs: 60_000, max: 10 })

function caller(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

export async function POST(req: Request) {
  let body: unknown
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }
  const parsed = JudgeUnlock.safeParse(body)
  if (!parsed.success) return new Response('Invalid request', { status: 400 })

  const limit = attempts.check(`${caller(req)}:${parsed.data.slug}`)
  if (!limit.ok) {
    return new Response('Too many attempts. Wait a minute and try again.', {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
    })
  }

  const competition = await resolveCompetition(parsed.data.slug)
  if (!competition) return new Response('Competition not found', { status: 404 })

  const password = await judgePassword(competition.id)
  if (parsed.data.password !== password) return new Response('Incorrect password', { status: 403 })
  return Response.json({ ok: true, token: await judgeToken(competition.id, password) })
}
