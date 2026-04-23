'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLeaderboard, useOps, qk, type LeaderboardData } from '@/lib/queries'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { calcHeatStartMs, fmtHeatTime as fmtMs } from '@/lib/heatTime'

type HeatEntry = {
  athleteId: number
  athleteName: string
  bibNumber: string | null
  divisionName: string | null
  lane: number
}

type Heat = {
  heatNumber: number
  isComplete: boolean
  entries: HeatEntry[]
}

type WorkoutData = {
  id: number
  number: number
  name: string
  status: string
  locationName: string | null
  startTime: string | null
  heatIntervalSecs: number
  timeBetweenHeatsSecs: number
  callTimeSecs: number
  walkoutTimeSecs: number
  heatStartOverrides: Record<string, string> | string
  heats: Heat[]
}

type OpsData = {
  workouts: WorkoutData[]
  showBib: boolean
}

const SWITCH_INTERVAL_MS = 10_000
const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-500'] as const

export default function TVPage() {
  const { slug } = useParams<{ slug: string }>()
  const [view, setView] = useState<'schedule' | 'leaderboard'>('schedule')
  const [zoom, setZoom] = useState(0.75)
  const mainRef = useRef<HTMLDivElement>(null)

  const { data: opsData, error: opsError } = useOps<OpsData>(slug)
  const { data: lbData } = useLeaderboard(slug)

  const realtimeKeys = useMemo(() => [qk.ops(slug), qk.leaderboard(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  useEffect(() => {
    const id = setInterval(() => {
      setView(v => v === 'schedule' ? 'leaderboard' : 'schedule')
    }, SWITCH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // After content renders, measure and shrink to fit if needed
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const available = el.clientHeight
    const content = el.scrollHeight
    if (content <= available) {
      setZoom(1)
    } else {
      setZoom(Math.max(0.4, available / content))
    }
  }, [opsData, lbData, view])

  return (
    <div className="w-screen h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
      <header className="flex items-center justify-between px-10 py-5 bg-gray-800 border-b-2 border-gray-700 flex-shrink-0">
        <h1 className="text-4xl font-bold text-orange-400">
          {view === 'schedule' ? 'Competition Schedule' : 'Leaderboard — Top 3'}
        </h1>
        <div className="flex gap-3 items-center">
          <div className={`w-4 h-4 rounded-full transition-colors ${view === 'schedule' ? 'bg-orange-400' : 'bg-gray-600'}`} />
          <div className={`w-4 h-4 rounded-full transition-colors ${view === 'leaderboard' ? 'bg-orange-400' : 'bg-gray-600'}`} />
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-hidden p-8">
        <div style={{ zoom }}>
          {view === 'schedule'
            ? <ScheduleView data={opsData} error={opsError} />
            : <LeaderboardView data={lbData} />
          }
        </div>
      </main>
    </div>
  )
}

function ScheduleView({ data, error }: { data: OpsData | undefined; error: Error | null }) {
  if (error) {
    return <div className="text-red-400 text-2xl text-center mt-20">Error: {error.message}</div>
  }
  if (!data) {
    return <div className="text-gray-500 text-3xl text-center mt-20">Loading schedule...</div>
  }

  const activeWorkouts = data.workouts.filter(w => w.status === 'active')

  if (activeWorkouts.length === 0) {
    return <div className="text-gray-500 text-3xl text-center mt-20">No active workout at this time.</div>
  }

  // Flatten all pending heats across active workouts, attach workout context + start time
  type FlatHeat = { workout: WorkoutData; heat: typeof activeWorkouts[0]['heats'][0]; heatMs: number | null }
  const allPending: FlatHeat[] = activeWorkouts.flatMap(workout =>
    workout.heats
      .filter(h => !h.isComplete)
      .map(heat => ({
        workout,
        heat,
        heatMs: calcHeatStartMs(heat.heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs),
      }))
  )

  // Sort by start time (nulls last), take next 3
  const upcoming = allPending
    .sort((a, b) => {
      if (a.heatMs == null && b.heatMs == null) return 0
      if (a.heatMs == null) return 1
      if (b.heatMs == null) return -1
      return a.heatMs - b.heatMs
    })
    .slice(0, 3)

  if (upcoming.length === 0) {
    return <div className="text-gray-500 text-3xl text-center mt-20">No upcoming heats.</div>
  }

  // Group by workout for display
  const byWorkout = new Map<number, { workout: WorkoutData; heats: FlatHeat[] }>()
  for (const item of upcoming) {
    if (!byWorkout.has(item.workout.id)) byWorkout.set(item.workout.id, { workout: item.workout, heats: [] })
    byWorkout.get(item.workout.id)!.heats.push(item)
  }

  return (
    <div className="space-y-8 h-full overflow-hidden">
      {[...byWorkout.values()].map(({ workout, heats }) => (
          <div key={workout.id}>
            <h2 className="text-3xl font-bold text-white mb-5">
              Workout {workout.number}: {workout.name}
              {workout.locationName && (
                <span className="ml-3 text-xl font-normal text-gray-400">· {workout.locationName}</span>
              )}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' }}>
              {heats.map(({ heat, heatMs }) => {
                const corralMs = heatMs != null ? heatMs - workout.callTimeSecs * 1000 : null
                const walkoutMs = heatMs != null ? heatMs - workout.walkoutTimeSecs * 1000 : null
                const divs = [...new Set(heat.entries.map(e => e.divisionName).filter(Boolean))]

                return (
                  <div key={heat.heatNumber} className="bg-gray-800 rounded-xl overflow-hidden">
                    <div className="bg-gray-700 px-6 py-4">
                      <h3 className="text-2xl font-bold text-orange-400">Heat {heat.heatNumber}</h3>
                      {divs.length > 0 && (
                        <p className="text-gray-300 text-lg mt-1">{divs.join(' / ')}</p>
                      )}
                      {heatMs != null && (
                        <p className="text-lg text-gray-300 mt-2">
                          <span className="text-gray-400">Corral </span>
                          <span className="text-yellow-300 font-mono font-bold">{fmtMs(corralMs)}</span>
                          <span className="mx-3 text-gray-600">·</span>
                          <span className="text-gray-400">Walk Out </span>
                          <span className="text-blue-300 font-mono font-bold">{fmtMs(walkoutMs)}</span>
                          <span className="mx-3 text-gray-600">·</span>
                          <span className="text-gray-400">Start </span>
                          <span className="text-white font-mono font-bold">{fmtMs(heatMs)}</span>
                        </p>
                      )}
                    </div>
                    <div className="px-6 py-3">
                      {heat.entries
                        .sort((a, b) => a.lane - b.lane)
                        .map(e => (
                          <div key={e.athleteId} className="flex items-center gap-5 py-3 border-b border-gray-700" style={{ borderBottom: '1px solid #374151' }}>
                            <span className="text-orange-400 font-bold text-xl w-10">L{e.lane}</span>
                            <span className="text-white text-2xl font-medium">{e.athleteName}</span>
                            {e.divisionName && (
                              <span className="text-gray-400 text-lg ml-auto">{e.divisionName}</span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      )}
    </div>
  )
}

function LeaderboardView({ data }: { data: LeaderboardData | undefined }) {
  if (!data) {
    return <div className="text-gray-500 text-3xl text-center mt-20">Loading leaderboard...</div>
  }

  const { entries, workouts } = data

  if (workouts.length === 0 || entries.length === 0) {
    return <div className="text-gray-500 text-3xl text-center mt-20">No scores yet.</div>
  }

  const divisions = [...new Set(entries.map(e => e.divisionName))].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '24px' }}>
      {divisions.map(division => {
        const top3 = entries.filter(e => e.divisionName === division).slice(0, 3)
        if (top3.length === 0) return null

        return (
          <div key={division ?? 'none'} className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="bg-gray-700 px-6 py-4">
              <h2 className="text-2xl font-bold text-orange-400">{division ?? 'No Division'}</h2>
            </div>
            <div className="px-6 py-4" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {top3.map((entry, i) => (
                <div key={entry.athleteId} className="flex items-center gap-5">
                  <span className={`text-5xl font-black w-16 text-center ${RANK_COLORS[i]}`}>
                    #{i + 1}
                  </span>
                  <div>
                    <div className={`text-2xl font-bold ${RANK_COLORS[i]}`}>{entry.athleteName}</div>
                    <div className="text-gray-400 text-lg">
                      {Number.isInteger(entry.totalPoints)
                        ? entry.totalPoints
                        : entry.totalPoints.toFixed(1)
                      } pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
