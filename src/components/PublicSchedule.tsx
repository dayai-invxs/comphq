'use client'

import { useMemo } from 'react'
import { SlugNav } from '@/components/SlugNav'
import { calcHeatStartMs, fmtHeatTime as fmtMs } from '@/lib/heatTime'
import { useOps, useChecks, qk } from '@/lib/queries'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'

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

function getHeatMs(workout: WorkoutData, heatNumber: number): number | null {
  return calcHeatStartMs(
    heatNumber,
    workout.startTime,
    workout.heatIntervalSecs,
    workout.heatStartOverrides,
    workout.timeBetweenHeatsSecs,
  )
}

export default function PublicSchedule({ slug }: { slug: string }) {
  const { data, dataUpdatedAt } = useOps<OpsData>(slug)
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const { data: checksData } = useChecks(slug)
  const athleteChecks = checksData?.athleteChecks ?? {}

  const realtimeKeys = useMemo(() => [qk.ops(slug), qk.leaderboard(slug), qk.checks(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  const activeWorkouts = (data?.workouts ?? []).filter((w) => w.status === 'active')

  return (
    <div className="min-h-screen flex flex-col">
      <SlugNav slug={slug} />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Competition Schedule</h1>
        <div className="text-right text-xs text-gray-500">
          <div className="flex items-center gap-2 justify-end">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
          {lastUpdated && <div className="mt-1">Updated {lastUpdated.toLocaleTimeString()}</div>}
        </div>
      </div>

      {!data && (
        <div className="text-center text-gray-500 py-20 text-lg">Loading schedule...</div>
      )}

      {data && activeWorkouts.length === 0 && (
        <div className="text-center text-gray-500 py-20 text-lg">
          No active workout at this time.
        </div>
      )}

      {data && activeWorkouts.map((workout) => {
        const pendingHeats = workout.heats.filter((h) => !athleteChecks[`${workout.id}-${h.heatNumber}`]?.walkout)
        if (pendingHeats.length === 0) return null
        return (
          <div key={workout.id} className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">
              Workout {workout.number}: {workout.name}
              {workout.locationName && <span className="ml-2 text-sm font-normal text-gray-400">· {workout.locationName}</span>}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingHeats.map((heat) => {
                const heatMs = getHeatMs(workout, heat.heatNumber)
                const corralMs = heatMs != null ? heatMs - workout.callTimeSecs * 1000 : null
                const walkoutMs = heatMs != null ? heatMs - workout.walkoutTimeSecs * 1000 : null
                return (
                  <div key={heat.heatNumber} className="bg-gray-900 rounded-xl overflow-hidden">
                    <div className="bg-gray-800 px-4 py-2.5">
                      <h3 className="text-base font-semibold text-orange-400">Heat {heat.heatNumber}</h3>
                      {(() => {
                        const divs = [...new Set(heat.entries.map((e) => e.divisionName).filter(Boolean))]
                        return divs.length > 0 ? <p className="text-gray-400 text-xs">{divs.join(' / ')}</p> : null
                      })()}
                      {heatMs != null && (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                          <span className="whitespace-nowrap">Corral: <span className="text-yellow-400 font-mono">{fmtMs(corralMs)}</span></span>
                          <span className="text-gray-600">·</span>
                          <span className="whitespace-nowrap">Walk Out: <span className="text-blue-400 font-mono">{fmtMs(walkoutMs)}</span></span>
                          <span className="text-gray-600">·</span>
                          <span className="whitespace-nowrap">Start: <span className="text-white font-mono">{fmtMs(heatMs)}</span></span>
                        </div>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-800/50">
                        <tr>
                          <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs w-10">Lane</th>
                          <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Athlete</th>
                          {data.showBib && <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Bib</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {heat.entries
                          .sort((a, b) => a.lane - b.lane)
                          .map((e) => (
                            <tr key={e.athleteId} className="border-t border-gray-800">
                              <td className="px-3 py-2 font-bold text-orange-400">{e.lane}</td>
                              <td className="px-3 py-2 font-medium text-white">{e.athleteName}</td>
                              {data.showBib && <td className="px-3 py-2 text-gray-400 text-xs">{e.bibNumber ?? '—'}</td>}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      </main>
    </div>
  )
}
