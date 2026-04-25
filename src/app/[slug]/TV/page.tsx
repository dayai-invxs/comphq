'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
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
  const mainRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

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

  // Reset to natural size, measure, then scale down to fit if needed.
  // Uses transform instead of zoom for broader browser compatibility (webOS 4.x / Chrome 56).
  // transform-origin top-left + width compensation keeps content flush to the container edges.
  useLayoutEffect(() => {
    const container = mainRef.current
    const content = contentRef.current
    if (!container || !content) return
    content.style.transform = ''
    content.style.transformOrigin = ''
    content.style.width = ''
    const available = container.clientHeight
    const natural = content.scrollHeight
    if (natural > available) {
      const ratio = available / natural
      content.style.transform = 'scale(' + ratio + ')'
      content.style.transformOrigin = 'top left'
      content.style.width = (100 / ratio).toFixed(4) + '%'
    }
  }, [opsData, lbData, view])

  return (
    <div className="w-screen h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
      <header className="flex items-center justify-between px-10 py-5 bg-gray-800 border-b-2 border-gray-700 flex-shrink-0">
        <h1 className="text-4xl font-bold text-orange-400">
          {view === 'schedule' ? 'Competition Schedule' : 'Leaderboard'}
        </h1>
        <div className="flex items-center">
          <div className="flex items-center" style={{ marginRight: 24 }}>
            <span className="text-gray-400 font-bold text-5xl" style={{ marginRight: 24 }}>Scan for Comp Info →</span>
            <QRCodeSVG value="https://competitioncorner.net/events/19948/schedule" size={72} bgColor="#1f2937" fgColor="#ffffff" />
          </div>
          <div className="flex">
            <div className={`w-4 h-4 rounded-full transition-colors ${view === 'schedule' ? 'bg-orange-400' : 'bg-gray-600'}`} style={{ marginRight: 12 }} />
            <div className={`w-4 h-4 rounded-full transition-colors ${view === 'leaderboard' ? 'bg-orange-400' : 'bg-gray-600'}`} />
          </div>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-hidden p-8">
        <div ref={contentRef}>
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridGap: '20px' }}>
      {upcoming.map(({ workout, heat, heatMs }) => {
        const corralMs = heatMs != null ? heatMs - workout.callTimeSecs * 1000 : null
        const walkoutMs = heatMs != null ? heatMs - workout.walkoutTimeSecs * 1000 : null
        const divs = [...new Set(heat.entries.map(e => e.divisionName).filter(Boolean))]

        return (
          <div key={`${workout.id}-${heat.heatNumber}`} className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="bg-gray-700 px-6 py-4">
              <p className="text-gray-300 text-2xl font-bold mb-1">
                Workout {workout.number}: {workout.name}
                {workout.locationName && <span className="ml-2">· {workout.locationName}</span>}
              </p>
              <h3 className="text-2xl font-bold text-orange-400">Heat {heat.heatNumber}</h3>
              {divs.length > 0 && (
                <p className="text-gray-300 text-lg mt-1">{divs.join(' / ')}</p>
              )}
              {heatMs != null && (
                <div className="flex flex-wrap items-center text-lg text-gray-300 mt-2">
                  <span className="whitespace-nowrap" style={{ marginRight: 12, marginBottom: 4 }}><span className="text-gray-400">Corral: </span><span className="text-yellow-300 font-mono font-bold">{fmtMs(corralMs)}</span></span>
                  <span className="text-gray-600" style={{ marginRight: 12, marginBottom: 4 }}>·</span>
                  <span className="whitespace-nowrap" style={{ marginRight: 12, marginBottom: 4 }}><span className="text-gray-400">Walk Out: </span><span className="text-blue-300 font-mono font-bold">{fmtMs(walkoutMs)}</span></span>
                  <span className="text-gray-600" style={{ marginRight: 12, marginBottom: 4 }}>·</span>
                  <span className="whitespace-nowrap"><span className="text-gray-400">Start: </span><span className="text-white font-mono font-bold">{fmtMs(heatMs)}</span></span>
                </div>
              )}
            </div>
            <div className="px-6 py-3">
              {heat.entries
                .sort((a, b) => a.lane - b.lane)
                .map(e => (
                  <div key={e.athleteId} className="flex items-center py-3 border-b border-gray-700" style={{ borderBottom: '1px solid #374151' }}>
                    <span className="text-orange-400 font-bold text-xl w-10" style={{ marginRight: 20 }}>L{e.lane}</span>
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
  )
}

function LeaderboardView({ data }: { data: LeaderboardData | undefined }) {
  if (!data) {
    return <div className="text-gray-500 text-3xl text-center mt-20">Loading leaderboard...</div>
  }

  const { entries, workouts, tvLeaderboardPercentages = {}, tvLeaderboardOrder = {} } = data

  if (workouts.length === 0 || entries.length === 0) {
    return <div className="text-gray-500 text-3xl text-center mt-20">No scores yet.</div>
  }

  const divisions = [...new Set(entries.map(e => e.divisionName))].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    const orderA = a != null ? (tvLeaderboardOrder[a] ?? Infinity) : Infinity
    const orderB = b != null ? (tvLeaderboardOrder[b] ?? Infinity) : Infinity
    return orderA !== orderB ? orderA - orderB : a.localeCompare(b)
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gridGap: '20px' }}>
      {divisions.map(division => {
        const divisionEntries = entries.filter(e => e.divisionName === division)
        const pct = division != null ? (tvLeaderboardPercentages[division] ?? 100) : 100
        const showCount = Math.max(1, Math.ceil(divisionEntries.length * pct / 100))
        const topEntries = divisionEntries.slice(0, showCount)
        if (topEntries.length === 0) return null

        return (
          <div key={division ?? 'none'} className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="bg-gray-700 px-5 py-3">
              <h2 className="text-xl font-bold text-orange-400">{division ?? 'No Division'}</h2>
            </div>
            <div className="px-5 py-3" style={{ display: 'flex', flexDirection: 'column' }}>
              {topEntries.map((entry, i) => (
                <div key={entry.athleteId} className="flex items-center" style={{ marginBottom: 12 }}>
                  <span className={`text-3xl font-black w-12 text-center ${RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)]}`} style={{ marginRight: 16 }}>
                    #{i + 1}
                  </span>
                  <div>
                    <div className={`text-xl font-bold ${RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)]}`}>{entry.athleteName}</div>
                    <div className="text-gray-400 text-base">
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
