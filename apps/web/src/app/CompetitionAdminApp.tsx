import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { Text } from '@mond-design-system/react'
import { useMyCompetitions } from '@/api/competitions'
import { useMe } from '@/api/session'
import { CompetitionBrand } from '@/components/CompetitionBrand/CompetitionBrand'
import { useSession } from '@/lib/session'
import { AdminShell } from '@/layouts/AdminShell'
import { Booting, GateFailed, NoAccess } from './GateStates'
import { loginPath } from './loginPath'
import { SITE_GROUP } from './siteNav'

// The admin shell for one competition, ported from v1's
// src/app/[slug]/admin/layout.tsx.
//
// Two things are decided here and nowhere else: whether this user may see this
// competition at all, and whether they are its admin rather than one of its
// scorekeepers. Only the second is a matter of degree — v1 lets a role='user'
// member mutate athletes, workouts and scores (defect 3), and gates just the
// Users screen on role='admin'.
export function CompetitionAdminApp() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { pathname } = useLocation()
  const { user, loading, signOut } = useSession()
  const navigate = useNavigate()

  const me = useMe(!!user)
  const mine = useMyCompetitions(!!user)

  const membership = mine.data?.find((c) => c.slug === slug)
  const isSuper = me.data?.isSuper === true
  const waiting = me.isPending || mine.isPending

  // A failed read is neither an answer nor a refusal: 'forbidden' is only
  // reachable once both reads have answered and neither authorizes.
  const status = loading || (user && waiting)
    ? 'loading'
    : !user
      ? 'unauthenticated'
      : isSuper || membership
        ? 'authorized'
        : me.error || mine.error
          ? 'error'
          : 'forbidden'

  // A super admin administers every competition; a member does so only with
  // role='admin'.
  const isCompAdmin = isSuper || membership?.role === 'admin'

  useEffect(() => {
    if (status === 'unauthenticated') navigate(loginPath(pathname))
  }, [status, pathname, navigate])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  if (status === 'loading' || status === 'unauthenticated') return <Booting label="Checking access" />

  if (status === 'error') {
    return (
      <GateFailed
        onRetry={() => { void me.refetch(); void mine.refetch() }}
        onSignOut={handleSignOut}
      />
    )
  }

  if (status === 'forbidden') {
    return (
      <NoAccess title="No access to this competition" onSignOut={handleSignOut}>
        Your account doesn&apos;t have access to{' '}
        <Text as="strong" tone="primary">{slug}</Text>. Ask a competition admin or a
        super-admin to grant you access.
      </NoAccess>
    )
  }

  const base = `/${slug}/admin`
  const title = <CompetitionBrand href="/admin" />

  return (
    <AdminShell
      title={title}
      groups={[
        {
          label: 'Run',
          items: [
            { to: base, label: 'Dashboard', icon: 'dashboard' },
            { to: `${base}/workouts`, label: 'Workouts', icon: 'workouts' },
            { to: `${base}/leaderboard`, label: 'Leaderboard', icon: 'leaderboard' },
          ],
        },
        {
          label: 'People',
          items: [
            { to: `${base}/people`, label: 'People', icon: 'people' },
            ...(isCompAdmin
              ? [{ to: `${base}/users`, label: 'Users', icon: 'users' as const }]
              : []),
          ],
        },
        {
          label: 'Setup',
          items: [{ to: `${base}/setup`, label: 'Setup', icon: 'setup' }],
        },
        // Last, because a super admin is here to run this competition; the
        // site screens are the way back out, not the work.
        ...(isSuper ? [SITE_GROUP] : []),
      ]}
      extras={[
        { to: `/${slug}`, label: 'Competition Schedule', icon: 'schedule' },
        { to: `/${slug}/athlete-overview`, label: 'Athlete Overview', icon: 'athletes' },
        { to: `/${slug}/judges`, label: 'Judges', icon: 'judges' },
        { to: `/${slug}/equipment`, label: 'Equipment', icon: 'equipment' },
        { to: `/${slug}/control`, label: 'Control', icon: 'control' },
      ]}
      onSignOut={handleSignOut}
    >
      <Outlet />
    </AdminShell>
  )
}
