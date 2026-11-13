import { describe, expect, it } from 'vitest'
import { parseScoreCard, type ScoreCardSpec } from '@/lib/scoreCard'
import { blankCards, laneCards, sheets } from './cards'
import { testWorkout } from './testWorkout'
import bowser from './__fixtures__/rugged-3-bowsers-castle-countdown.json'
import knockout from './__fixtures__/rugged-4-blue-shell-knockout.json'

const spec = (raw: unknown) => {
  const r = parseScoreCard(raw)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.spec as ScoreCardSpec
}
const opts = { slug: 'rugged-in-house-2026', origin: 'https://www.comphq.pro', showBib: true }
const team = [{ id: 11, name: 'Ana', gender: 'female' }, { id: 12, name: 'Ben', gender: 'male' }, { id: 13, name: 'Cy', gender: 'male' }]

describe('laneCards', () => {
  it('makes one card per lane in heat and lane order, with the heat in the QR', () => {
    const w = testWorkout([
      { heat: 2, lane: 1, athleteId: 2, name: 'Second' },
      { heat: 1, lane: 3, athleteId: 1, name: 'First', gender: 'female', bib: '12', division: 'Rx' },
    ])
    const cards = laneCards(w, null, opts)
    expect(cards.map((c) => c.entrant.name)).toEqual(['First', 'Second'])
    expect(cards[0]).toMatchObject({ heat: 1, lane: 3, blank: false, qr: 'https://www.comphq.pro/rugged-in-house-2026/admin/workouts/9#heat-1' })
    expect(cards[0].entrant).toMatchObject({ gender: 'f', bib: '12', division: 'Rx', roster: null })
  })

  it('leaves the bib off when the competition doesn’t show bibs', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 1, name: 'A', bib: '7' }])
    expect(laneCards(w, null, { ...opts, showBib: false })[0].entrant.bib).toBeNull()
  })

  it('gives a team card its roster', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team }])
    const [card] = laneCards(w, null, opts)
    expect(card.entrant.roster).toEqual([{ name: 'Ana', gender: 'f' }, { name: 'Ben', gender: 'm' }, { name: 'Cy', gender: 'm' }])
  })

  it('gives a split team’s lane the member running it, under the team', () => {
    const w = testWorkout([
      { heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, memberId: 11 },
      { heat: 2, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, memberId: 12 },
    ])
    const cards = laneCards(w, spec(bowser), opts)
    expect(cards.map((c) => [c.entrant.name, c.entrant.team, c.entrant.gender, c.entrant.roster])).toEqual([
      ['Ana', 'Koopa Troop', 'f', null],
      ['Ben', 'Koopa Troop', 'm', null],
    ])
  })

  it('prints only the heats asked for', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 1, name: 'A' }, { heat: 2, lane: 1, athleteId: 2, name: 'B' }])
    expect(laneCards(w, null, { ...opts, heats: [2] }).map((c) => c.entrant.name)).toEqual(['B'])
  })

  it('draws a knockout lane from its round, and doesn’t mistake rounds for a split team', () => {
    const w = testWorkout([
      { heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, round: 1 },
      { heat: 4, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, round: 2 },
    ], { knockout: true })
    const cards = laneCards(w, spec(knockout), opts)
    expect(cards.map((c) => c.version)).toEqual([0, 2])
    expect(cards.every((c) => c.entrant.roster?.length === 3)).toBe(true)
  })

  it('gives a consolation lane its round’s card, marked as consolation', () => {
    const w = testWorkout([
      { heat: 3, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, round: 2 },
      { heat: 3, lane: 2, athleteId: 6, name: 'Shy Guys', members: team, round: 2, consolation: true },
    ], { knockout: true, knockoutConsolation: true })
    const cards = laneCards(w, spec(knockout), opts)
    expect(cards.map((c) => [c.version, c.consolation])).toEqual([[2, false], [2, true]])
  })

  it('prints every lane from the version asked for (a round’s single-under card)', () => {
    const w = testWorkout([
      { heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, round: 1 },
      { heat: 1, lane: 2, athleteId: 6, name: 'Shy Guys', members: team, round: 1 },
    ], { knockout: true })
    expect(laneCards(w, spec(knockout), { ...opts, version: 1 }).map((c) => c.version)).toEqual([1, 1])
  })

  it('gives each lane its heat’s start time', () => {
    const w = testWorkout([{ heat: 2, lane: 1, athleteId: 1, name: 'A' }], { startTime: '2026-11-14T15:00:00.000Z', heatIntervalSecs: 600 })
    expect(laneCards(w, null, opts)[0].start).toBe(new Date('2026-11-14T15:10:00.000Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  })
})

describe('blankCards', () => {
  it('leaves who, heat and lane to write in, and sends the QR to the workout', () => {
    const cards = blankCards({ id: 9 }, spec(knockout), { ...opts, count: 3, version: 1 })
    expect(cards).toHaveLength(3)
    expect(cards[0]).toMatchObject({ heat: null, lane: null, start: null, blank: true, version: 1, qr: 'https://www.comphq.pro/rugged-in-house-2026/admin/workouts/9' })
    expect(cards[0].entrant.roster).toHaveLength(3)
  })

  it('gives a one-athlete card of a team a team line instead of a roster', () => {
    const [card] = blankCards({ id: 9 }, spec(bowser), { ...opts, count: 1, version: 0 })
    expect(card.entrant).toMatchObject({ team: '', roster: null })
  })
})

it('puts two cards on a sheet', () => {
  expect(sheets([1, 2, 3])).toEqual([[1, 2], [3]])
})

it('puts one card on a sheet when asked', () => {
  expect(sheets([1, 2, 3], 1)).toEqual([[1], [2], [3]])
})
