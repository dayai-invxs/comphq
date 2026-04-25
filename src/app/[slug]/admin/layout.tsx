'use client'

import { useRouter, usePathname, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'
import { ComphqLogo } from '@/components/ComphqLogo'

export default function CompetitionAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { slug } = useParams<{ slug: string }>()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  // 'authorized' = user is super OR admin of this specific comp.
  // 'forbidden'  = logged in but NOT authorized for this comp.
  const [status, setStatus] = useState<
    'loading' | 'authorized' | 'forbidden' | 'unauthenticated'
  >('loading')

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseClient()
    ;(async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!u) { setStatus('unauthenticated'); return }
      setUser(u)

      // Check super OR admin-of-this-slug. /api/competitions returns only
      // comps the caller can admin; if `slug` is in that list, they're in.
      const [meRes, compsRes] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }),
        fetch('/api/competitions', { cache: 'no-store' }),
      ])
      if (cancelled) return
      if (meRes.ok) {
        const me = await meRes.json() as { isSuper: boolean }
        if (me.isSuper) { setStatus('authorized'); return }
      }
      if (compsRes.ok) {
        const comps = await compsRes.json() as { slug: string }[]
        if (comps.some((c) => c.slug === slug)) { setStatus('authorized'); return }
      }
      setStatus('forbidden')
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) setStatus('unauthenticated')
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [slug])

  useEffect(() => {
    if (status === 'unauthenticated') router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  async function signOut() {
    await getSupabaseClient().auth.signOut()
    router.push('/login')
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  }

  if (status === 'forbidden') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <h1 className="text-2xl font-bold text-white">No access to this competition</h1>
        <p className="text-gray-400 max-w-md">
          Your account isn&apos;t an admin of <span className="text-white">{slug}</span>.
          Ask a super-admin to grant you access.
        </p>
        <button onClick={signOut} className="text-sm text-orange-400 hover:text-orange-300">Sign out</button>
      </div>
    )
  }

  if (!user) return null

  const base = `/${slug}/admin`
  const navLinks = [
    { href: base, label: 'Dashboard' },
    { href: `${base}/leaderboard`, label: 'Leaderboard' },
    { href: `${base}/people`, label: 'People' },
    { href: `${base}/workouts`, label: 'Workouts' },
    { href: `${base}/setup`, label: 'Setup' },
  ]

  const logo = logoUrl ? (
    <Image src={logoUrl} alt="Competition logo" width={120} height={60} className="max-h-10 w-auto object-contain" />
  ) : (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10"><ComphqLogo /></div>
      <span className="text-orange-400 font-bold text-lg">comphq</span>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="shrink-0">{logo}</Link>

          <div className="hidden lg:flex items-center gap-6 ml-6">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium transition-colors ${
                  pathname === l.href ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4 ml-auto">
            <Link href={`/${slug}`} className="text-xs text-gray-500 hover:text-gray-300">Competition Schedule</Link>
            <Link href={`/${slug}/athlete-overview`} className="text-xs text-gray-500 hover:text-gray-300">Athlete Overview</Link>
            <Link href={`/${slug}/judges`} className="text-xs text-gray-500 hover:text-gray-300">Judges</Link>
            <Link href={`/${slug}/equipment`} className="text-xs text-gray-500 hover:text-gray-300">Equipment</Link>
            <Link href={`/${slug}/control`} className="text-xs text-gray-500 hover:text-gray-300">Control</Link>
            <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-white transition-colors">
              Sign out
            </button>
          </div>

          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="lg:hidden ml-auto p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden mt-3 pb-2 flex flex-col gap-1 border-t border-gray-800 pt-3">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2 py-2 rounded text-sm font-medium transition-colors ${
                  pathname === l.href ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="border-t border-gray-800 mt-2 pt-2 flex flex-col gap-1">
              <Link href={`/${slug}`} className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Competition Schedule</Link>
              <Link href={`/${slug}/athlete-overview`} className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Athlete Overview</Link>
              <Link href={`/${slug}/judges`} className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Judges</Link>
              <Link href={`/${slug}/equipment`} className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Equipment</Link>
              <Link href={`/${slug}/control`} className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Control</Link>
              <button
                onClick={() => signOut()}
                className="px-2 py-2 text-left text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  )
}
