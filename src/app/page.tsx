'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ComphqLogo } from '@/components/ComphqLogo'

type Competition = { id: number; name: string; slug: string }

export default function WelcomePage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [search, setSearch] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/competitions').then((r) => r.json()).then(setCompetitions)
  }, [])

  const filtered = competitions.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 mb-4"><ComphqLogo /></div>
          <h1 className="text-3xl font-bold text-white">comphq</h1>
          <p className="text-gray-400 mt-2 text-sm">Competition management</p>
        </div>

        {competitions.length > 0 && (
          <>
            <input
              type="search"
              placeholder="Search competitions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 mb-4"
            />

            <div className="space-y-2">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/${c.slug}`)}
                  className="w-full text-left bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
                >
                  <div className="font-semibold text-white">{c.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">comphq.pro/{c.slug}</div>
                </button>
              ))}
              {filtered.length === 0 && search && (
                <p className="text-center text-gray-500 py-6 text-sm">No competitions found.</p>
              )}
            </div>
          </>
        )}

        {competitions.length === 0 && (
          <p className="text-center text-gray-500 text-sm">No competitions yet.</p>
        )}
      </div>
    </main>
  )
}
