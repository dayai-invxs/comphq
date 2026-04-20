'use client'

import { useEffect, useState } from 'react'

type Division = { id: number; name: string; order: number }
type Athlete = { id: number; name: string; bibNumber: string | null; divisionId: number | null; division: Division | null }
type EditState = { name: string; bib: string; divisionId: string }

function DivisionSelect({ value, onChange, className, divisions }: { value: string; onChange: (v: string) => void; className?: string; divisions: Division[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${className ?? ''}`}
    >
      <option value="">No division</option>
      {divisions.map((d) => (
        <option key={d.id} value={String(d.id)}>{d.name}</option>
      ))}
    </select>
  )
}

export default function AthletesPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [name, setName] = useState('')
  const [bib, setBib] = useState('')
  const [divisionId, setDivisionId] = useState<string>('')
  const [bulkText, setBulkText] = useState('')
  const [bulkDivisionId, setBulkDivisionId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'single' | 'bulk'>('single')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState<EditState>({ name: '', bib: '', divisionId: '' })
  const [selected, setSelected] = useState<Set<number>>(new Set())

  async function load() {
    const [athleteRes, divisionRes] = await Promise.all([
      fetch('/api/athletes'),
      fetch('/api/divisions'),
    ])
    const athleteData: Athlete[] = await athleteRes.json()
    setAthletes(athleteData)
    setDivisions(await divisionRes.json())
    setSelected((prev) => {
      const ids = new Set(athleteData.map((a) => a.id))
      return new Set([...prev].filter((id) => ids.has(id)))
    })
  }

  useEffect(() => { void load() }, [])

  async function addOne(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await fetch('/api/athletes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        bibNumber: bib.trim() || null,
        divisionId: divisionId ? Number(divisionId) : null,
      }),
    })
    setName('')
    setBib('')
    setDivisionId('')
    await load()
    setLoading(false)
  }

  async function addBulk(e: React.FormEvent) {
    e.preventDefault()
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    setLoading(true)
    for (const line of lines) {
      const [athleteName, bibNumber] = line.split(',').map((s) => s.trim())
      if (athleteName) {
        await fetch('/api/athletes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: athleteName, bibNumber: bibNumber || null, divisionId: bulkDivisionId ? Number(bulkDivisionId) : null }),
        })
      }
    }
    setBulkText('')
    await load()
    setLoading(false)
  }

  function startEdit(a: Athlete) {
    setEditingId(a.id)
    setEditState({ name: a.name, bib: a.bibNumber ?? '', divisionId: a.divisionId ? String(a.divisionId) : '' })
  }

  async function saveEdit(id: number) {
    if (!editState.name.trim()) return
    await fetch(`/api/athletes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editState.name.trim(),
        bibNumber: editState.bib.trim() || null,
        divisionId: editState.divisionId ? Number(editState.divisionId) : null,
      }),
    })
    setEditingId(null)
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Remove this athlete?')) return
    await fetch(`/api/athletes/${id}`, { method: 'DELETE' })
    setAthletes((prev) => prev.filter((a) => a.id !== id))
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Remove ${selected.size} athlete${selected.size > 1 ? 's' : ''}?`)) return
    setLoading(true)
    await fetch('/api/athletes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    })
    setSelected(new Set())
    await load()
    setLoading(false)
  }

  function toggleSelect(id: number) {
    setSelected((prev) => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) }; return s })
  }

  function toggleAll() {
    setSelected(selected.size === athletes.length ? new Set() : new Set(athletes.map((a) => a.id)))
  }

  const allSelected = athletes.length > 0 && selected.size === athletes.length
  const someSelected = selected.size > 0 && !allSelected

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Athletes</h1>
        <p className="text-gray-400 mt-1">{athletes.length} registered</p>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 max-w-xl">
        <div className="flex gap-2 mb-5">
          {(['single', 'bulk'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              {t === 'single' ? 'Add One' : 'Bulk Import'}
            </button>
          ))}
        </div>

        {tab === 'single' && (
          <form onSubmit={addOne} className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-32 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
            <input
              type="text"
              placeholder="Bib #"
              value={bib}
              onChange={(e) => setBib(e.target.value)}
              className="w-24 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {divisions.length > 0 && (
              <DivisionSelect value={divisionId} onChange={setDivisionId} divisions={divisions} />
            )}
            <button
              type="submit"
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Add
            </button>
          </form>
        )}

        {tab === 'bulk' && (
          <form onSubmit={addBulk} className="space-y-3">
            {divisions.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Division (applies to all imported athletes)</label>
                <DivisionSelect value={bulkDivisionId} onChange={setBulkDivisionId} className="w-full" divisions={divisions} />
              </div>
            )}
            <textarea
              placeholder={"One per line: Name, Bib (bib optional)\nJane Doe, 42\nJohn Smith"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <button
              type="submit"
              disabled={loading || !bulkText.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {loading ? 'Importing...' : 'Import Athletes'}
            </button>
          </form>
        )}
      </div>

      {athletes.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="bg-gray-800 px-5 py-3 flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected }}
                onChange={toggleAll}
                className="w-4 h-4 accent-orange-500"
              />
              <span className="text-sm text-gray-400">
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </label>
            {selected.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={loading}
                className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
              >
                Delete {selected.size} selected
              </button>
            )}
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="w-10 px-4 py-2" />
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Name</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Bib</th>
                {divisions.length > 0 && (
                  <th className="text-left px-5 py-2 text-gray-400 font-medium">Division</th>
                )}
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) =>
                editingId === a.id ? (
                  <tr key={a.id} className="border-t border-gray-800 bg-gray-800/40">
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="w-4 h-4 accent-orange-500" />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        autoFocus
                        type="text"
                        value={editState.name}
                        onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(a.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editState.bib}
                        onChange={(e) => setEditState((s) => ({ ...s, bib: e.target.value }))}
                        placeholder="Bib #"
                        className="w-24 bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </td>
                    {divisions.length > 0 && (
                      <td className="px-3 py-2">
                        <DivisionSelect
                          value={editState.divisionId}
                          onChange={(v) => setEditState((s) => ({ ...s, divisionId: v }))}
                          className="w-full"
                          divisions={divisions}
                        />
                      </td>
                    )}
                    <td className="px-5 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => saveEdit(a.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id} className={`border-t border-gray-800 ${selected.has(a.id) ? 'bg-orange-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="w-4 h-4 accent-orange-500" />
                    </td>
                    <td className="px-5 py-3 text-white font-medium">{a.name}</td>
                    <td className="px-5 py-3 text-gray-400">{a.bibNumber ?? '—'}</td>
                    {divisions.length > 0 && (
                      <td className="px-5 py-3 text-gray-400">{a.division?.name ?? '—'}</td>
                    )}
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-4">
                        <button onClick={() => startEdit(a)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                        <button onClick={() => remove(a.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
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
