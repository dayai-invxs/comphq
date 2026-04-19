'use client'

import { useEffect, useState } from 'react'

type Division = { id: number; name: string; order: number }

export default function DivisionsPage() {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [newName, setNewName] = useState('')
  const [newOrder, setNewOrder] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editOrder, setEditOrder] = useState('')

  async function load() {
    const res = await fetch('/api/divisions')
    setDivisions(await res.json())
  }

  useEffect(() => { load() }, [])

  async function addDivision(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newOrder) return
    setLoading(true)
    await fetch('/api/divisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), order: Number(newOrder) }),
    })
    setNewName('')
    setNewOrder('')
    await load()
    setLoading(false)
  }

  function startEdit(d: Division) {
    setEditingId(d.id)
    setEditName(d.name)
    setEditOrder(String(d.order))
  }

  async function saveEdit(id: number) {
    await fetch(`/api/divisions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), order: Number(editOrder) }),
    })
    setEditingId(null)
    await load()
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Delete division "${name}"? Athletes in this division will be unassigned.`)) return
    await fetch(`/api/divisions/${id}`, { method: 'DELETE' })
    setDivisions((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Divisions</h1>
        <p className="text-gray-400 mt-1">
          Division order determines the heat running order — lower order runs first.
        </p>
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
                editingId === d.id ? (
                  <tr key={d.id} className="border-t border-gray-800 bg-gray-800/40">
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={editOrder}
                        onChange={(e) => setEditOrder(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(d.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="w-16 bg-gray-700 text-white rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(d.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="w-full bg-gray-700 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-5 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => saveEdit(d.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id} className="border-t border-gray-800">
                    <td className="px-5 py-3 text-orange-400 font-bold">{d.order}</td>
                    <td className="px-5 py-3 text-white font-medium">{d.name}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-4">
                        <button onClick={() => startEdit(d)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                        <button onClick={() => remove(d.id, d.name)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Add Division</h2>
        <form onSubmit={addDivision} className="flex gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Order</label>
            <input
              type="number"
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value)}
              placeholder={String((divisions[divisions.length - 1]?.order ?? 0) + 1)}
              className="w-20 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. RX, Scaled, Masters"
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || !newName.trim() || !newOrder}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
