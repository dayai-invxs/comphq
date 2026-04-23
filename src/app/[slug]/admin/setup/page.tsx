'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
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
      const [divData, roleData, locData] = await Promise.all([
        getJson<Division[]>(`/api/divisions?slug=${slug}`),
        getJson<VolunteerRole[]>(`/api/volunteer-roles?slug=${slug}`),
        getJson<WorkoutLocation[]>(`/api/workout-locations?slug=${slug}`),
      ])
      setDivisions(divData)
      setRoles(roleData)
      setLocations(locData)
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
                  <th className="text-left px-5 py-3 text-gray-400 font-medium w-16">Order</th>
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
                      <td className="px-5 py-3 text-orange-400 font-bold">{d.order}</td>
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
