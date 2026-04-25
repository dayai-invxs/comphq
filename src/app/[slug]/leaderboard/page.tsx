'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLeaderboard, qk } from '@/lib/queries'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import { SlugNav } from '@/components/SlugNav'

const ALL_DIVISIONS = '__all__'
const NULL_DIVISION = '__null__'

export default function PublicLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading } = useLeaderboard(slug)

  const [divisionFilter, setDivisionFilter] = useState<string>(ALL_DIVISIONS)
  const [workoutFilter, setWorkoutFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<'overall' | number>('overall')
  const [search, setSearch] = useState('')

  const realtimeKeys = useMemo(() => [qk.leaderboard(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  const workouts = data?.workouts ?? []
  const entries = data?.entries ?? []
  const halfWeightIds = data?.halfWeightIds ?? []
  const tiebreakWorkoutId = data?.tiebreakWorkoutId ?? null

  const visibleWorkouts = workoutFilter === 'all' ? workouts : workouts.filter((w) => w.id === workoutFilter)

  const divisions = [...new Set(
    entries
      .filter((e) => Object.values(e.workoutScores).some((s) => s !== null))
      .map((e) => e.divisionName)
  )].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })

  const searchTerm = search.trim().toLowerCase()

  const sortedEntries = useMemo(() => {
    if (sortBy === 'overall') return entries
    const wId = sortBy
    return [...entries].sort((a, b) => {
      const aScore = a.workoutScores[wId]
      const bScore = b.workoutScores[wId]
      if (aScore && bScore) return aScore.points - bScore.points
      if (aScore && !bScore) return -1
      if (!aScore && bScore) return 1
      return a.athleteName.localeCompare(b.athleteName)
    })
  }, [entries, sortBy])

  const workoutIds = workouts.map((w) => w.id)

  function isTrulyTied(a: typeof entries[number], b: typeof entries[number]): boolean {
    if (sortBy === 'overall') {
      if (a.totalPoints !== b.totalPoints) return false
      return workoutIds.every((wId) => (a.workoutScores[wId]?.points ?? null) === (b.workoutScores[wId]?.points ?? null))
    }
    return (a.workoutScores[sortBy]?.points ?? null) === (b.workoutScores[sortBy]?.points ?? null)
  }

  function renderTable(divisionName: string | null) {
    let rows = sortedEntries.filter((e) => e.divisionName === divisionName)
    if (searchTerm) rows = rows.filter((e) => e.athleteName.toLowerCase().includes(searchTerm))
    if (rows.length === 0) return null
    let rank = 1
    const showDivisionHeader = divisionFilter === ALL_DIVISIONS
    return (
      <div key={divisionName ?? 'none'} className="bg-gray-900 rounded-xl overflow-hidden">
        {showDivisionHeader && (
          <div className="bg-gray-800 px-5 py-3">
            <h2 className="text-lg font-semibold text-orange-400">{divisionName ?? 'No Division'}</h2>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left px-5 py-2 text-gray-400 font-medium w-12">Rank</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
                {visibleWorkouts.map((w) => (
                  <th key={w.id} className="text-left px-4 py-2 text-gray-400 font-medium whitespace-nowrap">
                    WOD {w.number}{halfWeightIds.includes(w.id) && <span className="ml-1 text-yellow-500 text-xs">½</span>}
                  </th>
                ))}
                {workoutFilter === 'all' && <th className="text-left px-5 py-2 text-gray-400 font-medium">Total Pts</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry, i) => {
                const hasAnyScore = Object.values(entry.workoutScores).some((v) => v !== null)
                const hasRelevantScore = workoutFilter === 'all'
                  ? hasAnyScore
                  : entry.workoutScores[workoutFilter] != null
                if (i > 0 && hasRelevantScore) {
                  const prev = rows[i - 1]
                  if (!isTrulyTied(prev, entry)) rank = i + 1
                }
                const rankDisplay = hasRelevantScore ? rank : '—'
                return (
                  <tr key={entry.athleteId} className="border-t border-gray-800">
                    <td className="px-5 py-3 font-bold text-gray-400">{rankDisplay}</td>
                    <td className="px-5 py-3 text-white font-medium">{entry.athleteName}</td>
                    {visibleWorkouts.map((w) => {
                      const ws = entry.workoutScores[w.id]
                      return (
                        <td key={w.id} className="px-4 py-3">
                          {ws ? (
                            <div>
                              <div>
                                <span className={`font-bold ${ws.points === 1 ? 'text-yellow-400' : ws.points <= 3 ? 'text-orange-400' : 'text-white'}`}>#{ws.points}</span>
                                {ws.partBPoints != null && (
                                  <span className="text-gray-400 text-xs ml-1">/ B#{ws.partBPoints}</span>
                                )}
                                <span className="text-gray-500 text-xs ml-1">{ws.display}</span>
                              </div>
                              {ws.tiebreakDisplay && (
                                <div className="text-blue-400 text-xs mt-0.5">TB {ws.tiebreakDisplay}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-600">DNS</span>
                          )}
                        </td>
                      )
                    })}
                    {workoutFilter === 'all' && (
                      <td className="px-5 py-3 font-bold text-white">
                        {hasAnyScore ? (Number.isInteger(entry.totalPoints) ? entry.totalPoints : entry.totalPoints.toFixed(1)) : '—'}
                        {tiebreakWorkoutId && entry.workoutScores[tiebreakWorkoutId]?.display && (
                          <div className="text-blue-400 text-xs font-normal mt-0.5">
                            TB {entry.workoutScores[tiebreakWorkoutId]?.display}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const divisionsToRender = divisionFilter === ALL_DIVISIONS
    ? divisions
    : [divisionFilter === NULL_DIVISION ? null : divisionFilter]

  const hasFilters = divisionFilter !== ALL_DIVISIONS || workoutFilter !== 'all' || sortBy !== 'overall' || searchTerm

  return (
    <div className="min-h-screen flex flex-col">
      <SlugNav slug={slug} />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
            {!isLoading && workouts.length > 0 && (
              <p className="text-gray-400 mt-1">
                {workouts.length} workout{workouts.length !== 1 ? 's' : ''} · Lower points = better
              </p>
            )}
          </div>
          {hasFilters && (
            <button
              onClick={() => { setDivisionFilter(ALL_DIVISIONS); setWorkoutFilter('all'); setSortBy('overall'); setSearch('') }}
              className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {!isLoading && (
          <div className="flex flex-wrap gap-3 mb-6">
            <input
              type="search"
              placeholder="Search athlete…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500 w-48"
            />
            {divisions.length > 1 && (
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500"
              >
                <option value={ALL_DIVISIONS}>All Divisions</option>
                {divisions.map((d) => (
                  <option key={d ?? NULL_DIVISION} value={d ?? NULL_DIVISION}>{d ?? 'No Division'}</option>
                ))}
              </select>
            )}
            <select
              value={workoutFilter}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value)
                setWorkoutFilter(val)
                setSortBy(val === 'all' ? 'overall' : val)
              }}
              className="rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Workouts</option>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>WOD {w.number}: {w.name}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value === 'overall' ? 'overall' : Number(e.target.value))}
              className="rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500"
            >
              <option value="overall">Sort: Overall</option>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>Sort: WOD {w.number}</option>
              ))}
            </select>
          </div>
        )}

        {isLoading && <div className="text-center text-gray-500 py-20 text-lg">Loading...</div>}

        {!isLoading && workouts.length === 0 && (
          <div className="text-center text-gray-500 py-20 text-lg">No completed workouts yet.</div>
        )}

        {!isLoading && workouts.length > 0 && (
          <div className="space-y-8">
            {divisionsToRender.map((d) => renderTable(d))}
          </div>
        )}
      </main>
    </div>
  )
}
