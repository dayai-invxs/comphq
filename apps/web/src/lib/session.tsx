import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

// Who is signed in, for the whole app.
//
// v1 asked per layout: both admin layouts called auth.getUser() in their own
// effect, and the competition one also subscribed to onAuthStateChange. That
// is one round trip per shell mount, and the two disagreed about what a
// sign-out in another tab meant. One provider answers once.
//
// getUser rather than getSession, as v1 had it: getSession reads local storage
// and will hand back a token the auth server has already revoked, while
// getUser validates it. A gate is exactly the place that difference matters.

interface SessionValue {
  user: User | null
  /** True until the first answer lands. A gate that redirects while this is
      true sends a signed-in user to /login on every reload. */
  loading: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseClient()

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setUser(data.user ?? null)
      setLoading(false)
    })

    // Token refresh, sign-out in another tab, and the magic-link callback all
    // arrive here rather than through another getUser call.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    await getSupabaseClient().auth.signOut()
  }, [])

  const value = useMemo<SessionValue>(() => ({ user, loading, signOut }), [user, loading, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider')
  return ctx
}
