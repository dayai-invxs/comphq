import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKnockoutHeats } from './useKnockoutHeats'
import { laneKey, useScoreInputs } from './useScoreInputs'
import type { Assignment, Workout } from './useWorkoutDetail'

const athlete = (id: number) => ({ id, name: `A${id}`, bibNumber: null, division: { id: 1, name: 'Rx', order: 1 } })
const entry = (id: number, athleteId: number, heatNumber: number, round: number): Assignment =>
  ({ id, heatNumber, lane: id, round, athlete: athlete(athleteId), advanced: null })

const workout = {
  scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', lanes: 4,
  partBEnabled: false, partBScoreType: 'time', knockout: true, knockoutRounds: 2, knockoutAdvance: 1,
  scores: [], assignments: [entry(1, 1, 1, 1), entry(2, 2, 1, 1), entry(3, 3, 1, 1)],
} as unknown as Workout

function setup() {
  const setLaneAdvanced = vi.fn().mockResolvedValue(true)
  const { result } = renderHook(() => {
    const inputs = useScoreInputs(workout)
    return { inputs, ko: useKnockoutHeats(workout, inputs, setLaneAdvanced) }
  })
  act(() => result.current.inputs.setTimeInputs(() => ({ [laneKey(1)]: '1:10', [laneKey(2)]: '1:00', [laneKey(3)]: '1:20' })))
  return { result, setLaneAdvanced }
}

describe('useKnockoutHeats', () => {
  it('shows the fastest advancing from the scores as typed', () => {
    const { result } = setup()
    const heat = result.current.ko.heat(workout.assignments)!
    expect(heat).toMatchObject({ label: 'Round 1', isFinal: false, byHand: false, problem: null, editable: true })
    expect(workout.assignments.map((a) => heat.advancing(a))).toEqual([false, true, false])
    expect(result.current.ko.round).toBe(1)
    expect(result.current.ko.problems).toEqual([])
  })

  it('fixes the whole heat as shown on the first tick by hand', async () => {
    const { result, setLaneAdvanced } = setup()
    await act(async () => result.current.ko.heat(workout.assignments)!.onToggle(workout.assignments[0], true))
    expect(setLaneAdvanced.mock.calls.sort()).toEqual([[1, true], [2, true], [3, false]])
    const heat = result.current.ko.heat(workout.assignments)!
    expect(heat.byHand).toBe(true)
    expect(workout.assignments.map((a) => heat.advancing(a))).toEqual([true, true, false])
  })

  // A consolation heat places those who went out; nobody advances from it,
  // so it has no ticks and never holds the round up.
  it('shows a consolation heat with nothing to tick and nothing to settle', () => {
    const consolation = [2, 3].map((id) => ({ ...entry(10 + id, id, 2, 2), consolation: true }))
    const wk = { ...workout, knockoutRounds: 3, assignments: [...workout.assignments, ...consolation] } as unknown as Workout
    const { result } = renderHook(() => useKnockoutHeats(wk, useScoreInputs(wk), vi.fn()))
    const heat = result.current.heat(consolation)!
    expect(heat).toMatchObject({ label: 'Round 2 Consolation', consolation: true, isFinal: false, problem: null })
    expect(consolation.map((a) => heat.advancing(a))).toEqual([false, false])
    expect(result.current.problems).toEqual([])
  })

  // A heat shared by the winners and a consolation group: ticks and advancing
  // are about the winners' lanes only.
  it('decides a shared heat on its winners\' lanes alone', () => {
    const shared = [entry(21, 1, 2, 2), entry(22, 2, 2, 2), { ...entry(23, 3, 2, 2), consolation: true }]
    const wk = { ...workout, knockoutRounds: 3, assignments: [...workout.assignments, ...shared] } as unknown as Workout
    const setLaneAdvanced = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() => {
      const inputs = useScoreInputs(wk)
      return { inputs, ko: useKnockoutHeats(wk, inputs, setLaneAdvanced) }
    })
    act(() => result.current.inputs.setTimeInputs(() => ({ [laneKey(21)]: '1:10', [laneKey(22)]: '1:00', [laneKey(23)]: '0:50' })))
    const heat = result.current.ko.heat(shared)!
    expect(heat).toMatchObject({ label: 'Round 2 + Consolation', problem: null })
    expect(shared.map((a) => heat.advancing(a))).toEqual([false, true, false])
  })

  it('reports an unsettled heat for the round in play', () => {
    const setLaneAdvanced = vi.fn()
    const { result } = renderHook(() => useKnockoutHeats(workout, useScoreInputs(workout), setLaneAdvanced))
    expect(result.current.problems).toEqual(['Heat 1 has no scores and no one is ticked to advance.'])
  })
})
