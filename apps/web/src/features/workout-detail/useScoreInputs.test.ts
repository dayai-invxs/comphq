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

describe('capped entry on a time workout', () => {
  const timed = { ...workout, scoreType: 'time', partBEnabled: true } as unknown as Workout

  it('saves rounds and reps and says so', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => {
      result.current.setCappedInputs(() => ({ 1: true }))
      result.current.setRrInputs(() => ({ 1: { rounds: '4', reps: '12' } }))
    })
    expect(result.current.buildPayload(1)).toMatchObject({ rawScore: 40012, capped: true, partBCapped: false })
  })

  it('takes a tick with nothing typed as zero work done, not as no score', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => result.current.setCappedInputs(() => ({ 1: true })))
    expect(result.current.buildPayload(1)).toMatchObject({ rawScore: 0, capped: true })
  })

  it('saves a finished time as not capped', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => result.current.setTimeInputs(() => ({ 1: '5:30' })))
    expect(result.current.buildPayload(1)).toMatchObject({ rawScore: 330000, capped: false })
  })

  it('keeps a capped Part B of zero work', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => {
      result.current.setTimeInputs(() => ({ 1: '5:30' }))
      result.current.setPartBCappedInputs(() => ({ 1: true }))
    })
    expect(result.current.buildPayload(1)).toMatchObject({ partBRawScore: 0, partBCapped: true })
  })

  it('reloads a capped score into rounds and reps with the box ticked', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => result.current.hydrate({
      ...timed,
      scores: [{ athleteId: 1, rawScore: 40012, capped: true, partBRawScore: null }],
    } as unknown as Workout))
    expect(result.current.cappedInputs[1]).toBe(true)
    expect(result.current.rrInputs[1]).toEqual({ rounds: '4', reps: '12' })
    expect(result.current.timeInputs[1]).toBeUndefined()
  })
})
