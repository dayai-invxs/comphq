'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Competition = { id: number; name: string; slug: string }

export default function AdminHome() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function load() {
    const res = await fetch('/api/competitions')
    if (res.ok) setCompetitions(await res.json())
  }

  useEffect(() => { void load() }, [])

  function deriveSlug(n: string) {
    return n.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch('/api/competitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), slug }),
    })
    setLoading(false)
    if (res.ok) {
      const comp: Competition = await res.json()
      router.push(`/${comp.slug}/admin`)
    } else {
      setError(await res.text())
    }
  }

  async function remove(comp: Competition) {
    if (!confirm(`Delete "${comp.name}"? This cannot be undone.`)) return
    await fetch(`/api/competitions/${comp.id}`, { method: 'DELETE' })
    setCompetitions((prev) => prev.filter((c) => c.id !== comp.id))
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Competitions</h1>
        <p className="text-gray-400 mt-1">Select a competition to manage, or create a new one.</p>
      </div>

      {competitions.length > 0 && (
        <div className="space-y-2">
          {competitions.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-gray-900 rounded-xl px-5 py-4">
              <div>
                <Link
                  href={`/${c.slug}/admin`}
                  className="font-semibold text-white hover:text-orange-400 transition-colors"
                >
                  {c.name}
                </Link>
                <p className="text-gray-500 text-xs mt-0.5">/{c.slug}</p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/${c.slug}`} target="_blank" className="text-xs text-gray-400 hover:text-white transition-colors">Competition Schedule</Link>
                <Link
                  href={`/${c.slug}/admin`}
                  className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  Manage
                </Link>
                <button
                  onClick={() => remove(c)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6 max-w-md">
        <h2 className="text-lg font-semibold text-white mb-4">New Competition</h2>
        <form onSubmit={create} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Competition Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSlug(deriveSlug(e.target.value)) }}
              placeholder="e.g. Rugged Rumble 2026"
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">URL Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">comphq.pro/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="rugged-rumble-2026"
                className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name.trim() || !slug.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            {loading ? 'Creating...' : 'Create Competition'}
          </button>
        </form>
      </div>

      <div className="pt-4 border-t border-gray-800">
        <Link href="/admin/users" className="text-sm text-gray-400 hover:text-white transition-colors">
          Manage Users →
        </Link>
        <p className="text-xs text-gray-600 mt-1">Super-admin only.</p>
      </div>
    </div>
  )
}
