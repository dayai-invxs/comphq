import type { Session } from 'next-auth'
import { supabase } from '@/lib/supabase'
import { resolveCompetition } from '@/lib/competition'

export type Role = 'admin' | 'scorekeeper'

export type User = { id: number; username: string; role: 'admin' | 'user' }
export type Membership = { userId: number; competitionId: number; role: Role }
export type Competition = { id: number; name: string; slug: string }
export type AuthContext = { user: User; membership: Membership; competition: Competition }

export class AuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Looks up the User row for the authenticated session.
 * Throws AuthError(401) if no session or the username isn't in the DB.
 */
export async function requireSession(session: Session | null): Promise<User> {
  const username = session?.user?.name
  if (!username) throw new AuthError(401, 'Unauthorized')

  const { data } = await supabase
    .from('User')
    .select('id, username, role')
    .eq('username', username)
    .maybeSingle()

  if (!data) throw new AuthError(401, 'Unauthorized')
  return data as User
}

/**
 * Gates a route on (a) session present, (b) competition exists, (c) user is a
 * member, (d) role meets `minRole`. Default minRole is 'scorekeeper' (any
 * member is OK). Pass 'admin' for destructive ops.
 */
export async function requireCompetitionMember(
  session: Session | null,
  slug: string,
  minRole: Role = 'scorekeeper',
): Promise<AuthContext> {
  const user = await requireSession(session)

  const competition = await resolveCompetition(slug)
  if (!competition) throw new AuthError(404, 'Competition not found')

  const { data } = await supabase
    .from('CompetitionMember')
    .select('userId, competitionId, role')
    .eq('userId', user.id)
    .eq('competitionId', competition.id)
    .maybeSingle()

  if (!data) throw new AuthError(403, 'Not a member of this competition')

  const membership = data as Membership
  if (minRole === 'admin' && membership.role !== 'admin') {
    throw new AuthError(403, 'Admin role required for this action')
  }

  return { user, membership, competition }
}

/**
 * Site-wide admin gate. 'admin' can CRUD competitions + users; 'user' cannot.
 */
export async function requireSiteAdmin(session: Session | null): Promise<User> {
  const user = await requireSession(session)
  if (user.role !== 'admin') throw new AuthError(403, 'Site admin required')
  return user
}

/**
 * Map AuthError to a Response. Let all other errors propagate to the route
 * handler's own error boundary (they probably want to return 500).
 */
export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return new Response(e.message, { status: e.status })
  throw e
}
