import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/**
 * OAuth / email-link callback. Supabase appends `?code=…` when a user
 * clicks a confirmation or password-reset link. We swap that code for a
 * session cookie, then redirect to `next` (or /admin by default).
 *
 * Open-redirect guard: `next` must be a same-origin path.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') ?? '/admin'
  const safeNext = nextParam.startsWith('/') ? nextParam : '/admin'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin))
  }

  return NextResponse.redirect(new URL(safeNext, url.origin))
}
