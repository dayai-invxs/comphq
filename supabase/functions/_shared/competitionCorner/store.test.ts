import { describe, expect, it } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { db } from '@/lib/db'
import { executeWrites, loadCurrent, type Tx } from './store'
import type { Writes } from './writes'

const tx = db as unknown as Tx

const none: Writes = {
  divisions: { insert: [], update: [], remove: [] },
  locations: [],
  workouts: { insert: [], update: [], remove: [] },
  athletes: { insert: [], update: [], remove: [] },
  heats: [],
}

const methods = () => mock.calls.map((c) => c.method).filter((m) => ['select', 'insert', 'update', 'delete', 'execute'].includes(m))

describe('loadCurrent', () => {
  it('reads the five tables in one go', async () => {
    mock.queueResults([{ id: 1, name: 'Rx', order: 1, externalId: '1', teamSize: 1 }], [], [], [])

    const current = await loadCurrent(tx, 1)

    expect(current).toEqual({ divisions: [{ id: 1, name: 'Rx', order: 1, externalId: '1', teamSize: 1 }], workouts: [], athletes: [], heatAssignments: [] })
  })

  it('lists each team\'s members, in order, on its athlete row', async () => {
    mock.queueResults(
      [],
      [],
      [{ id: 4, name: 'Team A', divisionId: null, externalId: '9' }, { id: 5, name: 'Solo', divisionId: null, externalId: null }],
      [],
      [{ athleteId: 4, name: 'Kami' }, { athleteId: 4, name: 'Lyra' }],
    )

    const current = await loadCurrent(tx, 1)

    expect(current.athletes).toEqual([
      { id: 4, name: 'Team A', divisionId: null, externalId: '9', members: ['Kami', 'Lyra'] },
      { id: 5, name: 'Solo', divisionId: null, externalId: null, members: [] },
    ])
  })
})

describe('executeWrites', () => {
  it('only stamps the competition when nothing else is accepted', async () => {
    await executeWrites(tx, 1, 19948, none)

    expect(methods()).toEqual(['update'])
  })

  it('places lanes with the ids the earlier writes produced', async () => {
    const writes: Writes = {
      ...none,
      athletes: { insert: [{ name: 'Ann', externalId: '100', divisionExternalId: '1', members: [] }], update: [], remove: [] },
      heats: [{
        workoutExternalId: '10',
        assignments: [{ athleteExternalId: '100', heatNumber: 1, lane: 3 }],
        heatStartOverrides: { 1: '2026-04-25T15:05:00.000Z' },
      }],
    }
    mock.queueResults(
      [{ id: 3, externalId: '1' }], // divisions by external id
      [{ id: 5, externalId: '100' }], // athlete insert, returning
      [{ id: 7, externalId: '10' }], // workouts by external id
      [{ id: 5, externalId: '100' }], // athletes by external id
      undefined, // heat RPC
      undefined, // start overrides
      undefined, // competition stamp
    )

    await executeWrites(tx, 1, 19948, writes)

    // The RPC clears the overrides; the source's go back on after it.
    expect(methods()).toEqual(['select', 'insert', 'select', 'select', 'execute', 'update', 'update'])
    const sets = mock.calls.filter((c) => c.method === 'set').map((c) => c.args[0])
    expect(sets[0]).toEqual({ heatStartOverrides: { 1: '2026-04-25T15:05:00.000Z' } })
    const values = mock.calls.find((c) => c.method === 'values')!.args[0]
    expect(values).toEqual([{ competitionId: 1, name: 'Ann', externalId: '100', divisionId: 3 }])
    const rpc = JSON.stringify(mock.calls.find((c) => c.method === 'execute')!.args)
    expect(rpc).toContain('[{\\"athleteId\\":5,\\"heatNumber\\":1,\\"lane\\":3}]')
  })

  it('gives a new team its members, using the id the insert returned', async () => {
    const writes: Writes = {
      ...none,
      athletes: { insert: [{ name: 'Team A', externalId: '9', divisionExternalId: null, members: ['Kami', 'Lyra'] }], update: [], remove: [] },
    }
    mock.queueResults([], [{ id: 12, externalId: '9' }], undefined, undefined, undefined)

    await executeWrites(tx, 1, 19948, writes)

    expect(methods()).toEqual(['select', 'insert', 'delete', 'insert', 'update'])
    const values = mock.calls.filter((c) => c.method === 'values').map((c) => c.args[0])
    expect(values[1]).toEqual([{ athleteId: 12, name: 'Kami', order: 0 }, { athleteId: 12, name: 'Lyra', order: 1 }])
  })

  it('replaces an existing team\'s members only when the change carries them', async () => {
    const writes: Writes = {
      ...none,
      athletes: {
        insert: [],
        update: [
          { id: 4, set: { externalId: '9' }, members: ['Kami'] },
          { id: 5, set: { name: 'Renamed', externalId: '10' } },
        ],
        remove: [],
      },
    }

    await executeWrites(tx, 1, 19948, writes)

    expect(methods()).toEqual(['update', 'update', 'delete', 'insert', 'update'])
    const values = mock.calls.filter((c) => c.method === 'values').map((c) => c.args[0])
    expect(values).toEqual([[{ athleteId: 4, name: 'Kami', order: 0 }]])
  })

  it('creates only the locations it cannot find', async () => {
    const writes: Writes = { ...none, locations: ['Floor', 'Rig'] }
    mock.queueResults([{ id: 2, name: 'floor' }], [{ id: 3, name: 'Rig' }], undefined)

    await executeWrites(tx, 1, 19948, writes)

    const values = mock.calls.find((c) => c.method === 'values')!.args[0]
    expect(values).toEqual([{ competitionId: 1, name: 'Rig' }])
  })
})
