'use client'

import { useCallback, useMemo, useState } from 'react'
import { roundsRepsToScore, scoreToRoundsReps, timeToMs, msToTimeParts } from '@/lib/scoreFormat'
import type { LaneScorePayload, ScorePayload, SplitScorePayload, Workout } from './useWorkoutDetail'

export type RRField = { rounds: string; reps: string }

function parseTimeInput(str: string): number {
  const s = str.trim()
  if (!s) return 0
  const m = s.match(/^(\d+):(\d{1,2})(?:[.:](\d{1,2}))?$/)
  if (!m) return 0
  const mins = parseInt(m[1]) || 0, secs = parseInt(m[2]) || 0
  // Fractional part is centiseconds (hundredths); multiply by 10 to get ms
  const cs = m[3] ? parseInt(m[3].padEnd(2, '0')) : 0
  return timeToMs(mins, secs, cs * 10)
}

export function formatTimeInput(ms: number): string {
  const { mins, secs, ms: millis } = msToTimeParts(ms)
  const ss = String(secs).padStart(2, '0')
  const cs = Math.round(millis / 10)
  if (cs > 0) return `${mins}:${ss}.${String(cs).padStart(2, '0')}`
  return `${mins}:${ss}`
}

/**
 * The input key for one lane of a team placed in more than one heat. Inputs
 * are keyed by athlete id; a split team's lanes each need their own boxes, so
 * they use the lane's assignment id, negated so it cannot meet an athlete id.
 */
export const laneKey = (assignmentId: number) => -assignmentId

export function useScoreInputs(workout: Workout | null) {
  const [weightInputs, setWeightInputs] = useState<Record<number, string>>({})
  const [timeInputs, setTimeInputs] = useState<Record<number, string>>({})
  const [rrInputs, setRrInputs] = useState<Record<number, RRField>>({})
  const [tiebreakInputs, setTiebreakInputs] = useState<Record<number, string>>({})
  const [partBTimeInputs, setPartBTimeInputs] = useState<Record<number, string>>({})
  const [partBWeightInputs, setPartBWeightInputs] = useState<Record<number, string>>({})
  const [partBRrInputs, setPartBRrInputs] = useState<Record<number, RRField>>({})
  // A capped time is entered as rounds and reps, in the same boxes a rounds-and-
  // reps workout uses; these say which of the two a time workout's row is showing.
  const [cappedInputs, setCappedInputs] = useState<Record<number, boolean>>({})
  const [partBCappedInputs, setPartBCappedInputs] = useState<Record<number, boolean>>({})

  // Hydrate inputs from workout.scores (called by consumer after load).
  const hydrate = useCallback((w: Workout) => {
    const wI: Record<number, string> = {}, tI: Record<number, string> = {}, rI: Record<number, RRField> = {}, tbI: Record<number, string> = {}
    const bTI: Record<number, string> = {}, bWI: Record<number, string> = {}, bRI: Record<number, RRField> = {}
    const cI: Record<number, boolean> = {}, bCI: Record<number, boolean> = {}
    for (const s of w.scores) {
      if (s.capped) {
        const rr = scoreToRoundsReps(s.rawScore)
        cI[s.athleteId] = true
        rI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) }
      } else if (w.scoreType === 'time') {
        tI[s.athleteId] = formatTimeInput(s.rawScore)
      } else if (w.scoreType === 'rounds_reps') {
        const rr = scoreToRoundsReps(s.rawScore)
        rI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) }
      } else {
        wI[s.athleteId] = String(s.rawScore)
      }
      if (w.tiebreakEnabled && s.tiebreakRawScore != null) {
        tbI[s.athleteId] = w.tiebreakScoreType === 'time'
          ? formatTimeInput(s.tiebreakRawScore)
          : String(s.tiebreakRawScore)
      }
      if (s.partBRawScore != null) {
        if (s.partBCapped) {
          const rr = scoreToRoundsReps(s.partBRawScore)
          bCI[s.athleteId] = true
          bRI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) }
        } else if (w.partBScoreType === 'time') bTI[s.athleteId] = formatTimeInput(s.partBRawScore)
        else if (w.partBScoreType === 'rounds_reps') {
          const rr = scoreToRoundsReps(s.partBRawScore)
          bRI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) }
        } else {
          bWI[s.athleteId] = String(s.partBRawScore)
        }
      }
    }
    // A split team's lanes: plain entries, never capped (a member's time is
    // entered as their total, penalties included).
    for (const a of w.assignments ?? []) {
      const k = laneKey(a.id)
      if (a.rawScore != null) {
        if (w.scoreType === 'time') tI[k] = formatTimeInput(a.rawScore)
        else if (w.scoreType === 'rounds_reps') {
          const rr = scoreToRoundsReps(a.rawScore)
          rI[k] = { rounds: String(rr.rounds), reps: String(rr.reps) }
        } else wI[k] = String(a.rawScore)
      }
      if (w.tiebreakEnabled && a.tiebreakRawScore != null) {
        tbI[k] = w.tiebreakScoreType === 'time' ? formatTimeInput(a.tiebreakRawScore) : String(a.tiebreakRawScore)
      }
      if (a.partBRawScore != null) {
        if (w.partBScoreType === 'time') bTI[k] = formatTimeInput(a.partBRawScore)
        else if (w.partBScoreType === 'rounds_reps') {
          const rr = scoreToRoundsReps(a.partBRawScore)
          bRI[k] = { rounds: String(rr.rounds), reps: String(rr.reps) }
        } else bWI[k] = String(a.partBRawScore)
      }
    }
    setWeightInputs(wI); setTimeInputs(tI); setRrInputs(rI); setTiebreakInputs(tbI)
    setPartBTimeInputs(bTI); setPartBWeightInputs(bWI); setPartBRrInputs(bRI)
    setCappedInputs(cI); setPartBCappedInputs(bCI)
  }, [])

  const clear = useCallback(() => {
    setWeightInputs({}); setTimeInputs({}); setRrInputs({}); setTiebreakInputs({})
    setPartBTimeInputs({}); setPartBWeightInputs({}); setPartBRrInputs({})
    setCappedInputs({}); setPartBCappedInputs({})
  }, [])

  // Build a ScorePayload for a single athlete, or null when nothing's entered.
  const buildPayload = useCallback((athleteId: number): ScorePayload | null => {
    if (!workout) return null
    let rawScore: number
    let tiebreakRawScore: number | null = null
    let partBRawScore: number | null = null

    // Ticking Capped is an entry in itself: zero rounds and zero reps is a score.
    const capped = workout.scoreType === 'time' && !!cappedInputs[athleteId]
    const partBCapped = workout.partBEnabled && workout.partBScoreType === 'time' && !!partBCappedInputs[athleteId]

    if (capped) {
      const r = rrInputs[athleteId]
      rawScore = roundsRepsToScore(Number(r?.rounds) || 0, Number(r?.reps) || 0)
    } else if (workout.scoreType === 'time') {
      rawScore = parseTimeInput(timeInputs[athleteId] ?? '')
      if (rawScore === 0) return null
    } else if (workout.scoreType === 'rounds_reps') {
      const r = rrInputs[athleteId]
      if (!r) return null
      rawScore = roundsRepsToScore(Number(r.rounds) || 0, Number(r.reps) || 0)
    } else {
      const raw = weightInputs[athleteId]
      if (raw === undefined || raw === '') return null
      rawScore = Number(raw)
    }

    if (workout.tiebreakEnabled) {
      const tb = tiebreakInputs[athleteId]
      if (tb) {
        tiebreakRawScore = workout.tiebreakScoreType === 'time'
          ? parseTimeInput(tb) || null
          : parseFloat(tb) || null
      }
    }

    if (partBCapped) {
      const r = partBRrInputs[athleteId]
      partBRawScore = roundsRepsToScore(Number(r?.rounds) || 0, Number(r?.reps) || 0)
    } else if (workout.partBEnabled) {
      if (workout.partBScoreType === 'time') {
        partBRawScore = parseTimeInput(partBTimeInputs[athleteId] ?? '') || null
      } else if (workout.partBScoreType === 'rounds_reps') {
        const r = partBRrInputs[athleteId]
        if (r) partBRawScore = roundsRepsToScore(Number(r.rounds) || 0, Number(r.reps) || 0) || null
      } else {
        const raw = partBWeightInputs[athleteId]
        if (raw !== undefined && raw !== '') partBRawScore = Number(raw)
      }
    }

    return { athleteId, rawScore, tiebreakRawScore, partBRawScore, capped, partBCapped }
  }, [workout, timeInputs, rrInputs, tiebreakInputs, weightInputs, partBTimeInputs, partBRrInputs, partBWeightInputs, cappedInputs, partBCappedInputs])

  // A split team's payload: one entry per lane with something typed in. Lanes
  // left blank are not sent, so they keep what the server has. Null when none.
  const buildLanePayload = useCallback((athleteId: number, assignmentIds: number[]): SplitScorePayload | null => {
    const lanes: LaneScorePayload[] = []
    for (const id of assignmentIds) {
      const p = buildPayload(laneKey(id))
      if (p) lanes.push({ assignmentId: id, rawScore: p.rawScore, tiebreakRawScore: p.tiebreakRawScore, partBRawScore: p.partBRawScore })
    }
    return lanes.length ? { athleteId, lanes } : null
  }, [buildPayload])

  const api = useMemo(() => ({
    weightInputs, timeInputs, rrInputs, tiebreakInputs,
    partBTimeInputs, partBWeightInputs, partBRrInputs,
    cappedInputs, partBCappedInputs, setCappedInputs, setPartBCappedInputs,
    setWeightInputs, setTimeInputs, setRrInputs, setTiebreakInputs,
    setPartBTimeInputs, setPartBWeightInputs, setPartBRrInputs,
    hydrate, clear, buildPayload, buildLanePayload,
  }), [
    weightInputs, timeInputs, rrInputs, tiebreakInputs,
    partBTimeInputs, partBWeightInputs, partBRrInputs,
    cappedInputs, partBCappedInputs,
    hydrate, clear, buildPayload, buildLanePayload,
  ])

  return api
}
