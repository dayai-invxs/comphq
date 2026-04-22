import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Supabase session refresh on every request.
 *
 * Supabase cookies have short lifespans and get refreshed via the
 * refresh-token flow. Next.js middleware is the right place to make
 * that refresh happen so server components see a fresh session on
 * the next request.
 *
 * Rate-limiting on login: Supabase Auth enforces its own rate limits
 * on `/auth/v1/token` at the service level, so we no longer need the
 * custom limiter that protected the old NextAuth credentials endpoint.
 */
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.next()

  const res = NextResponse.next()
  const client = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          res.cookies.set(name, value, options)
        }
      },
    },
  })

  // Triggers the refresh-token exchange if the access token is expiring.
  await client.auth.getUser()
  return res
}

// Run on all pages + API routes; skip Next internals and static assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
