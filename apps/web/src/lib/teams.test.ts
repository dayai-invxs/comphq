import { describe, expect, it } from 'vitest'
import { divisionFormat, doubleEntries, entryWarnings, isTeam } from './teams'

const shape = (teamSize: number, menCount: number | null = null, womenCount: number | null = null) =>
  ({ teamSize, menCount, womenCount })
const member = (name: string, gender: 'male' | 'female' | null = null) => ({ name, gender })

describe('divisionFormat', () => {
  it.each([
    [shape(1), 'Individual'],
    [shape(1, null, 1), 'Individual · Female'],
    [shape(1, 1, null), 'Individual · Male'],
    [shape(3), 'Team of 3'],
    [shape(4, 2, 2), 'Team of 4 · 2M / 2F'],
    [shape(2, null, 2), 'Team of 2 · 2F'],
  ])('describes %o as %s', (d, label) => {
    expect(divisionFormat(d)).toBe(label)
  })
})

describe('isTeam', () => {
  it('reads a size above 1 as a team, and no division as individual', () => {
    expect(isTeam(shape(2))).toBe(true)
    expect(isTeam(shape(1))).toBe(false)
    expect(isTeam(null)).toBe(false)
  })
})

describe('entryWarnings', () => {
  it('says nothing without a division', () => {
    expect(entryWarnings({ gender: 'male', members: [] }, null)).toEqual([])
  })

  it('flags an individual in the other gender\'s division, but not one with no gender set', () => {
    expect(entryWarnings({ gender: 'male', members: [] }, shape(1, null, 1))).toEqual(['This division is for female athletes.'])
    expect(entryWarnings({ gender: null, members: [] }, shape(1, null, 1))).toEqual([])
    expect(entryWarnings({ gender: 'female', members: [] }, shape(1, null, 1))).toEqual([])
  })

  // A team with nobody listed still competes; it is only told so.
  it('flags a team with no members as short, nothing more', () => {
    expect(entryWarnings({ gender: null, members: [] }, shape(4, 2, 2))).toEqual(['0 of 4 members listed.'])
  })

  it('flags the wrong member count', () => {
    expect(entryWarnings({ gender: null, members: [member('A'), member('B'), member('C')] }, shape(2)))
      .toEqual(['3 of 2 members listed.'])
  })

  it('flags the wrong split once every member has a gender', () => {
    const members = [member('A', 'male'), member('B', 'male'), member('C', 'male'), member('D', 'female')]
    expect(entryWarnings({ gender: null, members }, shape(4, 2, 2))).toEqual(['3 of 2 male.', '1 of 2 female.'])
  })

  it('holds off on the split while a member\'s gender is blank', () => {
    const members = [member('A', 'male'), member('B', 'male'), member('C', 'male'), member('D')]
    expect(entryWarnings({ gender: null, members }, shape(4, 2, 2))).toEqual([])
  })

  it('passes a team that matches', () => {
    const members = [member('A', 'male'), member('B', 'female'), member('C', 'male'), member('D', 'female')]
    expect(entryWarnings({ gender: null, members }, shape(4, 2, 2))).toEqual([])
  })
})

describe('doubleEntries', () => {
  it('finds a team member who is also entered as an individual', () => {
    const athletes = [
      { id: 1, name: 'Maddie Clark', division: shape(1), members: [] },
      { id: 2, name: 'Team A', division: shape(2), members: [{ name: ' maddie  clark' }, { name: 'Other' }] },
      { id: 3, name: 'Team B', division: shape(2), members: [{ name: 'Nobody' }] },
    ]
    expect([...doubleEntries(athletes)]).toEqual([[2, [' maddie  clark']]])
  })

  it('does not treat an empty team as an individual', () => {
    const athletes = [
      { id: 1, name: 'Kami', division: shape(2), members: [] },
      { id: 2, name: 'Team A', division: shape(2), members: [{ name: 'Kami' }] },
    ]
    expect(doubleEntries(athletes).size).toBe(0)
  })
})
