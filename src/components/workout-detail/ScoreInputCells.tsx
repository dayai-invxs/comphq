'use client'

import { REPS_MULTIPLIER } from '@/lib/scoreFormat'
import type { RRField } from '@/hooks/useScoreInputs'
import { keyNav } from '@/lib/keyNav'

const NAV = keyNav('workout-scores')

type CommonProps = {
  athleteId: number
  scoreType: string
  time: Record<number, string>
  setTime: (updater: (p: Record<number, string>) => Record<number, string>) => void
  rr: Record<number, RRField>
  setRr: (updater: (p: Record<number, RRField>) => Record<number, RRField>) => void
  weight: Record<number, string>
  setWeight: (updater: (p: Record<number, string>) => Record<number, string>) => void
}

export function PartAInputCell({
  athleteId, scoreType, time, setTime, rr, setRr, weight, setWeight,
  tiebreakEnabled, tiebreak, setTiebreak,
}: CommonProps & {
  tiebreakEnabled: boolean
  tiebreak: Record<number, string>
  setTiebreak: (updater: (p: Record<number, string>) => Record<number, string>) => void
}) {
  return (
    <>
      {scoreType === 'time' && (
        <input
          type="text"
          value={time[athleteId] ?? ''}
          onChange={(e) => setTime((p) => ({ ...p, [athleteId]: e.target.value }))}
          placeholder="0:00.000"
          data-keynav-group="workout-scores"
          onKeyDown={NAV}
          className="w-28 bg-gray-800 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      )}
      {scoreType === 'rounds_reps' && (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <input
              type="number" min="0"
              value={rr[athleteId]?.rounds ?? ''}
              onChange={(e) => setRr((p) => ({ ...p, [athleteId]: { ...p[athleteId], rounds: e.target.value } }))}
              placeholder="0"
              data-keynav-group="workout-scores"
              onKeyDown={NAV}
              className="w-16 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <span className="text-gray-500 text-xs">rds</span>
            <input
              type="number" min="0" max={REPS_MULTIPLIER - 1}
              value={rr[athleteId]?.reps ?? ''}
              onChange={(e) => setRr((p) => ({ ...p, [athleteId]: { ...p[athleteId], reps: e.target.value } }))}
              placeholder="0"
              data-keynav-group="workout-scores"
              onKeyDown={NAV}
              className="w-16 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <span className="text-gray-500 text-xs">reps</span>
          </div>
          {tiebreakEnabled && (
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-xs w-12">TB:</span>
              <input
                type="text"
                value={tiebreak[athleteId] ?? ''}
                onChange={(e) => setTiebreak((p) => ({ ...p, [athleteId]: e.target.value }))}
                placeholder="0:00.000"
                data-keynav-group="workout-scores"
                onKeyDown={NAV}
                className="w-24 bg-gray-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          )}
        </div>
      )}
      {scoreType !== 'time' && scoreType !== 'rounds_reps' && (
        <input
          type="number" step="any"
          value={weight[athleteId] ?? ''}
          onChange={(e) => setWeight((p) => ({ ...p, [athleteId]: e.target.value }))}
          placeholder="Score"
          data-keynav-group="workout-scores"
          onKeyDown={NAV}
          className="w-28 bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      )}
    </>
  )
}

export function PartBInputCell({ athleteId, scoreType, time, setTime, rr, setRr, weight, setWeight }: CommonProps) {
  return (
    <>
      {scoreType === 'time' && (
        <input
          type="text"
          value={time[athleteId] ?? ''}
          onChange={(e) => setTime((p) => ({ ...p, [athleteId]: e.target.value }))}
          placeholder="0:00.000"
          data-keynav-group="workout-scores"
          onKeyDown={NAV}
          className="w-28 bg-gray-800 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      )}
      {scoreType === 'rounds_reps' && (
        <div className="flex items-center gap-1">
          <input
            type="number" min="0"
            value={rr[athleteId]?.rounds ?? ''}
            onChange={(e) => setRr((p) => ({ ...p, [athleteId]: { ...p[athleteId], rounds: e.target.value } }))}
            placeholder="0"
            data-keynav-group="workout-scores"
            onKeyDown={NAV}
            className="w-14 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <span className="text-gray-500 text-xs">rds</span>
          <input
            type="number" min="0" max={REPS_MULTIPLIER - 1}
            value={rr[athleteId]?.reps ?? ''}
            onChange={(e) => setRr((p) => ({ ...p, [athleteId]: { ...p[athleteId], reps: e.target.value } }))}
            placeholder="0"
            data-keynav-group="workout-scores"
            onKeyDown={NAV}
            className="w-14 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <span className="text-gray-500 text-xs">reps</span>
        </div>
      )}
      {scoreType !== 'time' && scoreType !== 'rounds_reps' && (
        <input
          type="number" step="any"
          value={weight[athleteId] ?? ''}
          onChange={(e) => setWeight((p) => ({ ...p, [athleteId]: e.target.value }))}
          placeholder="Score"
          data-keynav-group="workout-scores"
          onKeyDown={NAV}
          className="w-28 bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      )}
    </>
  )
}
