import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthRole, setAuthUser } from '@/test/setup'
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
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 1, athleteId: 2, workoutId: 1, rawScore: 95, points: null }]) // returning()
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition

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

describe('POST /api/workouts/[id]/scores, capped', () => {
  const sent = () => mock.calls.find(
    (c) => c.method === 'values' && (c.args[0] as { athleteId?: number }).athleteId === 2,
  )!.args[0] as { capped: boolean; partBCapped: boolean }

  it('stores the flag on a timed workout', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time' }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 1 }])
    await POST(req('POST', { athleteId: 2, rawScore: 40012, capped: true, partBRawScore: 30000, partBCapped: true }), params('1'))
    expect(sent()).toMatchObject({ rawScore: 40012, capped: true, partBCapped: true })
  })

  it('refuses the flag where there is no time to miss', async () => {
    mock.queueResult([{ id: 1, scoreType: 'rounds_reps', partBScoreType: 'weight' }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 1 }])
    await POST(req('POST', { athleteId: 2, rawScore: 40012, capped: true, partBRawScore: 100, partBCapped: true }), params('1'))
    expect(sent()).toMatchObject({ capped: false, partBCapped: false })
  })

  it('treats a score that does not mention it as finished', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time' }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 1 }])
    await POST(req('POST', { athleteId: 2, rawScore: 95 }), params('1'))
    expect(sent()).toMatchObject({ capped: false, partBCapped: false })
  })
})

describe('POST /api/workouts/[id]/scores, a team split across heats', () => {
  const body = { athleteId: 2, lanes: [{ assignmentId: 31, rawScore: 60_000 }, { assignmentId: 32, rawScore: 90_500, tiebreakRawScore: 1 }] }

  it('keeps each lane and writes the sum as the team score once every lane is in', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time' }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 31 }]) // lane 31 updated
    mock.queueResult([{ id: 32 }]) // lane 32 updated
    mock.queueResult([
      { rawScore: 60_000, tiebreakRawScore: 2, partBRawScore: null },
      { rawScore: 90_500, tiebreakRawScore: 1, partBRawScore: null },
    ])
    mock.queueResult([{ id: 9, athleteId: 2, workoutId: 1, rawScore: 150_500 }])

    const res = await POST(req('POST', body), params('1'))
    expect(res.status).toBe(200)

    const laneSets = mock.calls.filter((c) => c.method === 'set').map((c) => c.args[0])
    expect(laneSets.slice(0, 2)).toEqual([
      { rawScore: 60_000, tiebreakRawScore: null, partBRawScore: null, capped: false },
      { rawScore: 90_500, tiebreakRawScore: 1, partBRawScore: null, capped: false },
    ])
    const values = mock.calls.find((c) => c.method === 'values')!.args[0]
    expect(values).toMatchObject({ athleteId: 2, workoutId: 1, rawScore: 150_500, tiebreakRawScore: 3, capped: false, points: null })
  })

  it('makes the best lane the team\'s tiebreak when the best athlete breaks ties', async () => {
    mock.queueResult([{ id: 1, scoreType: 'higher_is_better', partBScoreType: 'time', tiebreakBestLane: true }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 31 }])
    mock.queueResult([{ id: 32 }])
    mock.queueResult([
      { rawScore: 52, tiebreakRawScore: null, partBRawScore: null },
      { rawScore: 71, tiebreakRawScore: 1, partBRawScore: null },
    ])
    mock.queueResult([{ id: 9, athleteId: 2, workoutId: 1, rawScore: 123, tiebreakRawScore: 71 }])

    await POST(req('POST', { athleteId: 2, lanes: [{ assignmentId: 31, rawScore: 52 }, { assignmentId: 32, rawScore: 71, tiebreakRawScore: 1 }] }), params('1'))
    const values = mock.calls.find((c) => c.method === 'values')!.args[0]
    expect(values).toMatchObject({ athleteId: 2, workoutId: 1, rawScore: 123, tiebreakRawScore: 71 })
  })

  it('removes the team score while a lane is still unscored', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time' }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 31 }])
    mock.queueResult([{ id: 32 }])
    mock.queueResult([
      { rawScore: 60_000, tiebreakRawScore: null, partBRawScore: null },
      { rawScore: 90_500, tiebreakRawScore: null, partBRawScore: null },
      { rawScore: null, tiebreakRawScore: null, partBRawScore: null },
    ])
    mock.queueResult(undefined) // delete

    const res = await POST(req('POST', body), params('1'))
    expect(await res.json()).toEqual({ athleteId: 2, workoutId: 1, pending: true, lanesScored: 2, lanes: 3 })
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(true)
    expect(mock.calls.some((c) => c.method === 'values')).toBe(false)
  })

  it('refuses a lane that is not this team\'s in this workout', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time' }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([]) // no row updated

    const res = await POST(req('POST', body), params('1'))
    expect(res.status).toBe(400)
  })

  it('needs a score or lanes', async () => {
    const res = await POST(req('POST', { athleteId: 2 }), params('1'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/workouts/[id]/scores, a knockout round', () => {
  it('keeps the lane\'s own result, capped where timed, and writes no team score', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time', knockout: true }])
    mock.queueResult([{ id: 2 }]) // the athlete, in this competition
    mock.queueResult([{ id: 31 }])

    const res = await POST(req('POST', { athleteId: 2, lanes: [{ assignmentId: 31, rawScore: 40012, capped: true }] }), params('1'))
    expect(await res.json()).toEqual({ athleteId: 2, workoutId: 1, lanes: 1 })
    expect(mock.calls.find((c) => c.method === 'set')!.args[0]).toEqual({ rawScore: 40012, tiebreakRawScore: null, partBRawScore: null, capped: true })
    expect(mock.calls.some((c) => c.method === 'values')).toBe(false)
  })
})

// A score for someone who is not in this competition was stored all the same.
describe('POST /api/workouts/[id]/scores, someone else\'s athlete', () => {
  it('404s an athlete from another competition, and stores nothing', async () => {
    mock.queueResult([{ id: 1, scoreType: 'time', partBScoreType: 'time' }])
    mock.queueResult([]) // no such athlete here
    const res = await POST(req('POST', { athleteId: 999, rawScore: 95 }), params('1'))
    expect(res.status).toBe(404)
    expect(mock.calls.some((c) => c.method === 'insert')).toBe(false)
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
    mock.queueResult(undefined) // lane scores cleared
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

// Clearing every score is the admin's; a scorekeeper corrects one at a time.
describe('DELETE /api/workouts/[id]/scores as a competition user', () => {
  it('is refused, and deletes nothing', async () => {
    setAuthRole('user')
    expect((await DELETE(req('DELETE'), params('1'))).status).toBe(403)
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(false)
  })
})

