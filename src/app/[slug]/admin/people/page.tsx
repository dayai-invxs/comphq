'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getJson, postJson, putJson, delJson } from '@/lib/http'

type Division = { id: number; name: string; order: number }
type VolunteerRole = { id: number; name: string }
type Athlete = { id: number; name: string; bibNumber: string | null; divisionId: number | null; division: Division | null; withdrawn: boolean }
type Volunteer = { id: number; name: string; roleId: number | null; role: VolunteerRole | null }

type Tab = 'athletes' | 'volunteers'

// ─── Shared helpers ────────────────────────────────────────────────────────

function RoleSelect({ value, onChange, className, roles }: { value: string; onChange: (v: string) => void; className?: string; roles: VolunteerRole[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${className ?? ''}`}>
      <option value="">No role</option>
      {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
    </select>
  )
}

function DivisionSelect({ value, onChange, className, divisions }: { value: string; onChange: (v: string) => void; className?: string; divisions: Division[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${className ?? ''}`}>
      <option value="">No division</option>
      {divisions.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
    </select>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const { slug } = useParams<{ slug: string }>()
  const [tab, setTab] = useState<Tab>('athletes')

  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [roles, setRoles] = useState<VolunteerRole[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run<T>(label: string, op: () => Promise<T>): Promise<T | undefined> {
    setError(null)
    try { return await op() }
    catch (e) { setError(`${label}: ${e instanceof Error ? e.message : String(e)}`); return undefined }
  }

  const load = useCallback(async () => {
    await run('Load', async () => {
      const [athleteData, divisionData, volunteerData, roleData] = await Promise.all([
        getJson<Athlete[]>(`/api/athletes?slug=${slug}`),
        getJson<Division[]>(`/api/divisions?slug=${slug}`),
        getJson<Volunteer[]>(`/api/volunteers?slug=${slug}`),
        getJson<VolunteerRole[]>(`/api/volunteer-roles?slug=${slug}`),
      ])
      setAthletes(athleteData)
      setDivisions(divisionData)
      setVolunteers(volunteerData)
      setRoles(roleData)
    })
  }, [slug])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">People</h1>
        <p className="text-gray-400 mt-1">{athletes.length} athletes · {volunteers.length} volunteers</p>
      </div>

      {error && (
        <div role="alert" className="bg-red-950 border border-red-900 text-red-200 rounded-lg px-4 py-3 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200 underline">dismiss</button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-800 pb-0">
        {(['athletes', 'volunteers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t === 'athletes' ? `Athletes (${athletes.length})` : `Volunteers (${volunteers.length})`}
          </button>
        ))}
      </div>

      {tab === 'athletes' && (
        <AthletesTab
          slug={slug}
          athletes={athletes}
          divisions={divisions}
          loading={loading}
          setLoading={setLoading}
          run={run}
          reload={load}
          setAthletes={setAthletes}
        />
      )}

      {tab === 'volunteers' && (
        <VolunteersTab
          slug={slug}
          volunteers={volunteers}
          roles={roles}
          loading={loading}
          setLoading={setLoading}
          run={run}
          reload={load}
          setVolunteers={setVolunteers}
        />
      )}
    </div>
  )
}

// ─── Athletes tab ──────────────────────────────────────────────────────────

type RunFn = <T>(label: string, op: () => Promise<T>) => Promise<T | undefined>

function AthletesTab({
  slug, athletes, divisions, loading, setLoading, run, reload, setAthletes,
}: {
  slug: string
  athletes: Athlete[]
  divisions: Division[]
  loading: boolean
  setLoading: (v: boolean) => void
  run: RunFn
  reload: () => Promise<void>
  setAthletes: React.Dispatch<React.SetStateAction<Athlete[]>>
}) {
  const [name, setName] = useState('')
  const [bib, setBib] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkDivisionId, setBulkDivisionId] = useState('')
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState({ name: '', bib: '', divisionId: '' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [confirmActionId, setConfirmActionId] = useState<{ id: number; type: 'withdraw' | 'unwithdraw' } | null>(null)
  const [swapFromId, setSwapFromId] = useState<number | null>(null)
  const [swapToId, setSwapToId] = useState('')

  async function addOne(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await run('Add athlete', () => postJson('/api/athletes', { slug, name: name.trim(), bibNumber: bib.trim() || null, divisionId: divisionId ? Number(divisionId) : null }))
    setName(''); setBib(''); setDivisionId('')
    await reload()
    setLoading(false)
  }

  async function addBulk(e: React.FormEvent) {
    e.preventDefault()
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    setLoading(true)
    for (const line of lines) {
      const [athleteName, bibNumber] = line.split(',').map((s) => s.trim())
      if (!athleteName) continue
      await run(`Import "${athleteName}"`, () => postJson('/api/athletes', { slug, name: athleteName, bibNumber: bibNumber || null, divisionId: bulkDivisionId ? Number(bulkDivisionId) : null }))
    }
    setBulkText('')
    await reload()
    setLoading(false)
  }

  async function saveEdit(id: number) {
    if (!editState.name.trim()) return
    await run('Save edit', () => putJson(`/api/athletes/${id}?slug=${slug}`, { name: editState.name.trim(), bibNumber: editState.bib.trim() || null, divisionId: editState.divisionId ? Number(editState.divisionId) : null }))
    setEditingId(null)
    await reload()
  }

  async function withdraw(id: number) {
    setConfirmActionId(null)
    setLoading(true)
    await run('Withdraw athlete', () => fetch(`/api/athletes/${id}/withdraw?slug=${slug}`, { method: 'POST' }))
    await reload()
    setLoading(false)
  }

  async function unwithdraw(id: number) {
    setConfirmActionId(null)
    setLoading(true)
    await run('Un-withdraw athlete', () => fetch(`/api/athletes/${id}/withdraw?slug=${slug}`, { method: 'DELETE' }))
    await reload()
    setLoading(false)
  }

  async function remove(id: number) {
    setConfirmDeleteId(null)
    const ok = await run('Remove athlete', () => delJson(`/api/athletes/${id}?slug=${slug}`))
    if (ok !== undefined) {
      setAthletes((prev) => prev.filter((a) => a.id !== id))
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    setConfirmDeleteSelected(false)
    setLoading(true)
    await run('Delete selected', () => delJson('/api/athletes', { ids: [...selected] }))
    setSelected(new Set())
    await reload()
    setLoading(false)
  }

  async function swap() {
    if (!swapFromId || !swapToId) return
    setLoading(true)
    await run('Swap athlete', async () => {
      const res = await fetch(`/api/athletes/${swapFromId}/swap?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAthleteId: Number(swapToId) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    })
    setSwapFromId(null)
    setSwapToId('')
    await reload()
    setLoading(false)
  }

  function toggleSelect(id: number) {
    setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  const searchTerm = search.trim().toLowerCase()
  const visibleAthletes = searchTerm ? athletes.filter((a) => a.name.toLowerCase().includes(searchTerm)) : athletes
  const allSelected = visibleAthletes.length > 0 && visibleAthletes.every((a) => selected.has(a.id))
  const someSelected = visibleAthletes.some((a) => selected.has(a.id)) && !allSelected

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl p-6 max-w-xl">
        <div className="flex gap-2 mb-5">
          {(['single', 'bulk'] as const).map((t) => (
            <button key={t} onClick={() => setAddTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${addTab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {t === 'single' ? 'Add One' : 'Bulk Import'}
            </button>
          ))}
        </div>

        {addTab === 'single' && (
          <form onSubmit={addOne} className="flex gap-3 flex-wrap">
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-32 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            <input type="text" placeholder="Bib #" value={bib} onChange={(e) => setBib(e.target.value)} className="w-24 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            {divisions.length > 0 && <DivisionSelect value={divisionId} onChange={setDivisionId} divisions={divisions} />}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">Add</button>
          </form>
        )}

        {addTab === 'bulk' && (
          <form onSubmit={addBulk} className="space-y-3">
            {divisions.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Division (applies to all imported athletes)</label>
                <DivisionSelect value={bulkDivisionId} onChange={setBulkDivisionId} className="w-full" divisions={divisions} />
              </div>
            )}
            <textarea placeholder={"One per line: Name, Bib (bib optional)\nJane Doe, 42\nJohn Smith"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
            <button type="submit" disabled={loading || !bulkText.trim()} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              {loading ? 'Importing...' : 'Import Athletes'}
            </button>
          </form>
        )}
      </div>

      {athletes.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden overflow-x-auto">
          <div className="bg-gray-800 px-5 py-3 flex items-center gap-4">
            <label className="flex items-center gap-3 cursor-pointer select-none shrink-0">
              <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected }} onChange={() => setSelected(allSelected ? new Set() : new Set(visibleAthletes.map((a) => a.id)))} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm text-gray-400">{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
            </label>
            <input type="search" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500" />
            {selected.size > 0 && (
              confirmDeleteSelected ? (
                <>
                  <button onClick={deleteSelected} disabled={loading} className="shrink-0 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors">
                    Sure, delete {selected.size}?
                  </button>
                  <button onClick={() => setConfirmDeleteSelected(false)} className="shrink-0 text-gray-400 hover:text-white text-xs">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDeleteSelected(true)} disabled={loading} className="shrink-0 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors">
                  Delete {selected.size} selected
                </button>
              )
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="w-10 px-4 py-2" />
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Name</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Bib</th>
                {divisions.length > 0 && <th className="text-left px-5 py-2 text-gray-400 font-medium">Division</th>}
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleAthletes.map((a) =>
                editingId === a.id ? (
                  <tr key={a.id} className="border-t border-gray-800 bg-gray-800/40">
                    <td className="px-4 py-2"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="w-4 h-4 accent-orange-500" /></td>
                    <td className="px-3 py-2"><input autoFocus type="text" value={editState.name} onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(a.id); if (e.key === 'Escape') setEditingId(null) }} className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></td>
                    <td className="px-3 py-2"><input type="text" value={editState.bib} onChange={(e) => setEditState((s) => ({ ...s, bib: e.target.value }))} placeholder="Bib #" className="w-24 bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></td>
                    {divisions.length > 0 && <td className="px-3 py-2"><DivisionSelect value={editState.divisionId} onChange={(v) => setEditState((s) => ({ ...s, divisionId: v }))} className="w-full" divisions={divisions} /></td>}
                    <td className="px-5 py-2 text-right"><div className="flex justify-end gap-3"><button onClick={() => saveEdit(a.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button><button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button></div></td>
                  </tr>
                ) : (
                  <tr key={a.id} className={`border-t border-gray-800 ${selected.has(a.id) ? 'bg-orange-500/5' : ''} ${a.withdrawn ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="w-4 h-4 accent-orange-500" /></td>
                    <td className="px-5 py-3 text-white font-medium">
                      {a.name}
                      {a.withdrawn && <span className="ml-2 text-xs bg-yellow-900 text-yellow-400 px-1.5 py-0.5 rounded font-medium">Withdrawn</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-400">{a.bibNumber ?? '—'}</td>
                    {divisions.length > 0 && <td className="px-5 py-3 text-gray-400">{a.division?.name ?? '—'}</td>}
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-4">
                        {confirmDeleteId === a.id ? (
                          <>
                            <button onClick={() => remove(a.id)} className="text-xs text-red-400 hover:text-red-300 font-semibold">Sure?</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                          </>
                        ) : confirmActionId?.id === a.id ? (
                          <>
                            <button onClick={() => confirmActionId.type === 'withdraw' ? withdraw(a.id) : unwithdraw(a.id)} className="text-xs text-orange-400 hover:text-orange-300 font-semibold">Sure?</button>
                            <button onClick={() => setConfirmActionId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                          </>
                        ) : swapFromId === a.id ? (
                          <>
                            <select
                              autoFocus
                              value={swapToId}
                              onChange={(e) => setSwapToId(e.target.value)}
                              className="bg-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            >
                              <option value="">Replace with…</option>
                              {athletes.filter((o) => o.id !== a.id).map((o) => (
                                <option key={o.id} value={String(o.id)}>{o.name}{o.bibNumber ? ` (${o.bibNumber})` : ''}</option>
                              ))}
                            </select>
                            <button onClick={swap} disabled={loading || !swapToId} className="text-xs text-green-400 hover:text-green-300 font-semibold disabled:opacity-50">Confirm</button>
                            <button onClick={() => { setSwapFromId(null); setSwapToId('') }} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(a.id); setEditState({ name: a.name, bib: a.bibNumber ?? '', divisionId: a.divisionId ? String(a.divisionId) : '' }) }} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                            {a.withdrawn
                              ? <button onClick={() => setConfirmActionId({ id: a.id, type: 'unwithdraw' })} disabled={loading} className="text-xs text-yellow-400 hover:text-yellow-300 disabled:opacity-50">Un-withdraw</button>
                              : <button onClick={() => setConfirmActionId({ id: a.id, type: 'withdraw' })} disabled={loading} className="text-xs text-orange-400 hover:text-orange-300 disabled:opacity-50">Withdraw</button>
                            }
                            <button onClick={() => { setSwapFromId(a.id); setSwapToId('') }} disabled={loading} className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50">Swap</button>
                            <button onClick={() => setConfirmDeleteId(a.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Volunteers tab ────────────────────────────────────────────────────────

function VolunteersTab({
  slug, volunteers, roles, loading, setLoading, run, reload, setVolunteers,
}: {
  slug: string
  volunteers: Volunteer[]
  roles: VolunteerRole[]
  loading: boolean
  setLoading: (v: boolean) => void
  run: RunFn
  reload: () => Promise<void>
  setVolunteers: React.Dispatch<React.SetStateAction<Volunteer[]>>
}) {
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkRoleId, setBulkRoleId] = useState('')
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState({ name: '', roleId: '' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [swapFromId, setSwapFromId] = useState<number | null>(null)
  const [swapToId, setSwapToId] = useState('')

  async function addOne(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await run('Add volunteer', () => postJson('/api/volunteers', { slug, name: name.trim(), roleId: roleId ? Number(roleId) : null }))
    setName(''); setRoleId('')
    await reload()
    setLoading(false)
  }

  async function addBulk(e: React.FormEvent) {
    e.preventDefault()
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    setLoading(true)
    for (const line of lines) {
      const volunteerName = line.trim()
      if (!volunteerName) continue
      await run(`Import "${volunteerName}"`, () => postJson('/api/volunteers', { slug, name: volunteerName, roleId: bulkRoleId ? Number(bulkRoleId) : null }))
    }
    setBulkText('')
    await reload()
    setLoading(false)
  }

  async function saveEdit(id: number) {
    if (!editState.name.trim()) return
    await run('Save edit', () => putJson(`/api/volunteers/${id}?slug=${slug}`, { name: editState.name.trim(), roleId: editState.roleId ? Number(editState.roleId) : null }))
    setEditingId(null)
    await reload()
  }

  async function remove(id: number) {
    setConfirmDeleteId(null)
    const ok = await run('Remove volunteer', () => delJson(`/api/volunteers/${id}?slug=${slug}`))
    if (ok !== undefined) {
      setVolunteers((prev) => prev.filter((v) => v.id !== id))
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function swap() {
    if (!swapFromId || !swapToId) return
    setLoading(true)
    await run('Swap volunteer', async () => {
      const res = await fetch(`/api/volunteers/${swapFromId}/swap?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newVolunteerId: Number(swapToId) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    })
    setSwapFromId(null)
    setSwapToId('')
    await reload()
    setLoading(false)
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    setConfirmDeleteSelected(false)
    setLoading(true)
    await run('Delete selected', () => delJson('/api/volunteers', { ids: [...selected] }))
    setSelected(new Set())
    await reload()
    setLoading(false)
  }

  function toggleSelect(id: number) {
    setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  const searchTerm = search.trim().toLowerCase()
  const visibleVolunteers = volunteers
    .filter((v) => !searchTerm || v.name.toLowerCase().includes(searchTerm))
    .filter((v) => !roleFilter || (roleFilter === '__none__' ? v.roleId === null : String(v.roleId) === roleFilter))
  const allSelected = visibleVolunteers.length > 0 && visibleVolunteers.every((v) => selected.has(v.id))
  const someSelected = visibleVolunteers.some((v) => selected.has(v.id)) && !allSelected

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl p-6 max-w-xl">
        <div className="flex gap-2 mb-5">
          {(['single', 'bulk'] as const).map((t) => (
            <button key={t} onClick={() => setAddTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${addTab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {t === 'single' ? 'Add One' : 'Bulk Import'}
            </button>
          ))}
        </div>

        {addTab === 'single' && (
          <form onSubmit={addOne} className="flex gap-3 flex-wrap">
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-32 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required />
            {roles.length > 0 && <RoleSelect value={roleId} onChange={setRoleId} roles={roles} />}
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">Add</button>
          </form>
        )}

        {addTab === 'bulk' && (
          <form onSubmit={addBulk} className="space-y-3">
            {roles.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role (applies to all imported volunteers)</label>
                <RoleSelect value={bulkRoleId} onChange={setBulkRoleId} className="w-full" roles={roles} />
              </div>
            )}
            <textarea placeholder={"One name per line\nJane Doe\nJohn Smith"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
            <button type="submit" disabled={loading || !bulkText.trim()} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
              {loading ? 'Importing...' : 'Import Volunteers'}
            </button>
          </form>
        )}
      </div>

      {volunteers.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden overflow-x-auto">
          <div className="bg-gray-800 px-5 py-3 flex items-center gap-4">
            <label className="flex items-center gap-3 cursor-pointer select-none shrink-0">
              <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected }} onChange={() => setSelected(allSelected ? new Set() : new Set(visibleVolunteers.map((v) => v.id)))} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm text-gray-400">{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
            </label>
            <input type="search" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500" />
            {roles.length > 0 && (
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="shrink-0 bg-gray-700 border border-gray-600 text-sm text-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">All roles</option>
                {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
                <option value="__none__">No role</option>
              </select>
            )}
            {selected.size > 0 && (
              confirmDeleteSelected ? (
                <>
                  <button onClick={deleteSelected} disabled={loading} className="shrink-0 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors">
                    Sure, delete {selected.size}?
                  </button>
                  <button onClick={() => setConfirmDeleteSelected(false)} className="shrink-0 text-gray-400 hover:text-white text-xs">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDeleteSelected(true)} disabled={loading} className="shrink-0 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors">
                  Delete {selected.size} selected
                </button>
              )
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="w-10 px-4 py-2" />
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Name</th>
                {roles.length > 0 && <th className="text-left px-5 py-2 text-gray-400 font-medium">Role</th>}
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleVolunteers.map((v) =>
                editingId === v.id ? (
                  <tr key={v.id} className="border-t border-gray-800 bg-gray-800/40">
                    <td className="px-4 py-2"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} className="w-4 h-4 accent-orange-500" /></td>
                    <td className="px-3 py-2"><input autoFocus type="text" value={editState.name} onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(v.id); if (e.key === 'Escape') setEditingId(null) }} className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></td>
                    {roles.length > 0 && <td className="px-3 py-2"><RoleSelect value={editState.roleId} onChange={(r) => setEditState((s) => ({ ...s, roleId: r }))} className="w-full" roles={roles} /></td>}
                    <td className="px-5 py-2 text-right"><div className="flex justify-end gap-3"><button onClick={() => saveEdit(v.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button><button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button></div></td>
                  </tr>
                ) : (
                  <tr key={v.id} className={`border-t border-gray-800 ${selected.has(v.id) ? 'bg-orange-500/5' : ''}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} className="w-4 h-4 accent-orange-500" /></td>
                    <td className="px-5 py-3 text-white font-medium">{v.name}</td>
                    {roles.length > 0 && <td className="px-5 py-3 text-gray-400">{v.role?.name ?? '—'}</td>}
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-4">
                        {confirmDeleteId === v.id ? (
                          <>
                            <button onClick={() => remove(v.id)} className="text-xs text-red-400 hover:text-red-300 font-semibold">Sure?</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                          </>
                        ) : swapFromId === v.id ? (
                          <>
                            <select
                              autoFocus
                              value={swapToId}
                              onChange={(e) => setSwapToId(e.target.value)}
                              className="bg-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            >
                              <option value="">Replace with…</option>
                              {volunteers.filter((o) => o.id !== v.id).map((o) => (
                                <option key={o.id} value={String(o.id)}>{o.name}{o.role ? ` (${o.role.name})` : ''}</option>
                              ))}
                            </select>
                            <button onClick={swap} disabled={loading || !swapToId} className="text-xs text-green-400 hover:text-green-300 font-semibold disabled:opacity-50">Confirm</button>
                            <button onClick={() => { setSwapFromId(null); setSwapToId('') }} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(v.id); setEditState({ name: v.name, roleId: v.roleId ? String(v.roleId) : '' }) }} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                            <button onClick={() => { setSwapFromId(v.id); setSwapToId('') }} disabled={loading} className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50">Swap</button>
                            <button onClick={() => setConfirmDeleteId(v.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
