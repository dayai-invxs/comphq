import { describe, expect, it } from 'vitest'
import { parseScoreCard, pickVersion, unansweredRepDefinitions, type ScoreCardSpec } from '@/lib/scoreCard'

// The structures saved for real workouts must pass the checks the server runs
// on save. Each fixture is one workout's structure, as pasted into the editor.
const fixtures = import.meta.glob<{ default: unknown }>('./__fixtures__/*.json', { eager: true })

describe('score card structures', () => {
  it.each(Object.entries(fixtures))('%s passes its checks', (_name, mod) => {
    const r = parseScoreCard(mod.default)
    expect(r.ok ? [] : r.errors).toEqual([])
  })

  it('has all four Rugged In House workouts', () => {
    expect(Object.keys(fixtures).filter((k) => k.includes('rugged-'))).toHaveLength(4)
  })

  it('names the path of what fails, so it can be fixed', () => {
    const r = parseScoreCard({
      version: 1,
      versions: [{ label: 'RX', parts: [{ kind: 'sequence', items: [
        { movement: 'Row', box: 'whole' },
        { movement: 'HSW', box: 'reps', amount: { m: 20, f: 20 }, repDef: 'nope' },
      ] }] }],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toContain('versions.0.parts.0.items.0.amount: needs an amount')
    expect(r.errors).toContain('versions.0.parts.0.items.1.repDef: "nope" is not one of the repDefinitions')
  })

  it('checks the movements inside relay legs, and wants items or legs', () => {
    const r = parseScoreCard({
      version: 1,
      versions: [{ label: 'R1', parts: [
        { kind: 'relay', legs: [{ label: 'RX athlete', items: [{ movement: 'Carry', box: 'lines', lines: [25], repDef: 'nope' }] }] },
        { kind: 'relay' },
      ] }],
    })
    expect(r.ok ? [] : r.errors).toEqual([
      'versions.0.parts.0.legs.0.items.0.repDef: "nope" is not one of the repDefinitions',
      'versions.0.parts.1.items: a relay needs items or legs',
    ])
  })

  it('refuses another version number and unknown part kinds', () => {
    expect(parseScoreCard({ version: 2, versions: [] }).ok).toBe(false)
    expect(parseScoreCard({ version: 1, versions: [{ label: 'x', parts: [{ kind: 'tabata', items: [] }] }] }).ok).toBe(false)
  })

  it('lists rep definitions nobody has answered', () => {
    const coliseum = parseScoreCard(fixtures['./__fixtures__/gladiator-4-coliseum.json'].default)
    expect(coliseum.ok && unansweredRepDefinitions(coliseum.spec).map((d) => d.key)).toEqual(['run'])
  })
})

describe('pickVersion', () => {
  const spec = {
    version: 1,
    versions: [
      { label: 'RX', divisions: ['Rx - Individual Men', 'Rx - Individual Women'], parts: [] },
      { label: 'Scaled', divisions: ['Scaled - Individual Men'], parts: [] },
      { label: 'Anyone', parts: [] },
    ],
  } as unknown as ScoreCardSpec

  it('matches the lane’s division, ignoring case and spacing', () => {
    expect(pickVersion(spec, { divisionName: ' scaled - individual men ' })).toBe(1)
    expect(pickVersion(spec, { divisionName: 'Rx - Individual Women' })).toBe(0)
  })

  it('falls back to the version that names no division', () => {
    expect(pickVersion(spec, { divisionName: 'Masters' })).toBe(2)
    expect(pickVersion(spec, {})).toBe(2)
  })

  it('takes a knockout lane’s round first', () => {
    const ko = { version: 1, versions: [{ label: 'R1', round: 1, parts: [] }, { label: 'R2', round: 2, parts: [] }] } as unknown as ScoreCardSpec
    expect(pickVersion(ko, { round: 2 })).toBe(1)
    expect(pickVersion(ko, { round: null })).toBe(0)
  })
})
