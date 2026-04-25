'use client'

import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import type { Workout } from '@/hooks/useWorkoutDetail'

export default function WorkoutLeaderboard({ workout }: { workout: Workout }) {
  const ranked = [...workout.scores]
    .filter((s) => s.points != null)
    .sort((a, b) => {
      const aTotal = (a.points ?? 0) + (workout.partBEnabled ? (a.partBPoints ?? 0) : 0)
      const bTotal = (b.points ?? 0) + (workout.partBEnabled ? (b.partBPoints ?? 0) : 0)
      return aTotal - bTotal
    })

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="bg-gray-800 px-5 py-3">
        <h2 className="font-semibold text-white">Leaderboard — WOD {workout.number}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-800/50">
          <tr>
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Part A</th>
            {workout.partBEnabled && <th className="text-left px-5 py-2 text-gray-400 font-medium">Part B</th>}
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s) => {
            const totalPts = (s.points ?? 0) + (workout.partBEnabled ? (s.partBPoints ?? 0) : 0)
            return (
              <tr key={s.id} className="border-t border-gray-800">
                <td className="px-5 py-3 text-white font-medium">{s.athlete.name}</td>
                <td className="px-5 py-3 text-gray-300">
                  <span className={`font-bold mr-1 ${s.points === 1 ? 'text-yellow-400' : s.points !== null && s.points <= 3 ? 'text-orange-400' : 'text-white'}`}>#{s.points}</span>
                  <span className="text-gray-500 text-xs">{formatScore(s.rawScore, workout.scoreType)}</span>
                  {!workout.partBEnabled && s.tiebreakRawScore != null && (
                    <span className="text-xs text-blue-400 ml-1">TB {workout.tiebreakScoreType === 'time' ? formatTiebreak(s.tiebreakRawScore) : formatScore(s.tiebreakRawScore, workout.tiebreakScoreType)}</span>
                  )}
                </td>
                {workout.partBEnabled && (
                  <td className="px-5 py-3 text-gray-300">
                    {s.partBPoints != null ? (
                      <>
                        <span className={`font-bold mr-1 ${s.partBPoints === 1 ? 'text-yellow-400' : s.partBPoints <= 3 ? 'text-orange-400' : 'text-white'}`}>#{s.partBPoints}</span>
                        {s.partBRawScore != null && <span className="text-gray-500 text-xs">{formatScore(s.partBRawScore, workout.partBScoreType)}</span>}
                      </>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                )}
                <td className="px-5 py-3">
                  <span className={`font-bold ${totalPts <= 2 ? 'text-yellow-400' : totalPts <= 6 ? 'text-orange-400' : 'text-white'}`}>
                    {totalPts}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
