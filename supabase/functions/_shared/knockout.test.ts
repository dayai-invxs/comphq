import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  advancers, buildRound, currentRound, heatResult, middleOutLanes, placings, roundSizes, snakeHeats,
  type KnockoutLane, type KnockoutWorkout,
} from './knockout'

const wk: KnockoutWorkout = {
  scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time', lanes: 4, knockoutRounds: 2, knockoutAdvance: 2,
}

let nextId = 1
const lane = (over: Partial<KnockoutLane> & Pick<KnockoutLane, 'athleteId'>): KnockoutLane => ({
  id: nextId++, divisionId: 1, heatNumber: 1, lane: 1, round: 1, rawScore: null, capped: false, tiebreakRawScore: null, advanced: null, ...over,
})

describe('the shared copy', () => {
  it('is identical in the web app', () => {
    const here = readFileSync(join(__dirname, 'knockout.ts'), 'utf8')
    const web = readFileSync(join(__dirname, '../../../apps/web/src/lib/knockout.ts'), 'utf8')
    expect(web).toBe(here)
  })
})

describe('heatResult', () => {
  it('sends the top N by score', () => {
    const lanes = [lane({ athleteId: 1, rawScore: 90 }), lane({ athleteId: 2, rawScore: 60 }), lane({ athleteId: 3, rawScore: 75 })]
    const r = heatResult(lanes, wk)
    expect([...r.advancing].sort()).toEqual([lanes[1].id, lanes[2].id].sort())
    expect(r).toMatchObject({ suggested: true, problem: null })
  })

  it('puts a capped lane behind every finisher', () => {
    const lanes = [lane({ athleteId: 1, rawScore: 40012, capped: true }), lane({ athleteId: 2, rawScore: 99_000 }), lane({ athleteId: 3, rawScore: 98_000 })]
    expect(heatResult(lanes, wk).advancing.has(lanes[0].id)).toBe(false)
  })

  it('lets ticks made by hand decide, scores or not', () => {
    const lanes = [lane({ athleteId: 1, advanced: true }), lane({ athleteId: 2, advanced: false, rawScore: 1 }), lane({ athleteId: 3 })]
    expect(heatResult(lanes, wk)).toMatchObject({ advancing: new Set([lanes[0].id]), suggested: false, problem: null })
  })

  it('asks for a decision when nothing is scored or ticked', () => {
    expect(heatResult([lane({ athleteId: 1, heatNumber: 3 })], wk).problem).toBe('Heat 3 has no scores and no one is ticked to advance.')
  })

  it('asks for a decision on a tie for the last spot', () => {
    const lanes = [lane({ athleteId: 1, rawScore: 50 }), lane({ athleteId: 2, rawScore: 60 }), lane({ athleteId: 3, rawScore: 60 })]
    expect(heatResult(lanes, wk).problem).toMatch(/tie for the last advancing spot/)
  })

  it('uses the tiebreak when the workout has one', () => {
    const tb = { ...wk, tiebreakEnabled: true }
    const lanes = [lane({ athleteId: 1, rawScore: 50 }), lane({ athleteId: 2, rawScore: 60, tiebreakRawScore: 5 }), lane({ athleteId: 3, rawScore: 60, tiebreakRawScore: 4 })]
    const r = heatResult(lanes, tb)
    expect(r.problem).toBeNull()
    expect(r.advancing.has(lanes[2].id)).toBe(true)
  })

  it('ranks higher reps first on a reps workout', () => {
    const reps = { ...wk, scoreType: 'rounds_reps', knockoutAdvance: 1 }
    const lanes = [lane({ athleteId: 1, rawScore: 30010 }), lane({ athleteId: 2, rawScore: 40000 })]
    expect(heatResult(lanes, reps).advancing).toEqual(new Set([lanes[1].id]))
  })
})

describe('seeding', () => {
  it('deals seeds across heats in a snake', () => {
    expect(snakeHeats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([[1, 6, 7], [2, 5, 8], [3, 4, 9, 10]])
  })

  it('fills from the middle lane out', () => {
    expect(middleOutLanes(5)).toEqual([3, 2, 4, 1, 5])
  })

  it('numbers heats on from the first, the top seed\'s heat last, divisions in turn', () => {
    const placed = buildRound([{ seeded: [11, 12, 13, 14, 15] }, { seeded: [21, 22] }], 4, 2, 7)
    expect(placed.filter((p) => p.athleteId === 11)[0]).toMatchObject({ heatNumber: 8, round: 2, lane: 2 })
    expect(placed.filter((p) => p.athleteId === 12)[0]).toMatchObject({ heatNumber: 7 })
    expect(placed.filter((p) => p.athleteId === 21)[0]).toMatchObject({ heatNumber: 9, lane: 2 })
  })
})

describe('advancers', () => {
  it('seeds heat winners first, then by score, per division', () => {
    const lanes = [
      lane({ athleteId: 1, heatNumber: 1, rawScore: 70 }), lane({ athleteId: 2, heatNumber: 1, rawScore: 80 }), lane({ athleteId: 3, heatNumber: 1, rawScore: 90 }),
      lane({ athleteId: 4, heatNumber: 2, rawScore: 60 }), lane({ athleteId: 5, heatNumber: 2, rawScore: 85 }), lane({ athleteId: 6, heatNumber: 2, rawScore: 95 }),
      lane({ athleteId: 7, heatNumber: 3, divisionId: 2, rawScore: 10 }),
    ]
    const { byDivision, problems } = advancers(lanes, wk)
    expect(problems).toEqual([])
    expect(byDivision.get(1)).toEqual([4, 1, 2, 5])
    expect(byDivision.get(2)).toEqual([7])
  })

  it('reports every heat that cannot be settled', () => {
    const lanes = [lane({ athleteId: 1, heatNumber: 1 }), lane({ athleteId: 2, heatNumber: 2 })]
    expect(advancers(lanes, wk).problems).toHaveLength(2)
  })
})

describe('placings', () => {
  it('ranks by round reached, then by score in the round they went out in', () => {
    const lanes = [
      lane({ athleteId: 1, round: 1, rawScore: 70 }), lane({ athleteId: 1, round: 2, rawScore: 65 }),
      lane({ athleteId: 2, round: 1, rawScore: 72 }), lane({ athleteId: 2, round: 2, rawScore: 61 }),
      lane({ athleteId: 3, round: 1, rawScore: 90 }),
      lane({ athleteId: 4, round: 1, rawScore: 80 }),
      lane({ athleteId: 5, round: 1 }),
    ]
    const p = placings(lanes, wk)
    expect(p.map((x) => [x.athleteId, x.points])).toEqual([[2, 1], [1, 2], [4, 3], [3, 4], [5, 5]])
    expect(p[0].label).toBe('Final · 0:00.06')
    expect(p.find((x) => x.athleteId === 4)!.label).toBe('Out in Round 1 · 0:00.08')
    expect(p.find((x) => x.athleteId === 5)!.label).toBe('Out in Round 1')
  })

  it('shares a placing on a tie, and keeps divisions apart', () => {
    const lanes = [
      lane({ athleteId: 1, round: 2, rawScore: 60 }), lane({ athleteId: 2, round: 2, rawScore: 60 }), lane({ athleteId: 3, round: 2, rawScore: 61 }),
      lane({ athleteId: 9, round: 2, divisionId: 2, rawScore: 99 }),
    ]
    expect(placings(lanes, wk).map((x) => [x.athleteId, x.points])).toEqual([[1, 1], [2, 1], [3, 3], [9, 1]])
  })

  it('puts a final winner ticked by hand first', () => {
    const lanes = [lane({ athleteId: 1, round: 2 }), lane({ athleteId: 2, round: 2, advanced: true })]
    expect(placings(lanes, wk).map((x) => [x.athleteId, x.points])).toEqual([[2, 1], [1, 2]])
  })

  it('treats heats with no round as round 1', () => {
    expect(currentRound([lane({ athleteId: 1, round: null })])).toBe(1)
  })
})

describe('roundSizes', () => {
  it('previews each round', () => {
    expect(roundSizes(40, 8, 2, 3)).toEqual([40, 10, 4])
    expect(roundSizes(19, 8, 3, 2)).toEqual([19, 9])
    expect(roundSizes(3, 8, 2, 3)).toEqual([3, 2, 2])
  })
})
