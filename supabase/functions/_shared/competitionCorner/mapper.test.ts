import { describe, expect, it } from 'vitest'
import type { CcEvent, CcHeat, CcWorkout } from './event'
import { htmlToText, mapEvent, mapScoreType } from './mapper'
import { loadEvent19948 } from './__fixtures__/event19948'

const LA = 'America/Los_Angeles'

describe('mapScoreType', () => {
  it.each([
    ['amrap', 'rounds_reps'],
    ['time', 'time'],
    ['repmax', 'weight'],
  ])('maps %s to %s', (cc, ours) => {
    expect(mapScoreType(cc)).toBe(ours)
  })

  it.each(['repetitions_less_better', 'time_slowest_better', 'repmax_less_better', '', 'other'])(
    'leaves %s for the admin to pick', (cc) => {
      expect(mapScoreType(cc)).toBeNull()
    },
  )
})

describe('htmlToText', () => {
  it('turns paragraphs and breaks into lines and drops tags', () => {
    const html = '<!DOCTYPE html><html><head><title>x</title></head><body>'
      + '<p>13 Minute AMREP:</p><p><em><strong>RX:</strong></em></p><p>20/16 Cal Row<br />20&#39; HSW</p></body></html>'

    expect(htmlToText(html)).toBe("13 Minute AMREP:\nRX:\n20/16 Cal Row\n20' HSW")
  })

  it('decodes entities and collapses blank runs', () => {
    expect(htmlToText('<p>a &amp; b&nbsp;c</p><p>&nbsp;</p><p>&nbsp;</p><p>&lt;d&gt; &quot;e&quot;</p>'))
      .toBe('a & b c\n\n<d> "e"')
  })

  it('returns null for empty input', () => {
    expect(htmlToText(null)).toBeNull()
    expect(htmlToText('<p>&nbsp;</p>')).toBeNull()
  })
})

describe('mapEvent on event 19948', () => {
  const plan = async (mergePartB = true) => mapEvent(await loadEvent19948(), { tz: LA, mergePartB })

  it('maps divisions in source order', async () => {
    const { divisions } = await plan()

    expect(divisions.map((d) => d.name)).toEqual([
      'Rx - Individual Women', 'Scaled - Individual Women', 'Rx - Individual Men',
      'Scaled - Individual Men', 'Intermediate - Individual Women', 'Intermediate - Individual Men',
    ])
    expect(divisions[0]).toEqual({ externalId: '131045', name: 'Rx - Individual Women', order: 1 })
  })

  it('takes every athlete who holds a lane, once, with their division', async () => {
    const { athletes } = await plan()

    expect(athletes).toHaveLength(74)
    expect(athletes.find((a) => a.externalId === '1430644')).toEqual({
      externalId: '1430644', name: 'Maddie Clark', divisionExternalId: '131085',
    })
  })

  it('merges Part A and Part B into one workout, numbered in schedule order', async () => {
    const { workouts } = await plan()

    expect(workouts.map((w) => [w.number, w.name, w.externalId, w.externalPartBId])).toEqual([
      [1, 'Maximus - WOD 1', '121778', null],
      [2, 'Unleash Hell - WOD 2', '121777', null],
      [3, 'Are You Not Entertained!? - WOD 3', '119545', '119547'],
      [4, 'The Coliseum - WOD 4', '121768', null],
    ])
    const wod3 = workouts[2]
    expect(wod3).toMatchObject({ scoreType: 'time', partBEnabled: true, partBScoreType: 'weight', tiebreakEnabled: false })
  })

  it('keeps Part A and Part B apart when asked', async () => {
    const { workouts, heats } = await plan(false)

    expect(workouts.map((w) => w.name)).toEqual([
      'Maximus - WOD 1', 'Unleash Hell - WOD 2',
      'Are You Not Entertained!? - WOD 3 (Part A)', 'Are You Not Entertained!? (Part B)', 'The Coliseum - WOD 4',
    ])
    expect(workouts.every((w) => !w.partBEnabled && w.externalPartBId === null)).toBe(true)
    expect(heats.filter((h) => h.workoutExternalId === '119547')).toHaveLength(7)
  })

  it('maps score and tiebreak types', async () => {
    const { workouts } = await plan()
    const wod1 = workouts[0]

    expect(wod1).toMatchObject({ scoreType: 'rounds_reps', tiebreakEnabled: true, tiebreakScoreType: 'time' })
    expect(workouts[1]).toMatchObject({ scoreType: 'time', tiebreakEnabled: false })
  })

  it('sizes lanes to the widest heat', async () => {
    const { workouts } = await plan()

    expect(workouts.map((w) => w.lanes)).toEqual([9, 8, 12, 10])
  })

  it('converts the description to text and keeps the location name', async () => {
    const { workouts } = await plan()

    expect(workouts[0].description).toMatch(/^13 Minute AMREP:\nRX:\n/)
    expect(workouts[0].location).toBe('Gym Floor')
    expect(workouts[1].location).toBe('Parking Lot')
  })

  it('derives start, interval and gap from the heat times in the chosen zone', async () => {
    const { workouts } = await plan()
    const [wod1, wod2, , wod4] = workouts

    // No cap: the whole 17-minute slot is the interval.
    expect(wod1).toMatchObject({ startTime: '2026-04-25T15:15:00.000Z', heatIntervalSecs: 1020, timeBetweenHeatsSecs: 0 })
    // 8-minute cap on a 12-minute rhythm.
    expect(wod2).toMatchObject({ startTime: '2026-04-25T17:15:00.000Z', heatIntervalSecs: 480, timeBetweenHeatsSecs: 240 })
    expect(wod4).toMatchObject({ heatIntervalSecs: 840, timeBetweenHeatsSecs: 240 })
  })

  it('pins heats that break the rhythm with start overrides', async () => {
    const { workouts } = await plan()

    // WOD 2 runs every 12 minutes until heat 10 (12:02) and heat 11 (12:15).
    expect(workouts[1].heatStartOverrides).toEqual({
      10: '2026-04-25T19:02:00.000Z',
      11: '2026-04-25T19:15:00.000Z',
    })
    expect(workouts[0].heatStartOverrides).toEqual({})
  })

  it('lists heats with their lanes and start times', async () => {
    const { heats } = await plan()
    const first = heats.find((h) => h.workoutExternalId === '121778' && h.heatNumber === 1)!

    expect(first.startTime).toBe('2026-04-25T15:15:00.000Z')
    expect(first.lanes[0]).toEqual({ lane: 1, athleteExternalId: '1430644' })
    expect(heats.filter((h) => h.workoutExternalId === '119545')).toHaveLength(7)
    expect(heats.some((h) => h.workoutExternalId === '119547')).toBe(false)
  })
})

describe('mapEvent edge cases', () => {
  const workout = (over: Partial<CcWorkout>): CcWorkout => ({
    id: 1, name: 'W', format: 'individual', type: 'time', tiebreakerType: '', location: null,
    date: '2026-04-25T00:00:00', description: null, timeCap: null, ...over,
  })
  const heat = (over: Partial<CcHeat>): CcHeat => ({
    id: 1, title: 'Heat 1', time: '09:00', size: 2, workoutId: 1, stations: [], ...over,
  })
  const event = (over: Partial<CcEvent>): CcEvent => ({ id: 1, name: 'E', divisions: [], workouts: [], heats: [], ...over })

  it('flags a score type the admin must pick', () => {
    const { workouts } = mapEvent(event({ workouts: [workout({ type: 'time_slowest_better' })] }), { tz: 'UTC', mergePartB: true })

    expect(workouts[0].scoreType).toBeNull()
    expect(workouts[0].warnings).toContain('Score type "time_slowest_better" has no match here. Pick one.')
  })

  it('warns when a tiebreak type has no match and turns the tiebreak off', () => {
    const { workouts } = mapEvent(event({ workouts: [workout({ tiebreakerType: 'repmax_less_better' })] }), { tz: 'UTC', mergePartB: true })

    expect(workouts[0].tiebreakEnabled).toBe(false)
    expect(workouts[0].warnings).toContain('Tiebreak type "repmax_less_better" has no match here. Tiebreak left off.')
  })

  it('gives a workout with no heats no start time and a default interval', () => {
    const { workouts } = mapEvent(event({ workouts: [workout({ timeCap: '00:12:00' })] }), { tz: 'UTC', mergePartB: true })

    expect(workouts[0]).toMatchObject({ startTime: null, heatIntervalSecs: 720, timeBetweenHeatsSecs: 0, lanes: 1 })
  })

  it('warns when lanes exceed what a workout can hold', () => {
    const stations = [{ station: 25, participantId: 9, participantName: 'A', divisionId: 1, affiliate: null }]
    const { workouts } = mapEvent(event({ workouts: [workout({})], heats: [heat({ size: 25, stations })] }), { tz: 'UTC', mergePartB: true })

    expect(workouts[0].lanes).toBe(20)
    expect(workouts[0].warnings).toContain('Source has 25 lanes; the limit here is 20.')
  })

  it('warns about a Part B with no Part A to join', () => {
    const { workouts } = mapEvent(event({ workouts: [workout({ id: 2, name: 'Lonely (Part B)' })] }), { tz: 'UTC', mergePartB: true })

    expect(workouts).toHaveLength(1)
    expect(workouts[0].warnings).toContain('Part B with no matching Part A; imported on its own.')
  })

  it('numbers heats by order when a title has no number', () => {
    const { heats } = mapEvent(event({
      workouts: [workout({})],
      heats: [heat({ id: 1, title: 'Final', time: '10:00' }), heat({ id: 2, title: 'Opener', time: '09:00' })],
    }), { tz: 'UTC', mergePartB: true })

    expect(heats.map((h) => [h.heatNumber, h.startTime])).toEqual([
      [1, '2026-04-25T09:00:00.000Z'],
      [2, '2026-04-25T10:00:00.000Z'],
    ])
  })
})
