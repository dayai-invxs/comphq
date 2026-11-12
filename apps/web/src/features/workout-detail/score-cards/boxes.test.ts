import { describe, expect, it } from 'vitest'
import type { ScoreCardItem } from '@/lib/scoreCard'
import { amountLabel, boxesFor, groupSize, levelSwaps, type Defs } from './boxes'

const both = (n: number) => ({ m: n, f: n })
const def = (key: string, value: number | null, kind: 'distancePerRep' | 'repsPerItem' | 'repsPerLine' = 'distancePerRep'): Defs =>
  ({ [key]: { key, movement: key, kind, value } })

describe('groupSize', () => {
  it('goes one per rep to 10, then 5s, then 10s once 5s pass 10 boxes', () => {
    expect([1, 10, 11, 50, 51, 100].map((n) => groupSize(n))).toEqual([1, 1, 5, 5, 10, 10])
    expect(groupSize(40, 2)).toBe(2)
  })
})

describe('boxesFor', () => {
  it('counts each movement and carries the grey total through', () => {
    const item: ScoreCardItem = { movement: 'Toes-to-Bar', amount: both(40), box: 'reps', unit: 'reps' }
    const r = boxesFor(item, 40, {})
    expect(r.boxes.map((b) => b.big)).toEqual(['5', '10', '15', '20', '25', '30', '35', '40'])
    expect(r.boxes.at(-1)?.total).toBe('80')
    expect(r.total).toBe(80)
  })

  it('ends on the odd box when the set doesn’t divide', () => {
    const r = boxesFor({ movement: 'x', amount: both(18), box: 'reps' }, 0, {})
    expect(r.boxes.map((b) => b.big)).toEqual(['5', '10', '15', '18'])
  })

  it('gives a machine one box and a calorie one rep', () => {
    const r = boxesFor({ movement: 'Cal Row', amount: { m: 20, f: 16 }, box: 'whole', unit: 'cal' }, 0, {}, { g: 'f' })
    expect(r.boxes).toEqual([{ big: '16 cal', total: '16' }])
    expect(r.total).toBe(16)
  })

  it('shows a distance in feet a box, a rep each (Maximus round 3)', () => {
    const hsw: ScoreCardItem = { movement: 'HSW', amount: both(20), step: both(20), unit: 'ft', box: 'reps', repDef: 'hsw' }
    const r = boxesFor(hsw, 20, def('hsw', 20), { round: 3 })
    expect(r.boxes).toEqual([{ big: '20 ft', total: '21' }, { big: '40 ft', total: '22' }, { big: '60 ft', total: '23' }])
  })

  it('boxes a distance counted in full sets by the set (16 ft = 2 reps)', () => {
    const ww: ScoreCardItem = { movement: 'Wall Walk or HSW reps', amount: both(40), unit: 'reps', box: 'reps', repDef: 'hsw', setFt: 16 }
    const r = boxesFor(ww, 0, def('hsw', 8))
    expect(r.boxes).toHaveLength(20)
    expect(r.boxes[0].big).toBe('2')
  })

  it('makes every total after an unanswered rep value a question mark', () => {
    const run: ScoreCardItem = { movement: 'Run', amount: both(300), unit: 'm', box: 'whole', repDef: 'run' }
    const first = boxesFor(run, 0, def('run', null, 'repsPerItem'))
    expect(first.boxes[0].total).toBe('?')
    expect(first.total).toBeNull()
    const next = boxesFor({ movement: 'Step-over', amount: both(5), box: 'reps' }, first.total, {})
    expect(next.boxes.map((b) => b.total)).toEqual(['?', '?', '?', '?', '?'])
  })

  it('draws a box per suicide line', () => {
    const r = boxesFor({ movement: 'Suicide', box: 'lines', lines: [25, 0, 50, 0, 75], repDef: 's' }, 50, def('s', 1, 'repsPerLine'))
    expect(r.boxes.map((b) => b.big)).toEqual(['25 ft', 'start', '50 ft', 'start', '75 ft'])
    expect(r.boxes.map((b) => b.total)).toEqual(['51', '52', '53', '54', '55'])
  })

  it('prints enough boxes for the level that does the most', () => {
    const rope: ScoreCardItem = { movement: 'Rope Climb', amount: { m: 3, f: 2 }, box: 'reps', levels: { Sc: { amount: both(3) } } }
    expect(boxesFor(rope, 0, {}, { g: 'f' }).boxes).toHaveLength(3)
  })

  it('takes an EMOM minute’s reps', () => {
    expect(boxesFor({ movement: 'Burpee', box: 'reps' }, 0, {}, { reps: 7 }).boxes).toHaveLength(7)
  })
})

describe('labels', () => {
  it('shows men/women until the gender is known', () => {
    const row: ScoreCardItem = { movement: 'Cal Row', amount: { m: 20, f: 16 }, step: both(5), box: 'whole', unit: 'cal' }
    expect(amountLabel(row, null)).toBe('20/16 cal')
    expect(amountLabel(row, 'm', 2)).toBe('25 cal')
  })

  it('lists the level swaps', () => {
    const rope: ScoreCardItem = { movement: 'Rope Climb', amount: { m: 3, f: 2 }, box: 'reps', levels: { Int: { movement: 'Rope Climbs to tape', amount: { m: 2, f: 1 } }, Sc: { movement: 'Rope Let-Downs' } } }
    expect(levelSwaps(rope, null)).toEqual(['Int: 2/1 Rope Climbs to tape', 'Sc: Rope Let-Downs'])
  })
})
