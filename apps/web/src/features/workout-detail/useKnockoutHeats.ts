'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  advancers, currentRound, heatResult, isConsolation, roundOf,
  type KnockoutLane, type KnockoutWorkout,
} from '@/lib/knockout'
import type { KnockoutHeat } from './components/HeatCard/HeatCard'
import { laneKey, type useScoreInputs } from './useScoreInputs'
import type { Assignment, Workout } from './useWorkoutDetail'

type ScoreInputs = ReturnType<typeof useScoreInputs>

// A knockout workout's heats on the admin screen: which round each heat is,
// who is shown advancing (from the scores as typed, or ticks made by hand),
// and what stops the round from being completed. Ticks are saved at once and
// shown before the save lands; a reload of the workout starts them over from
// what the server holds.

export function useKnockoutHeats(
  workout: Workout | null,
  inputs: ScoreInputs,
  setLaneAdvanced: (assignmentId: number, advanced: boolean | null) => Promise<boolean>,
) {
  const [picks, setPicks] = useState<Record<number, boolean | null>>({})
  useEffect(() => { setPicks({}) }, [workout])

  const advancedOf = useCallback(
    (a: Assignment) => (a.id in picks ? picks[a.id] : a.advanced ?? null), [picks])

  const enabled = workout?.knockout === true
  const rules: KnockoutWorkout | null = workout && enabled
    ? {
        scoreType: workout.scoreType, tiebreakEnabled: workout.tiebreakEnabled,
        tiebreakScoreType: workout.tiebreakScoreType, lanes: workout.lanes,
        knockoutRounds: workout.knockoutRounds ?? 1, knockoutAdvance: workout.knockoutAdvance ?? 1,
        knockoutConsolation: workout.knockoutConsolation ?? false,
      }
    : null

  // Scores as typed, so the ticks follow the boxes before anything is saved.
  const toLane = (a: Assignment): KnockoutLane => {
    const typed = inputs.buildPayload(laneKey(a.id))
    return {
      id: a.id, athleteId: a.athlete.id, divisionId: a.athlete.division?.id ?? null,
      heatNumber: a.heatNumber, lane: a.lane, round: a.round ?? null,
      rawScore: typed?.rawScore ?? null, capped: typed?.capped ?? false,
      tiebreakRawScore: typed?.tiebreakRawScore ?? null, advanced: advancedOf(a),
      consolation: a.consolation ?? false,
    }
  }

  const lanes = rules && workout ? workout.assignments.map(toLane) : []
  const round = currentRound(lanes)
  const rounds = rules?.knockoutRounds ?? 1
  const latest = lanes.filter((l) => roundOf(l) === round)
  const problems = rules && round > 0 && round < rounds ? advancers(latest, rules).problems : []

  async function save(changes: Array<[number, boolean | null]>) {
    setPicks((p) => ({ ...p, ...Object.fromEntries(changes) }))
    const results = await Promise.all(changes.map(([id, v]) => setLaneAdvanced(id, v)))
    // A refused tick falls back to what the server holds (the error is in the banner).
    const refused = changes.filter((_, i) => !results[i]).map(([id]) => id)
    if (refused.length) {
      setPicks((p) => {
        const next = { ...p }
        for (const id of refused) delete next[id]
        return next
      })
    }
  }

  function heat(entries: Assignment[]): KnockoutHeat | undefined {
    if (!rules || entries.length === 0) return undefined
    const heatRound = roundOf(entries[0])
    const isFinal = heatRound >= rounds
    const editable = heatRound === round
    const heatLanes = entries.map(toLane)

    if (entries.some(isConsolation)) {
      // Ranked by score for places among those who went out; no ticks.
      return {
        label: `Round ${heatRound} Consolation`, isFinal: false, consolation: true, editable,
        problem: null, byHand: false, advancing: () => false,
        onToggle: () => {}, onUseScores: () => {},
      }
    }

    if (isFinal) {
      // The final is ranked by score; a tick only names a winner by hand.
      return {
        label: 'Final', isFinal, editable, problem: null,
        byHand: entries.some((a) => advancedOf(a) != null),
        advancing: (a) => advancedOf(a) === true,
        onToggle: (a, on) => void save([[a.id, on ? true : null]]),
        onUseScores: () => void save(entries.map((a) => [a.id, null])),
      }
    }

    const result = heatResult(heatLanes, rules)
    return {
      label: `Round ${heatRound}`, isFinal, editable,
      problem: editable ? result.problem : null,
      byHand: !result.suggested,
      advancing: (a) => result.advancing.has(a.id),
      // The first tick by hand fixes the whole heat as shown, so the lanes the
      // scores had chosen stay chosen.
      onToggle: (target, on) => void save(entries
        .map((a): [number, boolean] => [a.id, a.id === target.id ? on : result.advancing.has(a.id)])
        .filter(([id, v]) => advancedOf(entries.find((a) => a.id === id)!) !== v)),
      onUseScores: () => void save(entries.map((a) => [a.id, null])),
    }
  }

  return { enabled, round, rounds, problems, heat }
}
