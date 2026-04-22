'use client'

import { useMemo, useState } from 'react'
import { SlugNav } from '@/components/SlugNav'
import { calcHeatStartMs, fmtHeatTime as fmtMs } from '@/lib/heatTime'
import { useOps, qk } from '@/lib/queries'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { statusStyle } from '@/lib/workoutEnums'

type HeatEntry = {
  athleteId: number
  athleteName: string
  bibNumber: string | null
  divisionName: string | null
  lane: number
  scoreDisplay: string | null
  tiebreakDisplay: string | null
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

export default function OpsView({ slug }: { slug: string }) {
  const { data, dataUpdatedAt } = useOps<OpsData>(slug)
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null
  const [showAthletes, setShowAthletes] = useState(true)
  const [search, setSearch] = useState('')

  const realtimeKeys = useMemo(() => [qk.ops(slug), qk.schedule(slug), qk.leaderboard(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  const searchTerm = search.trim().toLowerCase()

  function filterHeats(heats: Heat[]) {
    if (!searchTerm) return heats
    return heats
      .map((heat) => ({
        ...heat,
        entries: heat.entries.filter((e) =>
          e.athleteName.toLowerCase().includes(searchTerm)
        ),
      }))
      .filter((heat) => heat.entries.length > 0)
  }

  const athletesVisible = showAthletes || !!searchTerm

  return (
    <div className="min-h-screen flex flex-col">
      <SlugNav slug={slug} />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Athlete Overview</h1>
          <p className="text-gray-400 mt-1">All workouts · All heats</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            placeholder="Search athlete…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500 w-48"
          />
          <button
            onClick={() => setShowAthletes((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {showAthletes ? 'Hide athletes' : 'Show athletes'}
          </button>
          <div className="text-right text-xs text-gray-500">
            <div className="flex items-center gap-2 justify-end">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
            {lastUpdated && <div className="mt-1">Updated {lastUpdated.toLocaleTimeString()}</div>}
          </div>
        </div>
      </div>

      {!data && (
        <div className="text-center text-gray-500 py-20 text-lg">Loading...</div>
      )}

      {data?.workouts.length === 0 && (
        <div className="text-center text-gray-500 py-20 text-lg">No workouts found.</div>
      )}

      {data && data.workouts.map((workout) => {
        const badge = statusStyle(workout.status)
        const visibleHeats = filterHeats(workout.heats)
        if (searchTerm && visibleHeats.length === 0) return null
        return (
          <section key={workout.id} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">
                Workout {workout.number}: {workout.name}
              </h2>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${badge.className}`}>
                {badge.label}
              </span>
            </div>

            {workout.heats.length === 0 ? (
              <p className="text-gray-500 text-sm">No heats assigned.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleHeats.map((heat) => (
                  <div
                    key={heat.heatNumber}
                    className={`rounded-xl overflow-hidden border ${
                      heat.isComplete
                        ? 'border-gray-700 opacity-60'
                        : 'border-transparent bg-gray-900'
                    }`}
                  >
                    <div className={`px-4 py-2.5 ${heat.isComplete ? 'bg-gray-700' : 'bg-gray-800'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-base ${heat.isComplete ? 'text-gray-400' : 'text-orange-400'}`}>
                          Heat {heat.heatNumber}
                        </span>
                        {heat.isComplete && (
                          <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full font-medium">Done</span>
                        )}
                      </div>
                      {(() => {
                        const divs = [...new Set(heat.entries.map((e) => e.divisionName).filter(Boolean))]
                        return divs.length > 0
                          ? <p className="text-gray-400 text-xs">{divs.join(' / ')}</p>
                          : null
                      })()}
                      {(() => {
                        const heatMs = getHeatMs(workout, heat.heatNumber)
                        if (heatMs == null) return null
                        const corralMs = heatMs - workout.callTimeSecs * 1000
                        const walkoutMs = heatMs - workout.walkoutTimeSecs * 1000
                        return (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Corral: <span className="text-yellow-400 font-mono">{fmtMs(corralMs)}</span>
                            {' · '}
                            Walk Out: <span className="text-blue-400 font-mono">{fmtMs(walkoutMs)}</span>
                            {' · '}
                            Start: <span className="text-white font-mono">{fmtMs(heatMs)}</span>
                          </p>
                        )
                      })()}
                    </div>
                    {athletesVisible && (
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
                                <td className="px-3 py-2 font-medium text-white">
                                  {e.athleteName}
                                  {heat.isComplete && e.scoreDisplay && (
                                    <span className="ml-2 text-xs text-gray-400 font-mono">{e.scoreDisplay}</span>
                                  )}
                                  {heat.isComplete && e.tiebreakDisplay && (
                                    <span className="ml-1 text-xs text-blue-400 font-mono">TB {e.tiebreakDisplay}</span>
                                  )}
                                </td>
                                {data.showBib && <td className="px-3 py-2 text-gray-400 text-xs">{e.bibNumber ?? '—'}</td>}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      </main>
    </div>
  )
}
