import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { Booting } from './GateStates'
import { loginPath } from './loginPath'

// v1's control page was a server component that called auth.getUser() and
// redirect()ed a signed-out visitor to the login screen before rendering
// anything. It is the one public-side page that asks for a session at all.
//
// A redirect issued by a server leaves no history entry to go back to, so this
// replaces rather than pushes: pressing Back from the login screen should
// return to wherever the visitor came from, not to the page that just bounced
// them.
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (!loading && !user) navigate(loginPath(pathname), { replace: true })
  }, [loading, user, pathname, navigate])

  // Waiting and leaving look the same on purpose: drawing the page for the
  // instant before the redirect lands would show it to someone signed out.
  if (loading || !user) return <Booting label="Checking access" />

  return <>{children}</>
}
