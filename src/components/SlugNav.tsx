'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ComphqLogo } from '@/components/ComphqLogo'

export function SlugNav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const navLinks = [
    { href: `/${slug}`, label: 'Competition Schedule' },
    { href: `/${slug}/leaderboard`, label: 'Leaderboard' },
    { href: `/${slug}/athlete-overview`, label: 'Athlete Overview' },
    { href: `/${slug}/judges`, label: 'Judges' },
    { href: `/${slug}/control`, label: 'Control' },
    { href: `/${slug}/admin`, label: 'Admin' },
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
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="shrink-0">{logo}</div>

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
        </div>
      )}
    </nav>
  )
}
