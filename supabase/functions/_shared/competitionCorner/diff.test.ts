import { describe, expect, it } from 'vitest'
import { diffPlan, type Current } from './diff'
import { mapEvent, type ImportPlan, type PlanWorkout } from './mapper'
import { loadEvent19948 } from './__fixtures__/fixtureFetch'

const empty: Current = { divisions: [], workouts: [], athletes: [], heatAssignments: [] }

const planWorkout = (over: Partial<PlanWorkout> = {}): PlanWorkout => ({
  externalId: '10', externalPartBId: null, number: 1, name: 'WOD 1', description: null,
  scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', partBEnabled: false, partBScoreType: 'time',
  lanes: 8, startTime: '2026-04-25T15:00:00.000Z', heatIntervalSecs: 600, timeBetweenHeatsSecs: 120,
  heatStartOverrides: {}, location: null, warnings: [], ...over,
})

const currentWorkout = (over: Partial<Current['workouts'][number]> = {}): Current['workouts'][number] => ({
  id: 7, number: 1, name: 'WOD 1', description: null,
  scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', partBEnabled: false, partBScoreType: 'time',
  lanes: 8, startTime: '2026-04-25 15:00:00+00', heatIntervalSecs: 600, timeBetweenHeatsSecs: 120,
  heatStartOverrides: {}, location: null, externalId: '10', externalPartBId: null, ...over,
})

const plan = (over: Partial<ImportPlan> = {}): ImportPlan => ({ divisions: [], workouts: [], athletes: [], heats: [], ...over })

describe('diffPlan — divisions', () => {
  it('adds a division the competition lacks', () => {
    const changes = diffPlan(plan({ divisions: [{ externalId: '1', name: 'Rx', order: 1 }] }), empty)

    expect(changes).toEqual([expect.objectContaining({
      key: 'division:1', entity: 'division', kind: 'add', id: null, label: 'Rx',
    })])
  })

  it('links a hand-made division with the same name instead of adding one', () => {
    const current = { ...empty, divisions: [{ id: 3, name: ' rx ', order: 1, externalId: null }] }
    const [c] = diffPlan(plan({ divisions: [{ externalId: '1', name: 'Rx', order: 1 }] }), current)

    expect(c).toMatchObject({ kind: 'link', id: 3, fields: [{ field: 'name', before: ' rx ', after: 'Rx' }] })
  })

  it('updates a renamed division matched by id', () => {
    const current = { ...empty, divisions: [{ id: 3, name: 'RX', order: 1, externalId: '1' }] }
    const [c] = diffPlan(plan({ divisions: [{ externalId: '1', name: 'Rx Women', order: 1 }] }), current)

    expect(c).toMatchObject({ kind: 'update', id: 3, fields: [{ field: 'name', before: 'RX', after: 'Rx Women' }] })
  })

  it('reports nothing when a matched division is unchanged', () => {
    const current = { ...empty, divisions: [{ id: 3, name: 'Rx', order: 9, externalId: '1' }] }

    expect(diffPlan(plan({ divisions: [{ externalId: '1', name: 'Rx', order: 1 }] }), current)).toEqual([])
  })

  it('offers to remove an imported division the source dropped, but never a hand-made one', () => {
    const current = { ...empty, divisions: [
      { id: 3, name: 'Gone', order: 1, externalId: '9' },
      { id: 4, name: 'Mine', order: 2, externalId: null },
    ] }

    expect(diffPlan(plan(), current)).toEqual([
      expect.objectContaining({ key: 'division:9', kind: 'remove', id: 3, label: 'Gone' }),
    ])
  })
})

describe('diffPlan — athletes', () => {
  const divisions = [{ id: 3, name: 'Rx', order: 1, externalId: '1' }, { id: 4, name: 'Sc', order: 2, externalId: '2' }]

  it('updates an athlete who moved division', () => {
    const current = { ...empty, divisions, athletes: [{ id: 5, name: 'Ann', divisionId: 3, externalId: '100' }] }
    const changes = diffPlan(plan({
      divisions: [{ externalId: '1', name: 'Rx', order: 1 }, { externalId: '2', name: 'Sc', order: 2 }],
      athletes: [{ externalId: '100', name: 'Ann', divisionExternalId: '2' }],
    }), current)

    expect(changes).toEqual([expect.objectContaining({
      key: 'athlete:100', kind: 'update', fields: [{ field: 'division', before: 'Rx', after: 'Sc' }],
    })])
  })

  it('links a hand-entered athlete by name only when the name is unambiguous', () => {
    const current = { ...empty, athletes: [
      { id: 5, name: 'Ann', divisionId: null, externalId: null },
      { id: 6, name: 'Bo', divisionId: null, externalId: null },
      { id: 7, name: 'Bo', divisionId: null, externalId: null },
    ] }
    const changes = diffPlan(plan({ athletes: [
      { externalId: '100', name: 'Ann', divisionExternalId: null },
      { externalId: '101', name: 'Bo', divisionExternalId: null },
    ] }), current)

    expect(changes.map((c) => [c.key, c.kind, c.id])).toEqual([
      ['athlete:100', 'link', 5],
      ['athlete:101', 'add', null],
    ])
    expect(changes[1].warnings).toContain('2 athletes here are named "Bo"; adding a new one rather than guessing.')
  })
})

describe('diffPlan — workouts', () => {
  it('adds a new workout on the next free number when its number is taken', () => {
    const current = { ...empty, workouts: [currentWorkout({ externalId: null, name: 'Hand made', number: 1 })] }
    const [c] = diffPlan(plan({ workouts: [planWorkout()] }), current)

    expect(c).toMatchObject({ kind: 'add', number: 2 })
    expect(c.warnings).toContain('Number 1 is taken; this becomes workout 2.')
  })

  it('treats the same instant in another format as unchanged', () => {
    const changes = diffPlan(plan({ workouts: [planWorkout()] }), { ...empty, workouts: [currentWorkout()] })

    expect(changes).toEqual([])
  })

  it('lists each changed field', () => {
    const current = { ...empty, workouts: [currentWorkout({ lanes: 6, heatStartOverrides: { 3: '2026-04-25T16:00:00Z' } })] }
    const [c] = diffPlan(plan({ workouts: [planWorkout({ location: 'Floor' })] }), current)

    expect(c.fields).toEqual([
      { field: 'lanes', before: 6, after: 8 },
      { field: 'heatStartOverrides', before: { 3: '2026-04-25T16:00:00Z' }, after: {} },
      { field: 'location', before: null, after: 'Floor' },
    ])
  })

  it('leaves the score type alone when the source has none to offer', () => {
    const changes = diffPlan(plan({ workouts: [planWorkout({ scoreType: null })] }), { ...empty, workouts: [currentWorkout()] })

    expect(changes).toEqual([])
  })

  it('carries the plan warnings', () => {
    const [c] = diffPlan(plan({ workouts: [planWorkout({ scoreType: null, warnings: ['pick one'] })] }), empty)

    expect(c.warnings).toEqual(['pick one'])
  })
})

describe('diffPlan — heats', () => {
  const athletes = [
    { id: 5, name: 'Ann', divisionId: null, externalId: '100' },
    { id: 6, name: 'Bo', divisionId: null, externalId: '101' },
    { id: 8, name: 'Walk-in', divisionId: null, externalId: null },
  ]
  const heats = [{ workoutExternalId: '10', heatNumber: 1, startTime: null, lanes: [
    { lane: 1, athleteExternalId: '100' }, { lane: 2, athleteExternalId: '101' },
  ] }]
  const planAthletes = [
    { externalId: '100', name: 'Ann', divisionExternalId: null },
    { externalId: '101', name: 'Bo', divisionExternalId: null },
  ]

  it('adds lanes for a workout with none', () => {
    const changes = diffPlan(plan({ workouts: [planWorkout()], athletes: planAthletes, heats }), { ...empty, athletes, workouts: [currentWorkout()] })

    expect(changes).toEqual([expect.objectContaining({ key: 'heats:10', entity: 'heats', kind: 'add', label: 'WOD 1 — 1 heat, 2 lanes' })])
  })

  it('reports nothing when the lanes match', () => {
    const current = { ...empty, athletes, workouts: [currentWorkout()], heatAssignments: [
      { workoutId: 7, athleteId: 5, heatNumber: 1, lane: 1 },
      { workoutId: 7, athleteId: 6, heatNumber: 1, lane: 2 },
    ] }

    expect(diffPlan(plan({ workouts: [planWorkout()], athletes: planAthletes, heats }), current)).toEqual([])
  })

  it('replaces moved lanes and warns about hand-placed athletes it would drop', () => {
    const current = { ...empty, athletes, workouts: [currentWorkout()], heatAssignments: [
      { workoutId: 7, athleteId: 5, heatNumber: 1, lane: 2 },
      { workoutId: 7, athleteId: 8, heatNumber: 2, lane: 1 },
    ] }
    const [c] = diffPlan(plan({ workouts: [planWorkout()], athletes: planAthletes, heats }), current)

    expect(c).toMatchObject({ key: 'heats:10', kind: 'update', id: 7 })
    expect(c.warnings).toContain('Replaces 1 lane placed by hand (Walk-in).')
  })
})

describe('diffPlan — dependencies', () => {
  it('ties new heats to the new workout and athletes they place', () => {
    const changes = diffPlan(plan({
      divisions: [{ externalId: '1', name: 'Rx', order: 1 }],
      workouts: [planWorkout()],
      athletes: [{ externalId: '100', name: 'Ann', divisionExternalId: '1' }],
      heats: [{ workoutExternalId: '10', heatNumber: 1, startTime: null, lanes: [{ lane: 1, athleteExternalId: '100' }] }],
    }), empty)
    const byKey = Object.fromEntries(changes.map((c) => [c.key, c.requires]))

    expect(byKey['athlete:100']).toEqual(['division:1'])
    expect(byKey['heats:10']).toEqual(['workout:10', 'athlete:100'])
  })

  it('needs nothing extra for rows that already exist', () => {
    const current: Current = {
      ...empty,
      athletes: [{ id: 5, name: 'Ann', divisionId: null, externalId: '100' }],
      workouts: [currentWorkout()],
    }
    const [c] = diffPlan(plan({
      workouts: [planWorkout()],
      athletes: [{ externalId: '100', name: 'Ann', divisionExternalId: null }],
      heats: [{ workoutExternalId: '10', heatNumber: 1, startTime: null, lanes: [{ lane: 1, athleteExternalId: '100' }] }],
    }), current)

    expect(c).toMatchObject({ key: 'heats:10', requires: [] })
  })
})

describe('diffPlan on event 19948', () => {
  it('adds everything to an empty competition', async () => {
    const changes = diffPlan(mapEvent(await loadEvent19948(), { tz: 'America/Los_Angeles', mergePartB: true }), empty)
    const count = (entity: string) => changes.filter((c) => c.entity === entity && c.kind === 'add').length

    expect([count('division'), count('workout'), count('athlete'), count('heats')]).toEqual([6, 4, 74, 4])
    expect(changes.every((c) => c.kind === 'add')).toBe(true)
  })
})
