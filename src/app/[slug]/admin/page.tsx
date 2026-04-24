'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { statusStyle } from '@/lib/workoutEnums'

type Workout = { id: number; number: number; name: string; status: string; lanes: number }

export default function CompetitionDashboard() {
  const { slug } = useParams<{ slug: string }>()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [athleteCount, setAthleteCount] = useState(0)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(false)
  const [showBib, setShowBib] = useState(true)
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<'per_heat' | 'per_workout'>('per_workout')
  const [divisions, setDivisions] = useState<{ id: number; name: string }[]>([])
  const [tvPercentages, setTvPercentages] = useState<Record<string, number>>({})
  const [tvOrder, setTvOrder] = useState<Record<string, number>>({})
  const [judgePassword, setJudgePassword] = useState('rug702')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/workouts?slug=${slug}`).then((r) => r.json()).then(setWorkouts)
    fetch(`/api/athletes?slug=${slug}`).then((r) => r.json()).then((a) => setAthleteCount(a.length))
    fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
    fetch(`/api/settings?slug=${slug}`).then((r) => r.json()).then((d) => {
      setShowBib(d.showBib)
      setLeaderboardVisibility(d.leaderboardVisibility ?? 'per_workout')
      setTvPercentages(d.tvLeaderboardPercentages ?? {})
      setTvOrder(d.tvLeaderboardOrder ?? {})
      if (d.judgePassword) setJudgePassword(d.judgePassword)
    })
    fetch(`/api/divisions?slug=${slug}`).then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setDivisions(d.map((div: { id: number; name: string }) => ({ id: div.id, name: div.name })))
    })
  }, [slug])

  async function toggleShowBib() {
    const next = !showBib
    setShowBib(next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, showBib: next }),
    })
  }

  async function toggleLeaderboardVisibility() {
    const next: 'per_heat' | 'per_workout' = leaderboardVisibility === 'per_workout' ? 'per_heat' : 'per_workout'
    setLeaderboardVisibility(next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, leaderboardVisibility: next }),
    })
  }

  async function saveJudgePassword(value: string) {
    if (!value.trim()) return
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, judgePassword: value.trim() }),
    })
  }

  async function saveTvPercentages(next: Record<string, number>) {
    setTvPercentages(next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, tvLeaderboardPercentages: next }),
    })
  }

  async function saveTvOrder(next: Record<string, number>) {
    setTvOrder(next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, tvLeaderboardOrder: next }),
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoLoading(true)
    const fd = new FormData()
    fd.append('logo', file)
    const res = await fetch('/api/logo', { method: 'POST', body: fd })
    if (res.ok) {
      const { url } = await res.json()
      setLogoUrl(url + '?t=' + Date.now())
    }
    setLogoLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function removeLogo() {
    setLogoLoading(true)
    await fetch('/api/logo', { method: 'DELETE' })
    setLogoUrl(null)
    setLogoLoading(false)
  }

  const base = `/${slug}/admin`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Competition overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="text-3xl font-bold text-orange-400">{athleteCount}</div>
          <div className="text-sm text-gray-400 mt-1">Athletes</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="text-3xl font-bold text-orange-400">{workouts.length}</div>
          <div className="text-sm text-gray-400 mt-1">Workouts</div>
        </div>
      </div>

      {workouts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Workouts</h2>
          <div className="space-y-2 max-w-2xl">
            {workouts.map((w) => (
              <Link
                key={w.id}
                href={`${base}/workouts/${w.id}`}
                className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
              >
                <div>
                  <span className="font-semibold text-white">WOD {w.number}: {w.name}</span>
                  <span className="text-gray-400 text-sm ml-3">{w.lanes} lanes</span>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyle(w.status).className}`}>
                  {statusStyle(w.status).label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-wrap">
        <Link href={`${base}/people`} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors">
          Manage Athletes
        </Link>
        <Link href={`${base}/workouts`} className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors">
          Manage Workouts
        </Link>
        <a
          href={`/api/export?slug=${slug}`}
          download
          className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
        >
          Export (CSV)
        </a>
        <a
          href={`/api/export/zip?slug=${slug}`}
          download
          className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
          title="Per-table CSVs + JSON manifest, zipped"
        >
          Export (ZIP)
        </a>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 max-w-sm space-y-4">
        <h2 className="text-lg font-semibold text-white">Competition Settings</h2>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={toggleShowBib}
            className={`relative w-10 h-6 rounded-full transition-colors ${showBib ? 'bg-orange-500' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${showBib ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <div>
            <span className="text-sm text-white font-medium">Show Bib Numbers</span>
            <p className="text-xs text-gray-500">Display bib numbers on the public schedule</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={toggleLeaderboardVisibility}
            className={`relative w-10 h-6 rounded-full transition-colors ${leaderboardVisibility === 'per_heat' ? 'bg-orange-500' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${leaderboardVisibility === 'per_heat' ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <div>
            <span className="text-sm text-white font-medium">Live Leaderboard</span>
            <p className="text-xs text-gray-500">
              {leaderboardVisibility === 'per_heat'
                ? 'Leaderboard updates after each completed heat'
                : 'Leaderboard only shows after a full workout is completed'}
            </p>
          </div>
        </label>
        <div>
          <label className="block text-sm text-white font-medium mb-1">Judge Screen Password</label>
          <p className="text-xs text-gray-500 mb-2">Required to open the judge schedule. Admins are never prompted.</p>
          <input
            type="text"
            value={judgePassword}
            onChange={e => setJudgePassword(e.target.value)}
            onBlur={e => saveJudgePassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
            className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {divisions.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6 max-w-sm">
          <h2 className="text-lg font-semibold text-white mb-1">TV Leaderboard</h2>
          <p className="text-xs text-gray-500 mb-4">Set display order and % of top athletes shown per division</p>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-3">
            <span className="text-xs text-gray-500">Division</span>
            <span className="text-xs text-gray-500 text-center">Position</span>
            <span className="text-xs text-gray-500 text-center">Show</span>
            {divisions.map((div) => (
              <>
                <span key={`${div.id}-name`} className="text-sm text-white truncate">{div.name}</span>
                <select
                  key={`${div.id}-order`}
                  value={tvOrder[div.name] ?? ''}
                  onChange={(e) => {
                    const next = e.target.value ? { ...tvOrder, [div.name]: Number(e.target.value) } : Object.fromEntries(Object.entries(tvOrder).filter(([k]) => k !== div.name))
                    saveTvOrder(next)
                  }}
                  className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-2 py-1 focus:outline-none focus:border-orange-500"
                >
                  <option value="">—</option>
                  {divisions.map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <div key={`${div.id}-pct`} className="flex items-center gap-1 justify-end">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={tvPercentages[div.name] ?? 100}
                    onChange={(e) => setTvPercentages((prev) => ({ ...prev, [div.name]: Number(e.target.value) }))}
                    onBlur={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)))
                      saveTvPercentages({ ...tvPercentages, [div.name]: val })
                    }}
                    className="w-14 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-2 py-1 text-right focus:outline-none focus:border-orange-500"
                  />
                  <span className="text-gray-400 text-sm">%</span>
                </div>
              </>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6 max-w-sm">
        <h2 className="text-lg font-semibold text-white mb-4">Competition Logo</h2>
        {logoUrl ? (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-center h-24">
              <Image src={logoUrl} alt="Competition logo" width={160} height={80} className="max-h-20 w-auto object-contain" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => fileInputRef.current?.click()} disabled={logoLoading} className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Replace</button>
              <button onClick={removeLogo} disabled={logoLoading} className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-sm font-medium rounded-lg px-4 py-2 transition-colors">Remove</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileInputRef.current?.click()} disabled={logoLoading} className="w-full border-2 border-dashed border-gray-700 hover:border-orange-500 disabled:opacity-50 rounded-xl p-6 text-gray-400 hover:text-orange-400 text-sm transition-colors text-center">
            {logoLoading ? 'Uploading...' : 'Click to upload logo'}
            <div className="text-xs text-gray-600 mt-1">PNG, JPG, SVG, WebP</div>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
      </div>
    </div>
  )
}
