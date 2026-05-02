'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { getJson, postJson, putJson, delJson } from '@/lib/http'

type Division = { id: number; name: string; order: number }
type VolunteerRole = { id: number; name: string }
type WorkoutLocation = { id: number; name: string }

export default function SetupPage() {
  const { slug } = useParams<{ slug: string }>()

  // ─── Divisions ───────────────────────────────────────────────────────────
  const [divisions, setDivisions] = useState<Division[]>([])
  const [newDivName, setNewDivName] = useState('')
  const [newDivOrder, setNewDivOrder] = useState('')
  const [editingDivId, setEditingDivId] = useState<number | null>(null)
  const [editDivName, setEditDivName] = useState('')
  const [editDivOrder, setEditDivOrder] = useState('')

  // ─── Volunteer Roles ─────────────────────────────────────────────────────
  const [roles, setRoles] = useState<VolunteerRole[]>([])
  const [newRoleName, setNewRoleName] = useState('')
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null)
  const [editRoleName, setEditRoleName] = useState('')

  // ─── Workout Locations ─────────────────────────────────────────────────
  const [locations, setLocations] = useState<WorkoutLocation[]>([])
  const [newLocationName, setNewLocationName] = useState('')
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null)
  const [editLocationName, setEditLocationName] = useState('')

  // ─── Competition Settings ─────────────────────────────────────────────
  const [showBib, setShowBib] = useState(true)
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<'per_heat' | 'per_workout'>('per_workout')
  const [judgePassword, setJudgePassword] = useState('rug702')
  const [judgeMaxConsecutive, setJudgeMaxConsecutive] = useState(3)

  // ─── TV Leaderboard ───────────────────────────────────────────────────
  const [tvPercentages, setTvPercentages] = useState<Record<string, number>>({})
  const [tvOrder, setTvOrder] = useState<Record<string, number>>({})

  // ─── Competition Logo ─────────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<T>(label: string, op: () => Promise<T>): Promise<T | undefined> {
    setError(null)
    try {
      return await op()
    } catch (e) {
      setError(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    }
  }

  const load = useCallback(async () => {
    await run('Load', async () => {
      const [divData, roleData, locData, settings, logo] = await Promise.all([
        getJson<Division[]>(`/api/divisions?slug=${slug}`),
        getJson<VolunteerRole[]>(`/api/volunteer-roles?slug=${slug}`),
        getJson<WorkoutLocation[]>(`/api/workout-locations?slug=${slug}`),
        getJson<{
          showBib: boolean
          leaderboardVisibility?: 'per_heat' | 'per_workout'
          tvLeaderboardPercentages?: Record<string, number>
          tvLeaderboardOrder?: Record<string, number>
          judgePassword?: string
          judgeMaxConsecutive?: number
        }>(`/api/settings?slug=${slug}`),
        getJson<{ url: string | null }>('/api/logo'),
      ])
      setDivisions(divData)
      setRoles(roleData)
      setLocations(locData)
      setShowBib(settings.showBib)
      setLeaderboardVisibility(settings.leaderboardVisibility ?? 'per_workout')
      setTvPercentages(settings.tvLeaderboardPercentages ?? {})
      setTvOrder(settings.tvLeaderboardOrder ?? {})
      if (settings.judgePassword) setJudgePassword(settings.judgePassword)
      if (settings.judgeMaxConsecutive != null) setJudgeMaxConsecutive(settings.judgeMaxConsecutive)
      setLogoUrl(logo.url)
    })
  }, [slug])

  useEffect(() => { void load() }, [load])

  // ─── Division handlers ────────────────────────────────────────────────────

  async function addDivision(e: React.FormEvent) {
    e.preventDefault()
    if (!newDivName.trim() || !newDivOrder) return
    setLoading(true)
    await run('Add division', () =>
      postJson('/api/divisions', { slug, name: newDivName.trim(), order: Number(newDivOrder) }),
    )
    setNewDivName(''); setNewDivOrder('')
    await load()
    setLoading(false)
  }

  async function saveDivision(id: number) {
    await run('Save division', () =>
      putJson(`/api/divisions/${id}?slug=${slug}`, { name: editDivName.trim(), order: Number(editDivOrder) }),
    )
    setEditingDivId(null)
    await load()
  }

  async function moveDivision(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= divisions.length) return
    const a = divisions[fromIndex]
    const b = divisions[toIndex]
    await run('Reorder division', () => Promise.all([
      putJson(`/api/divisions/${a.id}?slug=${slug}`, { order: b.order }),
      putJson(`/api/divisions/${b.id}?slug=${slug}`, { order: a.order }),
    ]))
    await load()
  }

  async function removeDivision(id: number, name: string) {
    if (!confirm(`Delete division "${name}"? Athletes in this division will be unassigned.`)) return
    const ok = await run('Delete division', () => delJson(`/api/divisions/${id}?slug=${slug}`))
    if (ok !== undefined) setDivisions((prev) => prev.filter((d) => d.id !== id))
  }

  // ─── Workout Location handlers ────────────────────────────────────────────

  async function addLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!newLocationName.trim()) return
    setLoading(true)
    await run('Add location', () =>
      postJson('/api/workout-locations', { slug, name: newLocationName.trim() }),
    )
    setNewLocationName('')
    await load()
    setLoading(false)
  }

  async function saveLocation(id: number) {
    await run('Save location', () =>
      putJson(`/api/workout-locations/${id}?slug=${slug}`, { name: editLocationName.trim() }),
    )
    setEditingLocationId(null)
    await load()
  }

  async function removeLocation(id: number, name: string) {
    if (!confirm(`Delete location "${name}"? Workouts assigned to this location will be unassigned.`)) return
    const ok = await run('Delete location', () => delJson(`/api/workout-locations/${id}?slug=${slug}`))
    if (ok !== undefined) setLocations((prev) => prev.filter((l) => l.id !== id))
  }

  // ─── Volunteer Role handlers ──────────────────────────────────────────────

  async function addRole(e: React.FormEvent) {
    e.preventDefault()
    if (!newRoleName.trim()) return
    setLoading(true)
    await run('Add role', () =>
      postJson('/api/volunteer-roles', { slug, name: newRoleName.trim() }),
    )
    setNewRoleName('')
    await load()
    setLoading(false)
  }

  async function saveRole(id: number) {
    await run('Save role', () =>
      putJson(`/api/volunteer-roles/${id}?slug=${slug}`, { name: editRoleName.trim() }),
    )
    setEditingRoleId(null)
    await load()
  }

  async function removeRole(id: number, name: string) {
    if (!confirm(`Delete volunteer role "${name}"?`)) return
    const ok = await run('Delete role', () => delJson(`/api/volunteer-roles/${id}?slug=${slug}`))
    if (ok !== undefined) setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  // ─── Competition Settings handlers ───────────────────────────────────────

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

  async function saveJudgeMaxConsecutive(value: number) {
    if (value < 1 || value > 20) return
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, judgeMaxConsecutive: value }),
    })
  }

  // ─── TV Leaderboard handlers ──────────────────────────────────────────────

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

  // ─── Logo handlers ────────────────────────────────────────────────────────

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

  return (
    <div className="space-y-12 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Setup</h1>
        <p className="text-gray-400 mt-1">Competition structure and roles</p>
      </div>

      {error && (
        <div role="alert" className="bg-red-950 border border-red-900 text-red-200 rounded-lg px-4 py-3 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200 underline">dismiss</button>
        </div>
      )}

      {/* ── Competition Settings ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Competition Settings</h2>
        <div className="bg-gray-900 rounded-xl p-6 space-y-4">
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
          <div>
            <label className="block text-sm text-white font-medium mb-1">Max Consecutive Heats (Judges)</label>
            <p className="text-xs text-gray-500 mb-2">Assignments exceeding this limit are highlighted in the judge schedule view.</p>
            <input
              type="number"
              min={1}
              max={20}
              value={judgeMaxConsecutive}
              onChange={e => setJudgeMaxConsecutive(Number(e.target.value))}
              onBlur={e => saveJudgeMaxConsecutive(Number(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
              className="w-24 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </section>

      {/* ── Competition Logo ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Competition Logo</h2>
        <div className="bg-gray-900 rounded-xl p-6">
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
      </section>

      {/* ── TV Leaderboard ─────────────────────────────────────────────────── */}
      {divisions.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">TV Leaderboard</h2>
            <p className="text-gray-400 text-sm mt-0.5">Set display order and % of top athletes shown per division</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6">
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
        </section>
      )}

      {/* ── Divisions ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Divisions</h2>
          <p className="text-gray-400 text-sm mt-0.5">Division order determines the heat running order — lower order runs first.</p>
        </div>

        {divisions.length > 0 && (
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium w-24">Order</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Name</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {divisions.map((d) =>
                  editingDivId === d.id ? (
                    <tr key={d.id} className="border-t border-gray-800 bg-gray-800/40">
                      <td className="px-3 py-2">
                        <input type="number" value={editDivOrder} onChange={(e) => setEditDivOrder(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveDivision(d.id); if (e.key === 'Escape') setEditingDivId(null) }}
                          className="w-16 bg-gray-700 text-white rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </td>
                      <td className="px-3 py-2">
                        <input autoFocus type="text" value={editDivName} onChange={(e) => setEditDivName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveDivision(d.id); if (e.key === 'Escape') setEditingDivId(null) }}
                          className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => saveDivision(d.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                          <button onClick={() => setEditingDivId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={d.id} className="border-t border-gray-800">
                      <td className="px-3 py-2">
                        <select
                          value={divisions.indexOf(d) + 1}
                          onChange={(e) => moveDivision(divisions.indexOf(d), Number(e.target.value) - 1)}
                          className="bg-gray-800 text-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          {divisions.map((_, i) => (
                            <option key={i} value={i + 1}>{i + 1}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3 text-white font-medium">{d.name}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-4">
                          <button onClick={() => { setEditingDivId(d.id); setEditDivName(d.name); setEditDivOrder(String(d.order)) }} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                          <button onClick={() => removeDivision(d.id, d.name)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-gray-900 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Add Division</h3>
          <form onSubmit={addDivision} className="flex gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Order</label>
              <input type="number" value={newDivOrder}
                onChange={(e) => setNewDivOrder(e.target.value)}
                placeholder={String((divisions[divisions.length - 1]?.order ?? 0) + 1)}
                className="w-20 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input type="text" value={newDivName} onChange={(e) => setNewDivName(e.target.value)}
                placeholder="e.g. RX, Scaled, Masters"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={loading || !newDivName.trim() || !newDivOrder}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors">
                Add
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Workout Locations ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Workout Locations</h2>
          <p className="text-gray-400 text-sm mt-0.5">Define the venues or areas where workouts take place.</p>
        </div>

        {locations.length > 0 && (
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Location</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {locations.map((l) =>
                  editingLocationId === l.id ? (
                    <tr key={l.id} className="border-t border-gray-800 bg-gray-800/40">
                      <td className="px-3 py-2">
                        <input autoFocus type="text" value={editLocationName} onChange={(e) => setEditLocationName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveLocation(l.id); if (e.key === 'Escape') setEditingLocationId(null) }}
                          className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => saveLocation(l.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                          <button onClick={() => setEditingLocationId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={l.id} className="border-t border-gray-800">
                      <td className="px-5 py-3 text-white font-medium">{l.name}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-4">
                          <button onClick={() => { setEditingLocationId(l.id); setEditLocationName(l.name) }} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                          <button onClick={() => removeLocation(l.id, l.name)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-gray-900 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Add Location</h3>
          <form onSubmit={addLocation} className="flex gap-3">
            <input type="text" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="e.g. Main Floor, Turf Field, Parking Lot"
              className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            <button type="submit" disabled={loading || !newLocationName.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors">
              Add
            </button>
          </form>
        </div>
      </section>

      {/* ── Volunteer Roles ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Volunteer Roles</h2>
          <p className="text-gray-400 text-sm mt-0.5">Define the roles available for volunteers at this competition.</p>
        </div>

        {roles.length > 0 && (
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Role</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {roles.map((r) =>
                  editingRoleId === r.id ? (
                    <tr key={r.id} className="border-t border-gray-800 bg-gray-800/40">
                      <td className="px-3 py-2">
                        <input autoFocus type="text" value={editRoleName} onChange={(e) => setEditRoleName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRole(r.id); if (e.key === 'Escape') setEditingRoleId(null) }}
                          className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => saveRole(r.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                          <button onClick={() => setEditingRoleId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="border-t border-gray-800">
                      <td className="px-5 py-3 text-white font-medium">{r.name}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-4">
                          <button onClick={() => { setEditingRoleId(r.id); setEditRoleName(r.name) }} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                          <button onClick={() => removeRole(r.id, r.name)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-gray-900 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Add Volunteer Role</h3>
          <form onSubmit={addRole} className="flex gap-3">
            <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Judge, Timer, Scorekeeper"
              className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            <button type="submit" disabled={loading || !newRoleName.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors">
              Add
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
