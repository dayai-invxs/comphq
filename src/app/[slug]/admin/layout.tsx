'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ComphqLogo } from '@/components/ComphqLogo'

export default function CompetitionAdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { slug } = useParams<{ slug: string }>()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (!session) return null

  const base = `/${slug}/admin`
  const navLinks = [
    { href: base, label: 'Dashboard' },
    { href: `${base}/leaderboard`, label: 'Leaderboard' },
    { href: `${base}/athletes`, label: 'Athletes' },
    { href: `${base}/workouts`, label: 'Workouts' },
    { href: `${base}/divisions`, label: 'Divisions' },
  ]

  const logo = logoUrl ? (
    <Image src={logoUrl} alt="Competition logo" width={120} height={60} className="max-h-10 w-auto object-contain" unoptimized />
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
            <Link href={`/${slug}`} target="_blank" className="text-xs text-gray-500 hover:text-gray-300">Public View</Link>
            <Link href={`/${slug}/ops`} target="_blank" className="text-xs text-gray-500 hover:text-gray-300">Ops View</Link>
            <Link href={`/${slug}/athlete-control`} target="_blank" className="text-xs text-gray-500 hover:text-gray-300">Athlete Control</Link>
            <Link href="/admin/users" className="text-xs text-gray-500 hover:text-gray-300">Users</Link>
            <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-300">All Competitions</Link>
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-xs text-gray-400 hover:text-white transition-colors">
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
              <Link href={`/${slug}`} target="_blank" className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Public View</Link>
              <Link href={`/${slug}/ops`} target="_blank" className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Ops View</Link>
              <Link href={`/${slug}/athlete-control`} target="_blank" className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">Athlete Control</Link>
              <Link href="/admin" className="px-2 py-2 text-sm text-gray-500 hover:text-gray-300">All Competitions</Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
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
