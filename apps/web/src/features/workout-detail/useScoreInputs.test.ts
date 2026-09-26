import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScoreInputs } from './useScoreInputs'
import type { Workout } from './useWorkoutDetail'

const workout = {
  scoreType: 'rounds_reps', tiebreakEnabled: false, tiebreakScoreType: 'time',
  partBEnabled: false, partBScoreType: 'time', scores: [],
} as unknown as Workout

function enter(rounds: string, reps: string) {
  const { result } = renderHook(() => useScoreInputs(workout))
  act(() => result.current.setRrInputs(() => ({ 1: { rounds, reps } })))
  return result.current.buildPayload(1)
}

// COM-119. Some athletes report a rounds + reps workout as a plain rep total.
// Zero rounds (or none typed) plus the total must save as that total.
describe('rounds + reps entry', () => {
  it('saves 0 rounds and a rep total as the total', () => {
    expect(enter('0', '143')?.rawScore).toBe(143)
  })

  it('saves a rep total with the rounds left blank', () => {
    expect(enter('', '143')?.rawScore).toBe(143)
  })

  it('still saves rounds and reps together', () => {
    expect(enter('4', '23')?.rawScore).toBe(40023)
  })

  it('reloads 0 rounds and a rep total as typed', () => {
    const { result } = renderHook(() => useScoreInputs(workout))
    act(() => result.current.hydrate({ ...workout, scores: [{ athleteId: 1, rawScore: 143 }] } as unknown as Workout))
    expect(result.current.rrInputs[1]).toEqual({ rounds: '0', reps: '143' })
  })
})
