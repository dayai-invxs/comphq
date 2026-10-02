import { describe, expect, it } from 'vitest'
import { diffPlan, type Current } from './diff'
import type { ImportPlan, PlanWorkout } from './mapper'
import { planWrites } from './writes'

const empty: Current = { divisions: [], workouts: [], athletes: [], heatAssignments: [] }

const planWorkout = (over: Partial<PlanWorkout> = {}): PlanWorkout => ({
  externalId: '10', externalPartBId: null, number: 1, name: 'WOD 1', description: 'Row',
  scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', partBEnabled: false, partBScoreType: 'time',
  lanes: 8, startTime: '2026-04-25T15:00:00.000Z', heatIntervalSecs: 600, timeBetweenHeatsSecs: 120,
  heatStartOverrides: {}, location: 'Floor', warnings: [], ...over,
})

const fullPlan: ImportPlan = {
  divisions: [{ externalId: '1', name: 'Rx', order: 1 }],
  workouts: [planWorkout()],
  athletes: [{ externalId: '100', name: 'Ann', divisionExternalId: '1' }],
  heats: [{ workoutExternalId: '10', heatNumber: 1, startTime: null, lanes: [{ lane: 3, athleteExternalId: '100' }] }],
}

const run = (plan: ImportPlan, current: Current, accepted: string[] | 'all', scoreTypes = {}) => {
  const changes = diffPlan(plan, current)
  const keys = accepted === 'all' ? changes.map((c) => c.key) : accepted
  return planWrites(plan, current, changes, { accepted: keys, scoreTypes })
}

describe('planWrites — selection', () => {
  it('rejects a key the diff does not hold', () => {
    const result = run(fullPlan, empty, ['division:999'])

    expect(result).toEqual({ ok: false, errors: ['"division:999" is no longer a change. Preview again.'] })
  })

  it('rejects a change without the changes it depends on', () => {
    const result = run(fullPlan, empty, ['athlete:100'])

    expect(result).toEqual({ ok: false, errors: ['Ann needs Rx too.'] })
  })

  it('needs a score type picked for a new workout the source could not type', () => {
    const plan = { ...fullPlan, workouts: [planWorkout({ scoreType: null })], heats: [] }

    expect(run(plan, empty, ['workout:10'])).toEqual({ ok: false, errors: ['Pick a score type for WOD 1.'] })
    expect(run(plan, empty, ['workout:10'], { 'workout:10': 'weight' })).toMatchObject({ ok: true })
  })
})

describe('planWrites — adds', () => {
  it('builds every insert for an empty competition', () => {
    const result = run(fullPlan, empty, 'all')
    if (!result.ok) throw new Error(result.errors.join())
    const { writes } = result

    expect(writes.divisions.insert).toEqual([{ name: 'Rx', order: 1, externalId: '1' }])
    expect(writes.locations).toEqual(['Floor'])
    expect(writes.workouts.insert).toEqual([{
      number: 1, name: 'WOD 1', description: 'Row', scoreType: 'time',
      tiebreakEnabled: false, tiebreakScoreType: 'time', partBEnabled: false, partBScoreType: 'time',
      lanes: 8, startTime: '2026-04-25T15:00:00.000Z', heatIntervalSecs: 600, timeBetweenHeatsSecs: 120,
      heatStartOverrides: {}, callTimeSecs: 600, walkoutTimeSecs: 120,
      externalId: '10', externalPartBId: null, location: 'Floor',
    }])
    expect(writes.athletes.insert).toEqual([{ name: 'Ann', externalId: '100', divisionExternalId: '1' }])
    expect(writes.heats).toEqual([{
      workoutExternalId: '10', assignments: [{ athleteExternalId: '100', heatNumber: 1, lane: 3 }], heatStartOverrides: {},
    }])
  })

  // Placing lanes clears a workout's start overrides, which belong to the old
  // heat sheet. The source's overrides belong to the sheet being placed.
  it('carries the source start overrides with the lanes they time', () => {
    const plan = { ...fullPlan, workouts: [planWorkout({ heatStartOverrides: { 1: '2026-04-25T15:05:00.000Z' } })] }
    const result = run(plan, empty, 'all')
    if (!result.ok) throw new Error(result.errors.join())
    expect(result.writes.heats[0].heatStartOverrides).toEqual({ 1: '2026-04-25T15:05:00.000Z' })
  })

  it('appends new divisions after the existing ones', () => {
    const current = { ...empty, divisions: [{ id: 1, name: 'Mine', order: 4, externalId: null }] }
    const result = run(fullPlan, current, ['division:1'])

    expect(result).toMatchObject({ ok: true, writes: { divisions: { insert: [{ name: 'Rx', order: 5, externalId: '1' }] } } })
  })

  it('uses the number the diff chose and the score type the admin picked', () => {
    const current = { ...empty, workouts: [{ ...planWorkout(), id: 9, name: 'Hand made', externalId: null, scoreType: 'time' }] }
    const plan = { ...fullPlan, workouts: [planWorkout({ scoreType: null })] }
    const result = run(plan, current, ['workout:10'], { 'workout:10': 'rounds_reps' })

    expect(result).toMatchObject({ ok: true, writes: { workouts: { insert: [{ number: 2, scoreType: 'rounds_reps' }] } } })
  })
})

describe('planWrites — updates, links and removals', () => {
  it('writes only the changed fields, plus the external id', () => {
    const current: Current = {
      ...empty,
      workouts: [{ ...planWorkout({ lanes: 6, location: null }), id: 7, externalId: '10', scoreType: 'time' }],
    }
    const result = run({ ...fullPlan, divisions: [], athletes: [], heats: [] }, current, 'all')

    expect(result).toMatchObject({ ok: true, writes: { workouts: { update: [{
      id: 7, set: { lanes: 8, externalId: '10', externalPartBId: null }, location: 'Floor',
    }] } } })
  })

  it('links a hand-made athlete and moves them to the source division', () => {
    const current: Current = {
      ...empty,
      divisions: [{ id: 3, name: 'Rx', order: 1, externalId: '1' }],
      athletes: [{ id: 5, name: 'ann', divisionId: null, externalId: null }],
    }
    const result = run({ ...fullPlan, workouts: [], heats: [] }, current, 'all')

    expect(result).toMatchObject({ ok: true, writes: { athletes: { update: [{
      id: 5, set: { name: 'Ann', externalId: '100' }, divisionExternalId: '1',
    }] } } })
  })

  it('removes only what was accepted', () => {
    const current: Current = {
      ...empty,
      divisions: [{ id: 3, name: 'Gone', order: 1, externalId: '9' }],
      athletes: [{ id: 5, name: 'Old', divisionId: null, externalId: '500' }],
    }
    const result = run({ divisions: [], workouts: [], athletes: [], heats: [] }, current, ['athlete:500'])

    expect(result).toMatchObject({ ok: true, writes: { divisions: { remove: [] }, athletes: { remove: [5] } } })
  })
})
