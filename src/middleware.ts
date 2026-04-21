import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/rate-limit'

// 5 login attempts per 60 seconds per IP. Reasonable for real users,
// crushes naive brute-force attempts.
const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 5 })

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'local'
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/api/auth/callback/credentials' && req.method === 'POST') {
    const result = loginLimiter.check(clientIp(req))
    if (!result.ok) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
      return new NextResponse('Too many login attempts. Try again later.', {
        status: 429,
        headers: {
          'retry-after': String(retryAfter),
          'x-ratelimit-remaining': '0',
        },
      })
    }
  }

  return NextResponse.next()
}

// Only run middleware on auth routes — keep other paths on the fast path.
export const config = {
  matcher: ['/api/auth/:path*'],
}
