import { describe, expect, it } from 'vitest'
import { athletesIn, matchAthletes, matchedMembers } from './athleteTimeline'
import type { OpsData } from '@/lib/opsHeats'

// The question this file exists to answer is "where is Alice and when does she
// run", so the tests are about that answer: who is in the competition, in what
// order they run, and which of them a typed term means.

const START = Date.parse('2026-08-26T09:00:00.000Z')

const entry = (
  athleteId: number,
  athleteName: string,
  lane: number,
  over: Partial<{ divisionName: string | null; bibNumber: string | null; scoreDisplay: string | null; tiebreakDisplay: string | null }> = {},
): { athleteId: number; members?: string[] } & Record<string, unknown> => ({
  athleteId,
  athleteName,
  lane,
  divisionName: over.divisionName ?? 'Rx',
  bibNumber: over.bibNumber ?? null,
  scoreDisplay: over.scoreDisplay ?? null,
  tiebreakDisplay: over.tiebreakDisplay ?? null,
})

const workout = (
  id: number,
  number: number,
  name: string,
  startTime: string | null,
  heats: { heatNumber: number; isComplete: boolean; entries: ReturnType<typeof entry>[] }[],
) => ({
  id,
  number,
  name,
  status: 'active',
  locationName: 'Floor A',
  startTime,
  heatIntervalSecs: 600,
  timeBetweenHeatsSecs: 0,
  callTimeSecs: 300,
  walkoutTimeSecs: 120,
  heatStartOverrides: {},
  heats,
})

// Ada runs late in the first workout and early in the second, so a list in
// payload order and a list in clock order are not the same list.
const OPS = {
  showBib: true,
  workouts: [
    workout(7, 1, 'Fran', '2026-08-26T09:00:00.000Z', [
      { heatNumber: 1, isComplete: true, entries: [entry(2, 'Bob Brown', 3, { scoreDisplay: '4:10' })] },
      { heatNumber: 2, isComplete: false, entries: [entry(1, 'Ada Ant', 1, { bibNumber: '12' })] },
    ]),
    workout(8, 2, 'Grace', '2026-08-26T08:00:00.000Z', [
      { heatNumber: 1, isComplete: true, entries: [entry(1, 'Ada Ant', 4, { bibNumber: null, scoreDisplay: '120 reps', tiebreakDisplay: '1:20' })] },
    ]),
    workout(9, 3, 'Helen', null, [
      { heatNumber: 1, isComplete: false, entries: [entry(1, 'Ada Ant', 2)] },
    ]),
  ],
} as unknown as OpsData

describe('athletesIn', () => {
  it('has nothing to say about a competition it has not read yet', () => {
    expect(athletesIn(undefined)).toEqual([])
  })

  it('lists every athlete once, by name', () => {
    expect(athletesIn(OPS).map((a) => a.athleteName)).toEqual(['Ada Ant', 'Bob Brown'])
  })

  it('gathers an athlete from every workout they are in', () => {
    const [ada] = athletesIn(OPS)
    expect(ada.stops).toHaveLength(3)
  })

  it('puts the stops in the order they will be run, not the order they arrived', () => {
    const [ada] = athletesIn(OPS)
    expect(ada.stops.map((s) => s.workoutNumber)).toEqual([2, 1, 3])
  })

  it('counts a heat start forward from the workout start', () => {
    const [, bob] = athletesIn(OPS)
    expect(bob.stops[0].startMs).toBe(START)
    const [ada] = athletesIn(OPS)
    expect(ada.stops[1].startMs).toBe(START + 600_000)
  })

  // An unscheduled workout has no clock to sort by, so it is not next.
  // COM-115. Corral and walk out are what an athlete has to be on time for.
  it('carries the corral and walk out times of each stop', () => {
    const [ada] = athletesIn(OPS)
    const start = Date.parse('2026-08-26T08:00:00.000Z')
    expect(ada.stops[0]).toMatchObject({ corralMs: start - 300_000, walkoutMs: start - 120_000 })
    expect(ada.stops.at(-1)).toMatchObject({ corralMs: null, walkoutMs: null })
  })

  it('puts a heat with no start time after the ones that have one', () => {
    const [ada] = athletesIn(OPS)
    expect(ada.stops.at(-1)).toMatchObject({ workoutName: 'Helen', startMs: null })
  })

  it('carries what the timeline shows for each stop', () => {
    const [ada] = athletesIn(OPS)
    expect(ada.stops[0]).toMatchObject({
      workoutNumber: 2,
      workoutName: 'Grace',
      locationName: 'Floor A',
      heatNumber: 1,
      lane: 4,
      isComplete: true,
      scoreDisplay: '120 reps',
      tiebreakDisplay: '1:20',
    })
  })

  // The payload repeats the bib on every entry, and blanks it on some.
  it('takes the bib and division from the first entry that names them', () => {
    const [ada] = athletesIn(OPS)
    expect(ada.bibNumber).toBe('12')
    expect(ada.divisionName).toBe('Rx')
  })
})

describe('matchAthletes', () => {
  const athletes = athletesIn(OPS)

  it('answers nothing at all to an empty term', () => {
    expect(matchAthletes(athletes, '')).toEqual([])
    expect(matchAthletes(athletes, '   ')).toEqual([])
  })

  it('matches part of a name, in any case', () => {
    expect(matchAthletes(athletes, 'AdA').map((a) => a.athleteName)).toEqual(['Ada Ant'])
  })

  it('matches a bib number', () => {
    expect(matchAthletes(athletes, '12').map((a) => a.athleteName)).toEqual(['Ada Ant'])
  })

  it('answers nobody rather than everybody when it does not know the name', () => {
    expect(matchAthletes(athletes, 'zeb')).toEqual([])
  })
})

// A team member looks for their own name, not their team's.
describe('a team found by a member', () => {
  const TEAMS = {
    showBib: false,
    workouts: [
      workout(7, 1, 'Fran', '2026-08-26T09:00:00.000Z', [
        { heatNumber: 1, isComplete: false, entries: [{ ...entry(5, 'Thunder', 1), members: ['Ada Ant', 'Zed Zorn'] }] },
        // A split lane names only the member running it, here one the first
        // heat did not list.
        { heatNumber: 2, isComplete: false, entries: [{ ...entry(5, 'Thunder', 2), members: ['Mo Moss'] }] },
        { heatNumber: 3, isComplete: false, entries: [entry(6, 'Adams Solo', 1)] },
      ]),
    ],
  } as unknown as OpsData
  const athletes = athletesIn(TEAMS)

  it('keeps every member the heats name, once each', () => {
    expect(athletes.find((a) => a.athleteName === 'Thunder')?.members).toEqual(['Ada Ant', 'Zed Zorn', 'Mo Moss'])
    expect(athletes.find((a) => a.athleteName === 'Adams Solo')?.members).toEqual([])
  })

  it('matches a member’s name, including one only a split lane names', () => {
    expect(matchAthletes(athletes, 'zorn').map((a) => a.athleteName)).toEqual(['Thunder'])
    expect(matchAthletes(athletes, 'moss').map((a) => a.athleteName)).toEqual(['Thunder'])
  })

  it('says which member matched, and nothing when the team matched by its own name', () => {
    const [adams, thunder] = matchAthletes(athletes, 'ada')
    expect(matchedMembers(thunder, 'ada')).toEqual(['Ada Ant'])
    expect(matchedMembers(adams, 'ada')).toEqual([])
    expect(matchedMembers(thunder, 'thun')).toEqual([])
  })
})

