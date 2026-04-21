'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { calcHeatStartMs } from '@/lib/heatTime'

type HeatEntry = { athleteId: number; athleteName: string; bibNumber: string | null; lane: number }
type Heat = { heatNumber: number; isComplete: boolean; entries: HeatEntry[] }

type WorkoutData = {
  id: number
  number: number
  name: string
  status: string
  startTime: string | null
  heatIntervalSecs: number
  timeBetweenHeatsSecs: number
  callTimeSecs: number
  walkoutTimeSecs: number
  heatStartOverrides: string
  heats: Heat[]
}

function fmtMs(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getHeatMs(workout: WorkoutData, heatNumber: number): number | null {
  return calcHeatStartMs(
    heatNumber,
    workout.startTime,
    workout.heatIntervalSecs,
    workout.heatStartOverrides,
    workout.timeBetweenHeatsSecs,
  )
}

type RowChecks = { corral: boolean; walkout: boolean }
type EditingHeatKey = { workoutId: number; heatNumber: number }

export default function AthleteControl({ slug }: { slug: string }) {
  const [workouts, setWorkouts] = useState<WorkoutData[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [checks, setChecks] = useState<Record<string, RowChecks>>({})
  const [expandedHeats, setExpandedHeats] = useState<Set<string>>(new Set())
  const [editingHeat, setEditingHeat] = useState<EditingHeatKey | null>(null)
  const [heatTimeInput, setHeatTimeInput] = useState('')
  const pathname = usePathname()

  const parts = pathname.split('/').filter(Boolean)
  const opsHref = parts.length >= 2 ? `/${parts[0]}/ops` : '/ops'
  const adminHref = parts.length >= 1 ? `/${parts[0]}/admin` : '/admin'

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops?slug=${slug}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setWorkouts(data.workouts)
        setLastUpdated(new Date())
      }
    } catch {}
  }, [slug])

  useEffect(() => {
    void fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  function toggleExpand(workoutId: number, heatNumber: number) {
    const key = `${workoutId}-${heatNumber}`
    setExpandedHeats((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function isExpanded(workoutId: number, heatNumber: number) {
    return expandedHeats.has(`${workoutId}-${heatNumber}`)
  }

  function toggle(workoutId: number, heatNumber: number, field: keyof RowChecks) {
    const key = `${workoutId}-${heatNumber}`
    setChecks((prev) => ({
      ...prev,
      [key]: { ...({ corral: false, walkout: false }), ...prev[key], [field]: !prev[key]?.[field] },
    }))
  }

  function getChecks(workoutId: number, heatNumber: number): RowChecks {
    return checks[`${workoutId}-${heatNumber}`] ?? { corral: false, walkout: false }
  }

  function startEditHeatTime(workoutId: number, heatNumber: number) {
    const workout = workouts.find((w) => w.id === workoutId)
    if (!workout) return
    const ms = getHeatMs(workout, heatNumber)
    if (ms == null) return
    const d = new Date(ms)
    setHeatTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setEditingHeat({ workoutId, heatNumber })
  }

  async function saveHeatTime() {
    if (!editingHeat || !heatTimeInput) return
    const { workoutId, heatNumber } = editingHeat
    const workout = workouts.find((w) => w.id === workoutId)
    if (!workout) return
    const ms = getHeatMs(workout, heatNumber)
    if (ms == null) return
    const base = new Date(ms)
    const [hh, mm] = heatTimeInput.split(':').map(Number)
    const newDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0)
    await fetch(`/api/workouts/${workoutId}/heat-times`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heatNumber, isoTime: newDate.toISOString() }),
    })
    setEditingHeat(null)
    await fetchData()
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Athlete Control</h1>
        <div className="flex items-center gap-4">
          <Link href={opsHref} className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors">
            Ops View
          </Link>
          <Link href={adminHref} className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors">
            Admin
          </Link>
          <div className="text-xs text-gray-500 text-right">
            <div className="flex items-center gap-2 justify-end">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
            {lastUpdated && <div className="mt-1">Updated {lastUpdated.toLocaleTimeString()}</div>}
          </div>
        </div>
      </div>

      {workouts.length === 0 && (
        <div className="text-center text-gray-500 py-20 text-lg">Loading...</div>
      )}

      {workouts.map((workout, wi) => {
        const nextWorkout = workouts[wi + 1]
        const nextEarliestMs = nextWorkout
          ? Math.min(...nextWorkout.heats.map((h) => getHeatMs(nextWorkout, h.heatNumber) ?? Infinity).filter(isFinite))
          : Infinity

        const prevWorkout = workouts[wi - 1]
        const prevLatestMs = prevWorkout
          ? Math.max(...prevWorkout.heats.map((h) => getHeatMs(prevWorkout, h.heatNumber) ?? -Infinity).filter((n) => n !== -Infinity))
          : -Infinity

        return (
          <section key={workout.id} className="mb-10">
            <h2 className="text-xl font-bold text-white mb-3">
              Workout {workout.number}: {workout.name}
            </h2>
            {workout.heats.length === 0 ? (
              <p className="text-gray-500 text-sm">No heats assigned.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="w-8 px-2 py-2" />
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Heat</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Corral</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Walk Out</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Start</th>
                  </tr>
                </thead>
                <tbody>
                  {workout.heats.map((heat) => {
                    const heatMs = getHeatMs(workout, heat.heatNumber)
                    const corralMs = heatMs != null ? heatMs - workout.callTimeSecs * 1000 : null
                    const walkoutMs = heatMs != null ? heatMs - workout.walkoutTimeSecs * 1000 : null

                    const c = getChecks(workout.id, heat.heatNumber)
                    const dimmed = c.corral && c.walkout
                    const conflict = heatMs != null && (
                      (isFinite(nextEarliestMs) && heatMs >= nextEarliestMs) ||
                      (prevLatestMs !== -Infinity && heatMs <= prevLatestMs)
                    )
                    const isEditing = editingHeat?.workoutId === workout.id && editingHeat?.heatNumber === heat.heatNumber
                    const expanded = isExpanded(workout.id, heat.heatNumber)
                    const sortedEntries = [...heat.entries].sort((a, b) => a.lane - b.lane)

                    return (
                      <>
                        <tr
                          key={heat.heatNumber}
                          className={`border-b transition-opacity ${dimmed ? 'opacity-40' : ''} ${conflict ? 'border-2 border-red-600' : 'border-gray-800'}`}
                        >
                          <td className="px-2 py-2.5">
                            {sortedEntries.length > 0 && (
                              <button
                                onClick={() => toggleExpand(workout.id, heat.heatNumber)}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label={expanded ? 'Collapse' : 'Expand'}
                              >
                                <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 font-semibold ${dimmed ? 'text-gray-500' : 'text-orange-400'}`}>
                            {heat.heatNumber}
                            {heat.isComplete && <span className="ml-1.5 text-xs text-green-500">✓</span>}
                          </td>
                          <td className="px-3 py-2.5 text-yellow-400 font-mono">
                            <span className="flex items-center gap-2">
                              {fmtMs(corralMs)}
                              <input type="checkbox" checked={c.corral} onChange={() => toggle(workout.id, heat.heatNumber, 'corral')} className="accent-yellow-400 w-3.5 h-3.5" />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-blue-400 font-mono">
                            <span className="flex items-center gap-2">
                              {fmtMs(walkoutMs)}
                              <input type="checkbox" checked={c.walkout} onChange={() => toggle(workout.id, heat.heatNumber, 'walkout')} className="accent-blue-400 w-3.5 h-3.5" />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-white font-mono">
                            {isEditing ? (
                              <span className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={heatTimeInput}
                                  onChange={(e) => setHeatTimeInput(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveHeatTime(); if (e.key === 'Escape') setEditingHeat(null) }}
                                  autoFocus
                                  className="bg-gray-700 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                                />
                                <button onClick={saveHeatTime} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                                <button onClick={() => setEditingHeat(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                {fmtMs(heatMs)}
                                {heatMs != null && (
                                  <button onClick={() => startEditHeatTime(workout.id, heat.heatNumber)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                    Edit
                                  </button>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                        {expanded && sortedEntries.length > 0 && (
                          <tr key={`${heat.heatNumber}-athletes`} className="border-b border-gray-800 bg-gray-900/50">
                            <td />
                            <td colSpan={4} className="px-3 py-2">
                              <div className="flex flex-wrap gap-x-6 gap-y-1">
                                {sortedEntries.map((e) => (
                                  <span key={e.athleteId} className="text-sm text-gray-300">
                                    <span className="text-orange-400 font-bold mr-1.5">{e.lane}</span>
                                    {e.athleteName}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        )
      })}
    </main>
  )
}
