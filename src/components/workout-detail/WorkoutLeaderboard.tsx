'use client'

import { formatScore, formatTiebreak } from '@/lib/scoreFormat'
import type { Workout } from '@/hooks/useWorkoutDetail'

export default function WorkoutLeaderboard({ workout }: { workout: Workout }) {
  const ranked = [...workout.scores].filter((s) => s.points != null).sort((a, b) => (a.points ?? 0) - (b.points ?? 0))

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="bg-gray-800 px-5 py-3">
        <h2 className="font-semibold text-white">Leaderboard — WOD {workout.number}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-800/50">
          <tr>
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Rank</th>
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Score</th>
            <th className="text-left px-5 py-2 text-gray-400 font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s) => (
            <tr key={s.id} className="border-t border-gray-800">
              <td className="px-5 py-3 font-bold text-gray-400">{s.points}</td>
              <td className="px-5 py-3 text-white font-medium">{s.athlete.name}</td>
              <td className="px-5 py-3 text-gray-300">
                {formatScore(s.rawScore, workout.scoreType)}
                {s.tiebreakRawScore != null && <span className="text-xs text-blue-400 ml-1">TB {formatTiebreak(s.tiebreakRawScore)}</span>}
              </td>
              <td className="px-5 py-3">
                <span className={`font-bold ${s.points === 1 ? 'text-yellow-400' : s.points !== null && s.points <= 3 ? 'text-orange-400' : 'text-white'}`}>
                  {s.points}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
