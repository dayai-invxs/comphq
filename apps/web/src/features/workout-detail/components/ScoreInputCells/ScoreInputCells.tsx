import { Inline, Input, Text } from '@mond-design-system/react'
import { REPS_MULTIPLIER } from '@/lib/scoreFormat'
import { keyNav } from '@/lib/keyNav'
import type { RRField } from '../../useScoreInputs'
import styles from './ScoreInputCells.module.css'

// v1: src/components/workout-detail/ScoreInputCells.tsx. Tailwind became MDS
// controls; nothing else moved. normalizeTimeInput's arithmetic is v1's,
// character for character — it is what lets a judge type 312 and get 3:12, and
// the digit windows it reads from the right are not worth re-deriving. Only the
// declaration differs: v1 seeded `secs = 0`, which every surviving branch then
// overwrites, so the seed is left off and the compiler proves it is assigned.

const NAV = keyNav('workout-scores')

// Normalizes digit-only time strings to MM:SS or MM:SS.CC on blur.
// Strings already containing ':' pass through unchanged.
function normalizeTimeInput(raw: string): string {
  const s = raw.trim()
  if (!s || s.includes(':')) return s
  const digits = s.replace(/\D/g, '')
  if (!digits) return s

  let mins = 0, cs = 0
  let secs: number
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
  value, onChange, label, className,
}: {
  value: string
  onChange: (val: string) => void
  label: string
  className?: string
}) {
  return (
    <Input
      type="text"
      size="sm"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => { const n = normalizeTimeInput(value); if (n !== value) onChange(n) }}
      onKeyDown={NAV}
      placeholder="m:ss"
      data-keynav-group="workout-scores"
      className={className ?? styles.time}
    />
  )
}

function RoundsReps({
  value, onRounds, onReps, part,
}: {
  value: RRField | undefined
  onRounds: (v: string) => void
  onReps: (v: string) => void
  part: string
}) {
  return (
    <Inline gap="hairline" align="center">
      <Input
        type="number" min="0" size="sm"
        aria-label={`${part} rounds`}
        value={value?.rounds ?? ''}
        onChange={(e) => onRounds(e.target.value)}
        placeholder="0"
        data-keynav-group="workout-scores"
        onKeyDown={NAV}
        className={styles.count}
      />
      <Text variant="meta" tone="muted">rds</Text>
      <Input
        type="number" min="0" max={REPS_MULTIPLIER - 1} size="sm"
        aria-label={`${part} reps`}
        value={value?.reps ?? ''}
        onChange={(e) => onReps(e.target.value)}
        placeholder="0"
        data-keynav-group="workout-scores"
        onKeyDown={NAV}
        className={styles.count}
      />
      <Text variant="meta" tone="muted">reps</Text>
    </Inline>
  )
}

type Setter<T> = (updater: (p: Record<number, T>) => Record<number, T>) => void

type CommonProps = {
  athleteId: number
  scoreType: string
  time: Record<number, string>
  setTime: Setter<string>
  rr: Record<number, RRField>
  setRr: Setter<RRField>
  weight: Record<number, string>
  setWeight: Setter<string>
}

function ScoreControl({
  athleteId, scoreType, time, setTime, rr, setRr, weight, setWeight, part,
}: CommonProps & { part: string }) {
  if (scoreType === 'time') {
    return (
      <TimeInput
        label={`${part} time`}
        value={time[athleteId] ?? ''}
        onChange={(v) => setTime((p) => ({ ...p, [athleteId]: v }))}
      />
    )
  }
  if (scoreType === 'rounds_reps') {
    return (
      <RoundsReps
        part={part}
        value={rr[athleteId]}
        onRounds={(v) => setRr((p) => ({ ...p, [athleteId]: { ...p[athleteId], rounds: v } }))}
        onReps={(v) => setRr((p) => ({ ...p, [athleteId]: { ...p[athleteId], reps: v } }))}
      />
    )
  }
  return (
    <Input
      type="number" step="any" size="sm"
      aria-label={`${part} score`}
      value={weight[athleteId] ?? ''}
      onChange={(e) => setWeight((p) => ({ ...p, [athleteId]: e.target.value }))}
      placeholder="Score"
      data-keynav-group="workout-scores"
      onKeyDown={NAV}
      className={styles.time}
    />
  )
}

export function PartAInputCell({
  tiebreakEnabled, tiebreakScoreType, tiebreak, setTiebreak, ...common
}: CommonProps & {
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  tiebreak: Record<number, string>
  setTiebreak: Setter<string>
}) {
  const { athleteId } = common
  return (
    <>
      <ScoreControl {...common} part="Score" />
      {tiebreakEnabled && (
        <Inline gap="hairline" align="center" className={styles.tiebreak}>
          <Text variant="meta" tone="muted">TB:</Text>
          {tiebreakScoreType === 'time' ? (
            <TimeInput
              label="Tiebreak time"
              value={tiebreak[athleteId] ?? ''}
              onChange={(v) => setTiebreak((p) => ({ ...p, [athleteId]: v }))}
              className={styles.tiebreakBox}
            />
          ) : (
            <Input
              type="number" step="any" size="sm"
              aria-label="Tiebreak score"
              value={tiebreak[athleteId] ?? ''}
              onChange={(e) => setTiebreak((p) => ({ ...p, [athleteId]: e.target.value }))}
              placeholder="0"
              data-keynav-group="workout-scores"
              onKeyDown={NAV}
              className={styles.tiebreakBox}
            />
          )}
        </Inline>
      )}
    </>
  )
}

export function PartBInputCell(props: CommonProps) {
  return <ScoreControl {...props} part="Part B" />
}
