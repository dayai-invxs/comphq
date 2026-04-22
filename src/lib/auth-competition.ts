import { supabase } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { resolveCompetition } from '@/lib/competition'

export type AuthedUser = { id: string; email: string | null; isSuper: boolean }
export type Competition = { id: number; name: string; slug: string }
export type CompAdminMembership = { userId: string; competitionId: number }
export type AuthContext = { user: AuthedUser; membership: CompAdminMembership; competition: Competition }

export class AuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Read the logged-in user from the Supabase session cookie and load their
 * UserProfile row (for the super-admin flag). Throws AuthError(401) if no
 * valid session. UserProfile row is auto-created by the on-auth-insert
 * trigger; if somehow missing, we default isSuper=false.
 */
export async function requireSession(): Promise<AuthedUser> {
  const client = await createSupabaseServerClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new AuthError(401, 'Unauthorized')

  const { data: profile } = await supabase
    .from('UserProfile')
    .select('isSuper')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email ?? null,
    isSuper: (profile as { isSuper?: boolean } | null)?.isSuper === true,
  }
}

/**
 * Gates a route on (a) session present, (b) competition exists, (c) caller
 * is either a super-admin OR an admin of this specific competition.
 *
 * Super admins bypass the CompetitionAdmin row check — they can manage
 * any comp on the site.
 */
export async function requireCompetitionAdmin(slug: string): Promise<AuthContext> {
  const user = await requireSession()

  const competition = await resolveCompetition(slug)
  if (!competition) throw new AuthError(404, 'Competition not found')

  // Super admin → skip the row check. Synthesize a membership record for
  // callers that want to log the action.
  if (user.isSuper) {
    return {
      user,
      membership: { userId: user.id, competitionId: competition.id },
      competition,
    }
  }

  const { data } = await supabase
    .from('CompetitionAdmin')
    .select('userId, competitionId')
    .eq('userId', user.id)
    .eq('competitionId', competition.id)
    .maybeSingle()

  if (!data) throw new AuthError(403, 'Not an admin of this competition')

  return { user, membership: data as CompAdminMembership, competition }
}

/**
 * Site-wide super-admin gate. Super admins can create / rename / delete
 * competitions and manage user accounts.
 */
export async function requireSiteAdmin(): Promise<AuthedUser> {
  const user = await requireSession()
  if (!user.isSuper) throw new AuthError(403, 'Super-admin required')
  return user
}

/**
 * Verifies a Workout belongs to the given competition. Cheap cross-tenant
 * defense for nested /api/workouts/[id]/* routes. Combined with
 * requireCompetitionAdmin this prevents admin-of-comp-A from editing
 * workouts of comp-B.
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
