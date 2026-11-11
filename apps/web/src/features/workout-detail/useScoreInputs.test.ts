import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { laneKey, useScoreInputs } from './useScoreInputs'
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

describe('a team split across heats', () => {
  const timed = { ...workout, scoreType: 'time', assignments: [] } as unknown as Workout

  it('sends each typed lane, and leaves blank lanes out', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => result.current.setTimeInputs(() => ({ [laneKey(31)]: '1:00', [laneKey(33)]: '2:30' })))
    expect(result.current.buildLanePayload(2, [31, 32, 33])).toEqual({
      athleteId: 2,
      lanes: [
        { assignmentId: 31, rawScore: 60_000, capped: false, tiebreakRawScore: null, partBRawScore: null },
        { assignmentId: 33, rawScore: 150_000, capped: false, tiebreakRawScore: null, partBRawScore: null },
      ],
    })
    expect(result.current.buildLanePayload(2, [32])).toBeNull()
  })

  it('reloads each lane into its own box, apart from the team total', () => {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => result.current.hydrate({
      ...timed,
      scores: [{ athleteId: 2, rawScore: 150_000, capped: false }],
      assignments: [{ id: 31, rawScore: 60_000 }, { id: 33, rawScore: 90_000 }],
    } as unknown as Workout))
    expect(result.current.timeInputs[laneKey(31)]).toBe('1:00')
    expect(result.current.timeInputs[laneKey(33)]).toBe('1:30')
  })
})

// A reload refills the boxes from the server. A score typed and not saved
// must survive it; one the server now has takes the server's version.
describe('reloading with scores typed but not saved', () => {
  const timed = { ...workout, scoreType: 'time', assignments: [] } as unknown as Workout
  const withScores = (...s: [number, number][]) =>
    ({ ...timed, scores: s.map(([athleteId, rawScore]) => ({ athleteId, rawScore })) }) as unknown as Workout

  function typed() {
    const { result } = renderHook(() => useScoreInputs(timed))
    act(() => result.current.hydrate(withScores([1, 180000])))
    act(() => result.current.setTimeInputs((p) => ({ ...p, 2: '4:5', 3: '5:00' })))
    return result
  }

  it('keeps an unsaved score, and says it is unsaved', () => {
    const result = typed()
    expect(result.current.isUnsaved(2)).toBe(true)
    expect(result.current.isUnsaved(1)).toBe(false)
    act(() => result.current.hydrate(withScores([1, 180000])))
    expect(result.current.timeInputs).toEqual({ 1: '3:00', 2: '4:5', 3: '5:00' })
  })

  it('takes the server’s version once the server has it', () => {
    const result = typed()
    act(() => result.current.hydrate(withScores([1, 180000], [2, 245000])))
    expect(result.current.timeInputs[2]).toBe('4:05')
    expect(result.current.isUnsaved(2)).toBe(false)
    expect(result.current.timeInputs[3]).toBe('5:00')
  })

  it('keeps a changed score over the saved one it changes', () => {
    const result = typed()
    act(() => result.current.setTimeInputs((p) => ({ ...p, 1: '2:59' })))
    act(() => result.current.hydrate(withScores([1, 180000])))
    expect(result.current.timeInputs[1]).toBe('2:59')
  })

  it('lets a server change through to a box nobody touched', () => {
    const result = typed()
    act(() => result.current.hydrate(withScores([1, 170000])))
    expect(result.current.timeInputs[1]).toBe('2:50')
  })

  it('keeps nothing after the boxes are cleared', () => {
    const result = typed()
    act(() => result.current.clear())
    act(() => result.current.hydrate(withScores()))
    expect(result.current.timeInputs).toEqual({})
  })
})
