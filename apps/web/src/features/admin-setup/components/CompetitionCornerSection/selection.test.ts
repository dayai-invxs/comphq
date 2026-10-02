import { describe, expect, it } from 'vitest'
import type { CcChange } from '@/api/competitionCorner'
import { defaultAccepted, toggle } from './selection'

const change = (key: string, over: Partial<CcChange> = {}): CcChange => ({
  key, entity: 'division', kind: 'add', id: null, label: key, fields: [], warnings: [], requires: [], ...over,
})

const changes = [
  change('division:1'),
  change('athlete:100', { entity: 'athlete', requires: ['division:1'] }),
  change('workout:10', { entity: 'workout' }),
  change('heats:10', { entity: 'heats', requires: ['workout:10', 'athlete:100'] }),
  change('division:9', { kind: 'remove', id: 3 }),
]

describe('defaultAccepted', () => {
  // A removal deletes rows the admin may have built on; it is opt-in.
  it('keeps every change except removals', () => {
    expect([...defaultAccepted(changes)]).toEqual(['division:1', 'athlete:100', 'workout:10', 'heats:10'])
  })
})

describe('toggle', () => {
  it('checking a change checks what it needs, all the way down', () => {
    expect([...toggle(new Set(), changes, 'heats:10', true)].sort())
      .toEqual(['athlete:100', 'division:1', 'heats:10', 'workout:10'])
  })

  it('unchecking a change unchecks what needs it, all the way up', () => {
    expect([...toggle(defaultAccepted(changes), changes, 'division:1', false)]).toEqual(['workout:10'])
  })

  it('leaves the set it was given alone', () => {
    const before = new Set(['workout:10'])
    toggle(before, changes, 'division:1', true)
    expect([...before]).toEqual(['workout:10'])
  })
})
