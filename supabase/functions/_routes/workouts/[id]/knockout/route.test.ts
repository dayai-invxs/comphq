import { describe, expect, it } from 'vitest'
import { drizzleMock as mock, setAuthRole, setAuthUser } from '@/test/setup'
import { DELETE, POST } from './route'

const params = { params: Promise.resolve({ id: '1' }) }
const post = (body: unknown) => new Request('http://test/api/workouts/1/knockout?slug=default', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const del = (body?: unknown) => new Request('http://test/api/workouts/1/knockout?slug=default', {
  method: 'DELETE',
  ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
})

const WK = {
  id: 1, competitionId: 1, knockout: true, scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time',
  lanes: 4, knockoutRounds: 2, knockoutAdvance: 2,
}
const lane = (id: number, athleteId: number, heatNumber: number, rawScore: number | null, round = 1) =>
  ({ id, athleteId, divisionId: 7, heatNumber, lane: 1, round, rawScore, capped: false, tiebreakRawScore: null, advanced: null })

describe('POST /api/workouts/[id]/knockout', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(post({ action: 'start' }), params)).status).toBe(401)
  })

  it('refuses a workout that is not a knockout', async () => {
    mock.queueResult([{ ...WK, knockout: false }])
    const res = await POST(post({ action: 'advance' }), params)
    expect(res.status).toBe(400)
  })

  it('builds the next round from the top N of each heat, numbering heats on', async () => {
    mock.queueResult([WK])
    mock.queueResult([
      lane(1, 11, 1, 70), lane(2, 12, 1, 80), lane(3, 13, 1, 90),
      lane(4, 21, 2, 60), lane(5, 22, 2, 85), lane(6, 23, 2, 95),
    ])
    mock.queueResult([{ id: 7, order: 1 }]) // divisions
    mock.queueResult(undefined) // insert

    const res = await POST(post({ action: 'advance' }), params)
    expect(await res.json()).toEqual({ round: 2, placed: 4 })
    const inserted = mock.calls.find((c) => c.method === 'values')!.args[0] as Array<{ athleteId: number; heatNumber: number; round: number }>
    expect(inserted.map((r) => r.athleteId).sort()).toEqual([11, 12, 21, 22])
    expect(inserted.every((r) => r.heatNumber === 3 && r.round === 2)).toBe(true)
  })

  it('refuses to advance while a heat is unsettled, and says which', async () => {
    mock.queueResult([WK])
    mock.queueResult([lane(1, 11, 1, null), lane(2, 12, 1, null)])
    const res = await POST(post({ action: 'advance' }), params)
    expect(res.status).toBe(409)
    expect(await res.text()).toBe('Heat 1 has no scores and no one is ticked to advance.')
  })

  it('refuses to advance past the final', async () => {
    mock.queueResult([WK])
    mock.queueResult([lane(1, 11, 3, 60, 2)])
    const res = await POST(post({ action: 'advance' }), params)
    expect(res.status).toBe(409)
    expect(await res.text()).toBe('Round 2 is the final. Finish the tournament instead.')
  })

  it('refuses to finish before the final', async () => {
    mock.queueResult([WK])
    mock.queueResult([lane(1, 11, 1, 60)])
    const res = await POST(post({ action: 'finish' }), params)
    expect(res.status).toBe(409)
    expect(await res.text()).toMatch(/round 1 of 2/)
  })

  it('finishes: placings become points, labelled by how far each got', async () => {
    mock.queueResult([WK])
    mock.queueResult([
      lane(1, 11, 1, 70), lane(2, 12, 1, 90),
      lane(3, 11, 2, 61, 2),
    ])
    mock.queueResult(undefined) // delete scores
    mock.queueResult(undefined) // insert
    mock.queueResult(undefined) // status

    const res = await POST(post({ action: 'finish' }), params)
    expect(await res.json()).toEqual({ placed: 2 })
    const rows = mock.calls.find((c) => c.method === 'values')!.args[0] as Array<{ athleteId: number; points: number; knockoutLabel: string }>
    expect(rows.map((r) => [r.athleteId, r.points, r.knockoutLabel])).toEqual([
      [11, 1, 'Final · 0:00.06'],
      [12, 2, 'Out in Round 1 · 0:00.09'],
    ])
    expect(mock.calls.find((c) => c.method === 'set' && (c.args[0] as { status?: string }).status)!.args[0]).toEqual({ status: 'completed' })
  })
})

describe('DELETE /api/workouts/[id]/knockout', () => {
  it('refuses to undo round 1', async () => {
    mock.queueResult([WK])
    mock.queueResult([lane(1, 11, 1, null)])
    const res = await DELETE(del(), params)
    expect(res.status).toBe(409)
  })

  it('will not delete a round\'s results unless told to', async () => {
    mock.queueResult([WK])
    mock.queueResult([lane(1, 11, 1, 70), lane(2, 11, 2, 60, 2)])
    const res = await DELETE(del(), params)
    expect(res.status).toBe(409)
    expect(await res.text()).toBe('Round 2 has results. Undoing it deletes them.')
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(false)
  })

  // Finished, then backed out: the final goes, its results and the placings
  // with it, and the workout reopens on round 1's results.
  it('undoes a finished final when told to discard its results', async () => {
    mock.queueResults(
      [WK],
      [lane(1, 11, 1, 70), lane(2, 11, 2, 60, 2)], // has the round results?
      [lane(1, 11, 1, 70), lane(2, 11, 2, 60, 2)], // undoRound
    )
    const res = await DELETE(del({ discardResults: true }), params)
    expect(await res.json()).toEqual({ round: 1 })
    expect(mock.calls.filter((c) => c.method === 'delete').length).toBe(4) // lanes, completions, judges, placings
    expect(mock.calls.some((c) => c.method === 'set' && (c.args[0] as { status?: string }).status === 'active')).toBe(true)
  })

  it('leaves discarding results to an admin', async () => {
    setAuthRole('user')
    mock.queueResults([WK], [lane(1, 11, 1, 70), lane(2, 11, 2, 60, 2)])
    const res = await DELETE(del({ discardResults: true }), params)
    expect(res.status).toBe(403)
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('refuses a body it does not understand', async () => {
    expect((await DELETE(del({ everything: true }), params)).status).toBe(400)
  })

  it('removes the latest round\'s heats', async () => {
    mock.queueResult([WK])
    mock.queueResult([lane(1, 11, 1, 70), lane(2, 11, 2, null, 2)])
    const res = await DELETE(del(), params)
    expect(await res.json()).toEqual({ round: 1 })
    expect(mock.calls.filter((c) => c.method === 'delete').length).toBeGreaterThanOrEqual(4)
  })
})

// A scorekeeper starts and runs the tournament.
describe('a knockout run by a competition user', () => {
  it('may start it', async () => {
    setAuthRole('user')
    mock.queueResult([WK])
    // Past the role check and into the tournament, which has nobody to place.
    const res = await POST(post({ action: 'start' }), params)
    expect(res.status).toBe(409)
    expect(await res.text()).toBe('There are no athletes/teams to place.')
  })

  it('may advance it', async () => {
    setAuthRole('user')
    mock.queueResult([WK])
    mock.queueResult([
      lane(1, 11, 1, 70), lane(2, 12, 1, 80), lane(3, 13, 1, 90),
      lane(4, 21, 2, 60), lane(5, 22, 2, 85), lane(6, 23, 2, 95),
    ])
    mock.queueResult([{ id: 7, order: 1 }])
    mock.queueResult(undefined)
    expect((await POST(post({ action: 'advance' }), params)).status).toBe(200)
  })
})
