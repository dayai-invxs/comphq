'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Heat = {
  heatNumber: number
  heatTime: string | null
  corralTime: string | null
  walkoutTime: string | null
}

type WorkoutData = {
  id: number
  number: number
  name: string
  status: string
  heats: Heat[]
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

type RowChecks = { corral: boolean; walkout: boolean }

export default function AthleteControl() {
  const [workouts, setWorkouts] = useState<WorkoutData[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [checks, setChecks] = useState<Record<string, RowChecks>>({})

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/ops', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setWorkouts(data.workouts)
        setLastUpdated(new Date())
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  function toggle(workoutId: number, heatNumber: number, field: keyof RowChecks) {
    const key = `${workoutId}-${heatNumber}`
    setChecks((prev) => ({
      ...prev,
      [key]: { corral: false, walkout: false, ...prev[key], [field]: !prev[key]?.[field] },
    }))
  }

  function getChecks(workoutId: number, heatNumber: number): RowChecks {
    return checks[`${workoutId}-${heatNumber}`] ?? { corral: false, walkout: false }
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Athlete Control</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/ops"
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Ops View
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
          ? Math.min(...nextWorkout.heats.map((h) => h.heatTime ? new Date(h.heatTime).getTime() : Infinity).filter(isFinite))
          : Infinity

        const prevWorkout = workouts[wi - 1]
        const prevLatestMs = prevWorkout
          ? Math.max(...prevWorkout.heats.map((h) => h.heatTime ? new Date(h.heatTime).getTime() : -Infinity).filter((n) => n !== -Infinity))
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
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Heat</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Corral</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Walk Out</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Start</th>
                </tr>
              </thead>
              <tbody>
                {workout.heats.map((heat) => {
                  const c = getChecks(workout.id, heat.heatNumber)
                  const dimmed = c.corral && c.walkout
                  const heatMs = heat.heatTime ? new Date(heat.heatTime).getTime() : null
                  const conflict = heatMs != null && (
                    (isFinite(nextEarliestMs) && heatMs >= nextEarliestMs) ||
                    (prevLatestMs !== -Infinity && heatMs <= prevLatestMs)
                  )
                  return (
                    <tr
                      key={heat.heatNumber}
                      className={`border-b transition-opacity ${dimmed ? 'opacity-40' : ''} ${conflict ? 'border-2 border-red-600' : 'border-gray-800'}`}
                    >
                      <td className={`px-3 py-2.5 font-semibold ${dimmed ? 'text-gray-500' : 'text-orange-400'}`}>
                        {heat.heatNumber}
                      </td>
                      <td className="px-3 py-2.5 text-yellow-400 font-mono">
                        <span className="flex items-center gap-2">
                          {fmtTime(heat.corralTime)}
                          <input
                            type="checkbox"
                            checked={c.corral}
                            onChange={() => toggle(workout.id, heat.heatNumber, 'corral')}
                            className="accent-yellow-400 w-3.5 h-3.5"
                          />
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-blue-400 font-mono">
                        <span className="flex items-center gap-2">
                          {fmtTime(heat.walkoutTime)}
                          <input
                            type="checkbox"
                            checked={c.walkout}
                            onChange={() => toggle(workout.id, heat.heatNumber, 'walkout')}
                            className="accent-blue-400 w-3.5 h-3.5"
                          />
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-white font-mono">{fmtTime(heat.heatTime)}</td>
                    </tr>
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
