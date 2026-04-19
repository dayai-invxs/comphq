'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
  }, [])

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  if (!session) return null

  const navLinks = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/leaderboard', label: 'Leaderboard' },
    { href: '/admin/athletes', label: 'Athletes' },
    { href: '/admin/workouts', label: 'Workouts' },
    { href: '/admin/divisions', label: 'Divisions' },
    { href: '/admin/users', label: 'Users' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Competition logo"
              width={120}
              height={60}
              className="max-h-14 w-auto object-contain"
              unoptimized
            />
          ) : (
            <span className="text-orange-400 font-bold text-lg">CF Admin</span>
          )}
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
        <div className="flex items-center gap-4">
          <Link href="/" target="_blank" className="text-xs text-gray-500 hover:text-gray-300">
            Public View
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
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
