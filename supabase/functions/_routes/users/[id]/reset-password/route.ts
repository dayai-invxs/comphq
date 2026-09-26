import { supabase } from '@/lib/supabase'
import { authErrorResponse, requireSiteAdmin } from '@/lib/auth-competition'

/**
 * Super-admin-triggered password reset. Looks up the target user's email,
 * then asks Supabase Auth to send them a reset link. The admin never sees
 * the password (Supabase Auth handles the flow end-to-end via email).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSiteAdmin()
    const { id: targetId } = await params

    // Find the user's email. listUsers is paginated; for a solo-admin app a
    // single page is plenty — if we ever grow past that, swap to getUserById.
    const { data: listRes, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listErr) return new Response(listErr.message, { status: 500 })

    const user = (listRes?.users ?? []).find((u) => u.id === targetId)
    if (!user?.email) return new Response('User not found', { status: 404 })

    const origin = req.headers.get('origin') ?? new URL(req.url).origin
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })
    if (error) return new Response(error.message, { status: 500 })

    return Response.json({ ok: true })
  } catch (e) {
    return authErrorResponse(e)
  }
}
