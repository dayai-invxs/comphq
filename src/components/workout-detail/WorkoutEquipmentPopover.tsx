'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getJson } from '@/lib/http'

type Division = { id: number; name: string }
type EquipmentItem = { id: number; item: string; divisionId: number | null; division: Division | null }

type Props = { workoutId: string; slug: string }

export default function WorkoutEquipmentPopover({ workoutId, slug }: Props) {
  const [open, setOpen] = useState(false)
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [newItem, setNewItem] = useState('')
  const [newDivisionId, setNewDivisionId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  async function load() {
    try {
      const [eq, divs] = await Promise.all([
        getJson<EquipmentItem[]>(`/api/workouts/${workoutId}/equipment?slug=${slug}`),
        getJson<Division[]>(`/api/divisions?slug=${slug}`),
      ])
      setEquipment(eq)
      setDivisions(divs)
    } catch { /* ignore */ }
  }

  useEffect(() => { if (open) void load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute viewport-clamped position whenever the popover opens
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const margin = 8
    const width = Math.min(320, window.innerWidth - margin * 2)
    const top = rect.bottom + 6
    const maxHeight = window.innerHeight - top - margin
    // Align right edge with button, then clamp left edge into viewport
    let left = rect.right - width
    if (left < margin) left = margin
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
    setPanelStyle({ position: 'fixed', top, left, width, maxHeight })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workouts/${workoutId}/equipment?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: newItem.trim(), divisionId: newDivisionId ? Number(newDivisionId) : null }),
      })
      if (!res.ok) { setError(await res.text()); return }
      setNewItem('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function removeItem(id: number) {
    setLoading(true)
    try {
      await fetch(`/api/workouts/${workoutId}/equipment/${id}?slug=${slug}`, { method: 'DELETE' })
      setEquipment((prev) => prev.filter((e) => e.id !== id))
    } finally {
      setLoading(false)
    }
  }

  // Group items: null division (All) first, then alphabetical by division name
  const groups = (() => {
    const map = new Map<string, { label: string; items: EquipmentItem[] }>()
    for (const eq of equipment) {
      const key = eq.divisionId == null ? '__none__' : String(eq.divisionId)
      const label = eq.division?.name ?? 'All Divisions'
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(eq)
    }
    return [...map.keys()]
      .sort((a, b) => {
        if (a === '__none__') return -1
        if (b === '__none__') return 1
        return map.get(a)!.label.localeCompare(map.get(b)!.label)
      })
      .map((key) => ({ key, ...map.get(key)! }))
  })()

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className={`text-sm font-medium rounded-lg px-4 py-2 transition-colors ${
          open ? 'bg-gray-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
      >
        Equipment{equipment.length > 0 && (
          <span className="ml-1.5 text-xs bg-orange-500 text-white rounded-full px-1.5 py-0.5">{equipment.length}</span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 flex flex-col"
          style={panelStyle}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
            <h3 className="text-sm font-semibold text-white">Equipment List</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
          </div>

          {/* Item list */}
          <div className="overflow-y-auto flex-1 px-4 py-3 min-h-0">
            {equipment.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-4">No equipment added yet.</p>
            )}
            <div className="space-y-4">
              {groups.map(({ key, label, items }) => (
                <div key={key}>
                  <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1.5">{label}</p>
                  <ul className="space-y-1">
                    {items.map((eq) => (
                      <li key={eq.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-200">{eq.item}</span>
                        <button
                          onClick={() => removeItem(eq.id)}
                          disabled={loading}
                          className="text-gray-600 hover:text-red-400 disabled:opacity-30 transition-colors text-base leading-none shrink-0"
                          aria-label="Remove"
                        >×</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Add form */}
          <div className="border-t border-gray-800 px-4 py-3 space-y-2 shrink-0">
            {error && <p className="text-xs text-red-400">{error}</p>}
            <form onSubmit={addItem} className="space-y-2">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="e.g. Barbell, 20kg plates…"
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-600"
              />
              <div className="flex gap-2">
                {divisions.length > 0 && (
                  <select
                    value={newDivisionId}
                    onChange={(e) => setNewDivisionId(e.target.value)}
                    className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">All Divisions</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="submit"
                  disabled={loading || !newItem.trim()}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
