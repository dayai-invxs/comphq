'use client'

import { useCallback, useMemo, useState } from 'react'
import { roundsRepsToScore, scoreToRoundsReps, timeToMs, msToTimeParts } from '@/lib/scoreFormat'
import type { ScorePayload, Workout } from './useWorkoutDetail'

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

export function useScoreInputs(workout: Workout | null) {
  const [weightInputs, setWeightInputs] = useState<Record<number, string>>({})
  const [timeInputs, setTimeInputs] = useState<Record<number, string>>({})
  const [rrInputs, setRrInputs] = useState<Record<number, RRField>>({})
  const [tiebreakInputs, setTiebreakInputs] = useState<Record<number, string>>({})
  const [partBTimeInputs, setPartBTimeInputs] = useState<Record<number, string>>({})
  const [partBWeightInputs, setPartBWeightInputs] = useState<Record<number, string>>({})
  const [partBRrInputs, setPartBRrInputs] = useState<Record<number, RRField>>({})

  // Hydrate inputs from workout.scores (called by consumer after load).
  const hydrate = useCallback((w: Workout) => {
    const wI: Record<number, string> = {}, tI: Record<number, string> = {}, rI: Record<number, RRField> = {}, tbI: Record<number, string> = {}
    const bTI: Record<number, string> = {}, bWI: Record<number, string> = {}, bRI: Record<number, RRField> = {}
    for (const s of w.scores) {
      if (w.scoreType === 'time') {
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
        if (w.partBScoreType === 'time') bTI[s.athleteId] = formatTimeInput(s.partBRawScore)
        else if (w.partBScoreType === 'rounds_reps') {
          const rr = scoreToRoundsReps(s.partBRawScore)
          bRI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) }
        } else {
          bWI[s.athleteId] = String(s.partBRawScore)
        }
      }
    }
    setWeightInputs(wI); setTimeInputs(tI); setRrInputs(rI); setTiebreakInputs(tbI)
    setPartBTimeInputs(bTI); setPartBWeightInputs(bWI); setPartBRrInputs(bRI)
  }, [])

  const clear = useCallback(() => {
    setWeightInputs({}); setTimeInputs({}); setRrInputs({}); setTiebreakInputs({})
    setPartBTimeInputs({}); setPartBWeightInputs({}); setPartBRrInputs({})
  }, [])

  // Build a ScorePayload for a single athlete, or null when nothing's entered.
  const buildPayload = useCallback((athleteId: number): ScorePayload | null => {
    if (!workout) return null
    let rawScore: number
    let tiebreakRawScore: number | null = null
    let partBRawScore: number | null = null

    if (workout.scoreType === 'time') {
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

    if (workout.partBEnabled) {
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

    return { athleteId, rawScore, tiebreakRawScore, partBRawScore }
  }, [workout, timeInputs, rrInputs, tiebreakInputs, weightInputs, partBTimeInputs, partBRrInputs, partBWeightInputs])

  const api = useMemo(() => ({
    weightInputs, timeInputs, rrInputs, tiebreakInputs,
    partBTimeInputs, partBWeightInputs, partBRrInputs,
    setWeightInputs, setTimeInputs, setRrInputs, setTiebreakInputs,
    setPartBTimeInputs, setPartBWeightInputs, setPartBRrInputs,
    hydrate, clear, buildPayload,
  }), [
    weightInputs, timeInputs, rrInputs, tiebreakInputs,
    partBTimeInputs, partBWeightInputs, partBRrInputs,
    hydrate, clear, buildPayload,
  ])

  return api
}
