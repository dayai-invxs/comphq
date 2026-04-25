'use client'

import { REPS_MULTIPLIER } from '@/lib/scoreFormat'
import type { RRField } from '@/hooks/useScoreInputs'
import { keyNav } from '@/lib/keyNav'

const NAV = keyNav('workout-scores')

// Normalizes digit-only time strings to MM:SS or MM:SS.CC on blur.
// Strings already containing ':' pass through unchanged.
function normalizeTimeInput(raw: string): string {
  const s = raw.trim()
  if (!s || s.includes(':')) return s
  const digits = s.replace(/\D/g, '')
  if (!digits) return s

  let mins = 0, secs = 0, cs = 0
  if (digits.length <= 2) {
    secs = parseInt(digits)
  } else if (digits.length <= 4) {
    secs = parseInt(digits.slice(-2))
    mins = parseInt(digits.slice(0, -2))
  } else if (digits.length <= 6) {
    cs   = parseInt(digits.slice(-2))
    secs = parseInt(digits.slice(-4, -2))
    mins = parseInt(digits.slice(0, -4))
  } else {
    return s
  }

  if (secs >= 60) { mins += Math.floor(secs / 60); secs = secs % 60 }
  const ss = String(secs).padStart(2, '0')
  return cs > 0 ? `${mins}:${ss}.${String(cs).padStart(2, '0')}` : `${mins}:${ss}`
}

function TimeInput({
  value, onChange, onKeyDown, placeholder, className, dataGroup,
}: {
  value: string
  onChange: (val: string) => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  placeholder?: string
  className?: string
  dataGroup?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => { const n = normalizeTimeInput(value); if (n !== value) onChange(n) }}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? 'm:ss'}
      data-keynav-group={dataGroup}
      className={className}
    />
  )
}

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
  tiebreakEnabled, tiebreakScoreType, tiebreak, setTiebreak,
}: CommonProps & {
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  tiebreak: Record<number, string>
  setTiebreak: (updater: (p: Record<number, string>) => Record<number, string>) => void
}) {
  return (
    <>
      {scoreType === 'time' && (
        <TimeInput
          value={time[athleteId] ?? ''}
          onChange={(v) => setTime((p) => ({ ...p, [athleteId]: v }))}
          onKeyDown={NAV}
          dataGroup="workout-scores"
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
      {tiebreakEnabled && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-gray-500 text-xs w-12">TB:</span>
          {tiebreakScoreType === 'time' ? (
            <TimeInput
              value={tiebreak[athleteId] ?? ''}
              onChange={(v) => setTiebreak((p) => ({ ...p, [athleteId]: v }))}
              onKeyDown={NAV}
              dataGroup="workout-scores"
              className="w-24 bg-gray-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          ) : (
            <input
              type="number" step="any"
              value={tiebreak[athleteId] ?? ''}
              onChange={(e) => setTiebreak((p) => ({ ...p, [athleteId]: e.target.value }))}
              placeholder="0"
              data-keynav-group="workout-scores"
              onKeyDown={NAV}
              className="w-24 bg-gray-800 text-white rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          )}
        </div>
      )}
    </>
  )
}

export function PartBInputCell({ athleteId, scoreType, time, setTime, rr, setRr, weight, setWeight }: CommonProps) {
  return (
    <>
      {scoreType === 'time' && (
        <TimeInput
          value={time[athleteId] ?? ''}
          onChange={(v) => setTime((p) => ({ ...p, [athleteId]: v }))}
          onKeyDown={NAV}
          dataGroup="workout-scores"
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
