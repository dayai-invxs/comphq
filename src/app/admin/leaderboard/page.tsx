'use client'

import { useEffect, useState } from 'react'
import { formatScore } from '@/lib/scoreFormat'

type WorkoutSummary = { id: number; number: number; name: string; scoreType: string; status: string }
type WorkoutScore = { points: number; display: string } | null
type Entry = {
  athleteId: number
  athleteName: string
  divisionName: string | null
  totalPoints: number
  workoutScores: Record<number, WorkoutScore>
}

export default function LeaderboardPage() {
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then(({ workouts: ws, entries: es }) => {
        setWorkouts(ws)
        setEntries(es)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="text-gray-400">Loading...</div>

  if (workouts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Overall Leaderboard</h1>
        <p className="text-gray-400">No completed workouts yet.</p>
      </div>
    )
  }

  // Group entries by division for separate tables
  const divisions = [...new Set(entries.map((e) => e.divisionName))].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })

  function renderTable(divisionName: string | null) {
    const rows = entries.filter((e) => e.divisionName === divisionName)
    if (rows.length === 0) return null
    let rank = 1
    return (
      <div key={divisionName ?? 'none'} className="bg-gray-900 rounded-xl overflow-hidden">
        <div className="bg-gray-800 px-5 py-3">
          <h2 className="text-lg font-semibold text-orange-400">{divisionName ?? 'No Division'}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left px-5 py-2 text-gray-400 font-medium w-12">Rank</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
                {workouts.map((w) => (
                  <th key={w.id} className="text-left px-4 py-2 text-gray-400 font-medium whitespace-nowrap">
                    WOD {w.number}
                  </th>
                ))}
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Total Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry, i) => {
                const hasAnyScore = Object.values(entry.workoutScores).some((v) => v !== null)
                if (i > 0 && hasAnyScore) {
                  const prev = rows[i - 1]
                  if (entry.totalPoints > prev.totalPoints) rank = i + 1
                }
                const rankDisplay = hasAnyScore ? rank : '—'
                return (
                  <tr key={entry.athleteId} className="border-t border-gray-800">
                    <td className="px-5 py-3 font-bold text-gray-400">{rankDisplay}</td>
                    <td className="px-5 py-3 text-white font-medium">{entry.athleteName}</td>
                    {workouts.map((w) => {
                      const ws = entry.workoutScores[w.id]
                      return (
                        <td key={w.id} className="px-4 py-3">
                          {ws ? (
                            <div>
                              <span className={`font-bold ${ws.points === 1 ? 'text-yellow-400' : ws.points <= 3 ? 'text-orange-400' : 'text-white'}`}>
                                #{ws.points}
                              </span>
                              <span className="text-gray-500 text-xs ml-1">{ws.display}</span>
                            </div>
                          ) : (
                            <span className="text-gray-600">DNS</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-5 py-3 font-bold text-white">{hasAnyScore ? entry.totalPoints : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Overall Leaderboard</h1>
        <p className="text-gray-400 mt-1">
          Based on {workouts.length} completed workout{workouts.length !== 1 ? 's' : ''} · Lower points = better
        </p>
      </div>
      {divisions.map((d) => renderTable(d))}
    </div>
  )
}
