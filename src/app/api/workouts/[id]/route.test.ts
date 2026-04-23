import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
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
