import { authErrorResponse, requireSession } from '@/lib/auth-competition'

/**
 * Returns the current logged-in user's shape. Used by client-side
 * layouts/pages to decide what UI to render (e.g. "hide the /admin
 * dashboard from non-supers") without each page fetching a super-only
 * endpoint and branching on the 403.
 */
export async function GET() {
  try {
    const user = await requireSession()
    return Response.json({ id: user.id, email: user.email, isSuper: user.isSuper })
  } catch (e) {
    return authErrorResponse(e)
  }
}
