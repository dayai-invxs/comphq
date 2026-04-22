'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase-client'
import { ComphqLogo } from '@/components/ComphqLogo'

/**
 * The /admin site dashboard is super-admin-only. Regular admins (users
 * who are CompetitionAdmin on one or more comps) go directly to
 * /{slug}/admin and never see this layout.
 *
 * Non-super authed users who land here are redirected to their first
 * accessible comp's admin page; if they have none, they see an
 * access-denied message.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'super' | 'non-super' | 'unauthenticated'>('loading')
  const [accessibleSlug, setAccessibleSlug] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setStatus('unauthenticated'); return }

      // Fetch profile + accessible comps in parallel.
      const [meRes, compsRes] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }),
        fetch('/api/competitions', { cache: 'no-store' }),
      ])
      if (cancelled) return

      if (meRes.ok) {
        const me = await meRes.json() as { isSuper: boolean }
        if (me.isSuper) {
          setStatus('super')
          return
        }
        // Non-super: fall through to redirect.
      }
      if (compsRes.ok) {
        const comps = await compsRes.json() as { slug: string }[]
        if (comps.length > 0) {
          setAccessibleSlug(comps[0].slug)
        }
      }
      setStatus('non-super')
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent('/admin')}`)
    }
    if (status === 'non-super' && accessibleSlug) {
      router.push(`/${accessibleSlug}/admin`)
    }
  }, [status, accessibleSlug, router])

  async function signOut() {
    await getSupabaseClient().auth.signOut()
    router.push('/login')
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  }

  if (status === 'non-super' && !accessibleSlug) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <h1 className="text-2xl font-bold text-white">Access required</h1>
        <p className="text-gray-400 max-w-md">
          Your account isn&apos;t a super-admin and has no competition admin access yet.
          Ask a super-admin to grant you access, then sign in again.
        </p>
        <button onClick={signOut} className="text-sm text-orange-400 hover:text-orange-300">Sign out</button>
      </div>
    )
  }

  if (status !== 'super') return null

  const isUsers = pathname.startsWith('/admin/users')
  const isCompetitions = pathname === '/admin'

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8"><ComphqLogo /></div>
              <span className="text-orange-400 font-bold text-lg">comphq</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className={`text-sm font-medium transition-colors ${isCompetitions ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Competitions
              </Link>
              <Link
                href="/admin/users"
                className={`text-sm font-medium transition-colors ${isUsers ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Manage Users
              </Link>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  )
}
