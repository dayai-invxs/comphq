'use client'

import { useEffect, useRef, useState } from 'react'
import { getJson } from '@/lib/http'

type Division = { id: number; name: string }
type EquipmentItem = { id: number; item: string; divisionId: number | null; division: Division | null }

type Props = { workoutId: string; slug: string }

const ALL = '__all__'

export default function WorkoutEquipmentPopover({ workoutId, slug }: Props) {
  const [open, setOpen] = useState(false)
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [activeTab, setActiveTab] = useState<string>(ALL)
  const [newItem, setNewItem] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  // The division to assign when adding — matches the active tab, or null for All
  const addDivisionId = activeTab === ALL ? null : Number(activeTab)

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workouts/${workoutId}/equipment?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: newItem.trim(), divisionId: addDivisionId }),
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

  // Items visible in the current tab
  const visibleItems = activeTab === ALL
    ? equipment
    : equipment.filter((eq) => String(eq.divisionId) === activeTab)

  // For the All tab, group by division; for a specific division tab, flat list
  const groups: { key: string; label: string; items: EquipmentItem[] }[] = []
  if (activeTab === ALL) {
    const map = new Map<string, { label: string; items: EquipmentItem[] }>()
    for (const eq of visibleItems) {
      const key = eq.divisionId == null ? '__none__' : String(eq.divisionId)
      const label = eq.division?.name ?? 'All Divisions'
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(eq)
    }
    // All Divisions group first, then alphabetical
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '__none__') return -1
      if (b === '__none__') return 1
      return map.get(a)!.label.localeCompare(map.get(b)!.label)
    })
    for (const key of keys) groups.push({ key, ...map.get(key)! })
  } else {
    groups.push({ key: activeTab, label: '', items: visibleItems })
  }

  const activeDivisionName = activeTab === ALL ? null : divisions.find((d) => String(d.id) === activeTab)?.name ?? null

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
          className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 flex flex-col"
          style={{ maxHeight: '500px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
            <h3 className="text-sm font-semibold text-white">Equipment List</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
          </div>

          {/* Division tabs */}
          {divisions.length > 0 && (
            <div className="flex border-b border-gray-800 shrink-0 overflow-x-auto">
              {[{ id: ALL, name: 'All' }, ...divisions.map((d) => ({ id: String(d.id), name: d.name }))].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-orange-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.name}
                  {tab.id !== ALL && (
                    <span className="ml-1 text-gray-600">
                      ({equipment.filter((eq) => String(eq.divisionId) === tab.id).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Item list */}
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4 min-h-0">
            {visibleItems.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-4">
                {activeTab === ALL
                  ? 'No equipment added yet.'
                  : `No equipment for ${activeDivisionName ?? 'this division'} yet.`}
              </p>
            )}
            {groups.map(({ key, label, items }) => (
              <div key={key}>
                {activeTab === ALL && label && (
                  <p className="text-xs font-semibold text-orange-400 mb-1.5 uppercase tracking-wide">{label}</p>
                )}
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

          {/* Add form */}
          <div className="border-t border-gray-800 px-4 py-3 space-y-2 shrink-0">
            {error && <p className="text-xs text-red-400">{error}</p>}
            {activeDivisionName && (
              <p className="text-xs text-gray-500">Adding to <span className="text-orange-400 font-medium">{activeDivisionName}</span></p>
            )}
            {activeTab === ALL && divisions.length > 0 && (
              <p className="text-xs text-gray-500">Adding to <span className="text-orange-400 font-medium">All Divisions</span> — select a division tab to target one specifically</p>
            )}
            <form onSubmit={addItem} className="flex gap-2">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="e.g. Barbell, 20kg plates…"
                className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-600"
              />
              <button
                type="submit"
                disabled={loading || !newItem.trim()}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors shrink-0"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
