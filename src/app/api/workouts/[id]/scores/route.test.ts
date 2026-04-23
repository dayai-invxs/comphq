import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

const req = (method = 'GET', body?: unknown) =>
  new Request(`http://test/api/workouts/1/scores${url}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

describe('GET /api/workouts/[id]/scores', () => {
  it('returns scores with athlete embedded for workout', async () => {
    // Query order: requireWorkoutInCompetition (Workout), then Score ⨝ Athlete.
    mock.queueResult([{ id: 1 }])
    mock.queueResult([
      {
        id: 1, athleteId: 1, workoutId: 1, rawScore: 100,
        tiebreakRawScore: null, points: null, partBRawScore: null, partBPoints: null,
        athleteName: 'Alice', bibNumber: null, divisionId: null,
      },
    ])
    const res = await GET(req(), params('1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: 1, athleteId: 1, workoutId: 1, rawScore: 100,
      athlete: { id: 1, name: 'Alice', bibNumber: null, divisionId: null },
    })
  })
})

describe('POST /api/workouts/[id]/scores', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(req('POST', { athleteId: 1, rawScore: 95 }), params('1'))
    expect(res.status).toBe(401)
  })

  it('upserts score with onConflictDoUpdate on (athleteId, workoutId)', async () => {
    mock.queueResult([{ id: 1 }]) // requireWorkoutInCompetition
    mock.queueResult([{ id: 1, athleteId: 2, workoutId: 1, rawScore: 95, points: null }]) // returning()

    await POST(req('POST', { athleteId: 2, rawScore: 95 }), params('1'))
    // Insert values payload: points must be null (re-upsert resets rank).
    const valuesCall = mock.calls.find(
      (c) => c.method === 'values' && (c.args[0] as { athleteId?: number }).athleteId === 2,
    )
    expect(valuesCall!.args[0]).toMatchObject({ athleteId: 2, workoutId: 1, rawScore: 95, points: null })
    // onConflictDoUpdate exists in the chain.
    expect(mock.calls.some((c) => c.method === 'onConflictDoUpdate')).toBe(true)
  })
})

describe('DELETE /api/workouts/[id]/scores', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(req('DELETE'), params('1'))
    expect(res.status).toBe(401)
  })

  it('deletes all scores for workout and resets status', async () => {
    mock.queueResult([{ id: 1 }]) // requireWorkoutInCompetition
    mock.queueResult([{ id: 1 }, { id: 2 }]) // delete returning
    mock.queueResult(undefined) // workout status update
    const res = await DELETE(req('DELETE'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
    // Workout status reset call should set { status: 'active' }.
    const setCall = mock.calls.find(
      (c) => c.method === 'set' && (c.args[0] as { status?: string }).status === 'active',
    )
    expect(setCall).toBeTruthy()
  })
})
