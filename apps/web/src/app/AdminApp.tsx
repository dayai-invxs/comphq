import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useMyCompetitions } from '@/api/competitions'
import { CompetitionBrand } from '@/components/CompetitionBrand/CompetitionBrand'
import { useMe } from '@/api/session'
import { useSession } from '@/lib/session'
import { AdminShell } from '@/layouts/AdminShell'
import { Booting, GateFailed, NoAccess } from './GateStates'
import { loginPath } from './loginPath'
import { SITE_GROUP } from './siteNav'

// The site dashboard, super-admin only. A competition admin goes straight to
// /{slug}/admin and never renders this.
//
// Ported from v1's src/app/admin/layout.tsx, gate and all. What it asks is the
// same: is anyone signed in, is that person super, and if not, where should
// they be sent instead.
export function AdminApp() {
  const { user, loading, signOut } = useSession()
  const navigate = useNavigate()

  // Only after a user is known, as v1 did: both requests are session-gated and
  // a signed-out visitor is being redirected anyway.
  const me = useMe(!!user)
  // Fired alongside /api/me rather than after it, as v1's Promise.all did:
  // the answer is only needed on the non-super path, but waiting for the first
  // reply to start the second doubles the time a super waits for nothing.
  //
  // v1 read the redirect target out of /api/competitions, which lists every
  // competition to anyone, so a member of one competition was sent to whichever
  // competition happened to be first in the list and told they had no access to
  // it (defect 17). The question being asked is "where does this person
  // administer", and /api/competitions/mine is the endpoint that answers it.
  const competitions = useMyCompetitions(!!user)

  // v1 read isSuper off a 200 body and let every other outcome — a 401, a
  // network failure — fall through to the non-super branch. Settled-but-failed
  // is not 'loading' — but it is not 'non-super' either: a failed read is no
  // answer, and 'non-super' redirects or refuses on the strength of it.
  const waiting = me.isPending || competitions.isPending

  const status = loading || (user && waiting)
    ? 'loading'
    : !user
      ? 'unauthenticated'
      : me.data?.isSuper
        ? 'super'
        : me.error || competitions.error
          ? 'error'
          : 'non-super'

  const accessibleSlug = competitions.data?.[0]?.slug ?? null

  useEffect(() => {
    // v1 sent the literal /admin as the callback even from /admin/users.
    if (status === 'unauthenticated') navigate(loginPath('/admin'))
    if (status === 'non-super' && accessibleSlug) navigate(`/${accessibleSlug}/admin`)
  }, [status, accessibleSlug, navigate])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  if (status === 'loading' || status === 'unauthenticated') return <Booting label="Checking access" />

  if (status === 'error') {
    return (
      <GateFailed
        onRetry={() => { void me.refetch(); void competitions.refetch() }}
        onSignOut={handleSignOut}
      />
    )
  }

  if (status === 'non-super') {
    if (accessibleSlug) return <Booting label="Checking access" />
    return (
      <NoAccess title="Access required" onSignOut={handleSignOut}>
        Your account isn&apos;t a super-admin and has no competition admin access yet.
        Ask a super-admin to grant you access, then sign in again.
      </NoAccess>
    )
  }

  return (
    <AdminShell
      title={<CompetitionBrand href="/admin" />}
      groups={[SITE_GROUP]}
      onSignOut={handleSignOut}
    >
      <Outlet />
    </AdminShell>
  )
}
