import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthRole, setAuthUser } from '@/test/setup'
import { GET, PUT, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

const getReq = () => new Request(`http://test/api/workouts/1${url}`)
const putReq = (body: Record<string, unknown>) =>
  new Request(`http://test/api/workouts/1${url}`, { method: 'PUT', body: JSON.stringify(body) })
const deleteReq = () => new Request(`http://test/api/workouts/1${url}`)

describe('GET /api/workouts/[id]', () => {
  it('returns workout with assignments, scores, and completedHeats', async () => {
    // Query order: requireWorkoutInCompetition, then Promise.all of
    // (assignments ⨝ athletes ⨝ divisions), (scores ⨝ athletes), getCompletedHeats.
    mock.queueResult([{ id: 1, name: 'WOD 1' }])
    mock.queueResult([{
      id: 10, heatNumber: 1, lane: 1, workoutId: 1, athleteId: 1,
      athleteName: 'Alice', bibNumber: null, divisionId: null,
      divisionName: null, divisionOrder: null,
    }])
    mock.queueResult([{
      id: 20, athleteId: 1, workoutId: 1, rawScore: 100,
      tiebreakRawScore: null, points: null, partBRawScore: null, partBPoints: null,
      athleteName: 'Alice', bibNumber: null, divisionId: null,
    }])
    mock.queueResult([{ heatNumber: 1 }]) // getCompletedHeats

    const res = await GET(getReq(), params('1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(1)
    expect(body.assignments).toHaveLength(1)
    expect(body.scores).toHaveLength(1)
    expect(body.completedHeats).toEqual([1])
  })

  // The workout's own leaderboard is split by division, so a score carries it.
  it('sends each score with its athlete\'s division', async () => {
    // The mock hands results out in the order the reads settle: the workout,
    // the completed heats, the assignments, then the scores.
    mock.queueResult([{ id: 1, name: 'WOD 1' }])
    mock.queueResult([])
    mock.queueResult([])
    mock.queueResult([
      { id: 20, athleteId: 1, workoutId: 1, rawScore: 100, points: 1, athleteName: 'Alice', bibNumber: null, divisionId: 3, divisionName: 'Rx', divisionOrder: 2 },
      { id: 21, athleteId: 2, workoutId: 1, rawScore: 90, points: 1, athleteName: 'Bo', bibNumber: null, divisionId: null, divisionName: null, divisionOrder: null },
    ])
    const body = await (await GET(getReq(), params('1'))).json()
    expect(body.scores[0].athlete.division).toEqual({ id: 3, name: 'Rx', order: 2 })
    expect(body.scores[1].athlete.division).toBeNull()
  })

  it('returns 404 when not found in caller competition', async () => {
    mock.queueResult([]) // requireWorkoutInCompetition → no row
    const res = await GET(getReq(), params('999'))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/workouts/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PUT(putReq({ name: 'X' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('rejects empty patch', async () => {
    const res = await PUT(putReq({}), params('1'))
    expect(res.status).toBe(400)
  })

  it('updates provided fields only', async () => {
    mock.queueResult([{ id: 1, name: 'New' }]) // update().returning()
    await PUT(putReq({ name: 'New', status: 'active' }), params('1'))
    const setCall = mock.calls.find(
      (c) => c.method === 'set' && 'name' in (c.args[0] as Record<string, unknown>),
    )
    expect(setCall!.args[0]).toEqual({ name: 'New', status: 'active' })
  })

  it('saves the description (COM-112)', async () => {
    mock.queueResult([{ id: 1 }]) // update().returning()
    await PUT(putReq({ description: '3 rounds for time' }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toEqual({ description: '3 rounds for time' })
  })

  // Half and double weight are one choice: turning one on turns the other off.
  it('turns half weight off when double weight goes on', async () => {
    mock.queueResult([{ id: 1 }]) // update().returning()
    await PUT(putReq({ doubleWeight: true }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toEqual({ doubleWeight: true, halfWeight: false })
  })

  it('turns double weight off when half weight goes on', async () => {
    mock.queueResult([{ id: 1 }]) // update().returning()
    await PUT(putReq({ halfWeight: true }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toEqual({ halfWeight: true, doubleWeight: false })
  })

  it('refuses a workout that is both half and double weight', async () => {
    const res = await PUT(putReq({ halfWeight: true, doubleWeight: true }), params('1'))
    expect(res.status).toBe(400)
  })

  it('moves edited heat times along with the workout\'s start', async () => {
    mock.queueResult([{ startTime: '2026-11-14 18:00:00+00', heatStartOverrides: { '2': '2026-11-14T19:05:00.000Z' } }])
    mock.queueResult([{ id: 1 }]) // update().returning()
    await PUT(putReq({ startTime: '2026-11-11T18:00:00.000Z' }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toEqual({
      startTime: '2026-11-11T18:00:00.000Z',
      heatStartOverrides: { '2': '2026-11-11T19:05:00.000Z' },
    })
  })

  it('leaves heat times alone when the start does not move', async () => {
    mock.queueResult([{ startTime: '2026-11-14 18:00:00+00', heatStartOverrides: { '2': '2026-11-14T19:05:00.000Z' } }])
    mock.queueResult([{ id: 1 }])
    await PUT(putReq({ startTime: '2026-11-14T18:00:00.000Z', name: 'Fran' }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toEqual({ name: 'Fran', startTime: '2026-11-14T18:00:00.000Z' })
  })

  it('clears the description when sent null', async () => {
    mock.queueResult([{ id: 1 }]) // update().returning()
    await PUT(putReq({ description: null }), params('1'))
    const setCall = mock.calls.find((c) => c.method === 'set')
    expect(setCall!.args[0]).toEqual({ description: null })
  })

  it('nulls all partBRawScore / partBPoints when partBEnabled flips off', async () => {
    mock.queueResult([{ id: 1, partBEnabled: false }]) // workout update
    mock.queueResult(undefined) // score update

    await PUT(putReq({ partBEnabled: false }), params('1'))

    // The second .set(...) nulls partB columns on Score.
    const scoreSet = mock.calls.find(
      (c) => c.method === 'set' && 'partBRawScore' in (c.args[0] as Record<string, unknown>),
    )
    expect(scoreSet!.args[0]).toEqual({ partBRawScore: null, partBPoints: null })
  })

  it('does not touch Score when partBEnabled flips on (true)', async () => {
    mock.queueResult([{ id: 1, partBEnabled: true }])
    await PUT(putReq({ partBEnabled: true }), params('1'))
    const scoreSet = mock.calls.find(
      (c) => c.method === 'set' && 'partBRawScore' in (c.args[0] as Record<string, unknown>),
    )
    expect(scoreSet).toBeUndefined()
  })
})

describe('DELETE /api/workouts/[id]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 204 on success', async () => {
    mock.queueResult(undefined) // delete resolves
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(204)
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(true)
  })
})

// A scorekeeper (role 'user') activates, deactivates and completes workouts;
// the workout's settings are the admin's.
describe('PUT /api/workouts/[id] as a competition user', () => {
  it('may change the status', async () => {
    setAuthRole('user')
    mock.queueResult([{ id: 1, status: 'active' }])
    expect((await PUT(putReq({ status: 'active' }), params('1'))).status).toBe(200)
  })

  it('may not change anything else, even alongside the status', async () => {
    setAuthRole('user')
    expect((await PUT(putReq({ name: 'Fran 2' }), params('1'))).status).toBe(403)
    expect((await PUT(putReq({ status: 'active', lanes: 6 }), params('1'))).status).toBe(403)
    expect(mock.calls.some((c) => c.method === 'update')).toBe(false)
  })
})
