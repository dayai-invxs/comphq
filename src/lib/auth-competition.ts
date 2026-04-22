import { supabase } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { resolveCompetition } from '@/lib/competition'

export type Role = 'admin' | 'scorekeeper'
export type SiteRole = 'admin' | 'user'

export type AuthedUser = { id: string; email: string | null; role: SiteRole }
export type Membership = { userId: string; competitionId: number; role: Role }
export type Competition = { id: number; name: string; slug: string }
export type AuthContext = { user: AuthedUser; membership: Membership; competition: Competition }

export class AuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Read the logged-in user from the Supabase session cookie and load their
 * UserProfile row (for the site-wide role). Throws AuthError(401) if no
 * valid session or the profile row is missing.
 */
export async function requireSession(): Promise<AuthedUser> {
  const client = await createSupabaseServerClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new AuthError(401, 'Unauthorized')

  // UserProfile is server-only (RLS deny-all to anon/authenticated).
  // Load it with the service-role client.
  const { data: profile } = await supabase
    .from('UserProfile')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email ?? null,
    role: ((profile as { role?: SiteRole } | null)?.role ?? 'user') as SiteRole,
  }
}

/**
 * Gates a route on (a) session present, (b) competition exists, (c) user
 * is a member, (d) role meets `minRole`. Default minRole is 'scorekeeper'
 * (any member is OK). Pass 'admin' for destructive ops.
 */
export async function requireCompetitionMember(
  slug: string,
  minRole: Role = 'scorekeeper',
): Promise<AuthContext> {
  const user = await requireSession()

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
export async function requireSiteAdmin(): Promise<AuthedUser> {
  const user = await requireSession()
  if (user.role !== 'admin') throw new AuthError(403, 'Site admin required')
  return user
}

/**
 * Verifies that a Workout belongs to the given competition. Returns the
 * workout row or throws AuthError(404). Cheap cross-tenant defense for
 * every nested /api/workouts/[id]/* route.
 */
export async function requireWorkoutInCompetition<T = Record<string, unknown>>(
  workoutId: number,
  competitionId: number,
  select = '*',
): Promise<T> {
  const { data } = await supabase
    .from('Workout')
    .select(select)
    .eq('id', workoutId)
    .eq('competitionId', competitionId)
    .maybeSingle()
  if (!data) throw new AuthError(404, 'Workout not found')
  return data as T
}

/**
 * Map AuthError to a Response. Let all other errors propagate to the route
 * handler's own error boundary (they probably want to return 500).
 */
export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) return new Response(e.message, { status: e.status })
  throw e
}
