import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

const req = (method = 'GET', body?: unknown) =>
  new Request(`http://test/api/workouts/1/assignments${url}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

describe('GET /api/workouts/[id]/assignments', () => {
  it('returns assignments ordered by heatNumber then lane', async () => {
    // Query order: requireWorkoutInCompetition, then fetchAssignmentsWithEmbeds.
    mock.queueResult([{ id: 1 }])
    mock.queueResult([{
      id: 10, heatNumber: 1, lane: 1, workoutId: 1, athleteId: 1,
      athleteName: 'Alice', bibNumber: null, divisionId: null,
      divisionName: null, divisionOrder: null,
    }])
    const res = await GET(req(), params('1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: 10, heatNumber: 1, lane: 1,
      athlete: { id: 1, name: 'Alice', bibNumber: null, divisionId: null, division: null },
    })
    // Drizzle query chain includes the orderBy call.
    expect(mock.calls.some((c) => c.method === 'orderBy')).toBe(true)
  })
})

describe('POST /api/workouts/[id]/assignments', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(req('POST', {}), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult([]) // requireWorkoutInCompetition
    const res = await POST(req('POST', {}), params('99'))
    expect(res.status).toBe(404)
  })

  it('generates assignments and invokes the replace_workout_heat_assignments RPC', async () => {
    // Query order:
    //   1. requireWorkoutInCompetition
    //   2. athletes
    //   3. workout-scoped scores (side-select — route path keeps but discards result)
    //   4. all scores (grouped by athlete)
    //   5. divisions
    //   6. (if useCumulative) completed workouts — skipped with useCumulative=false
    //   7. RPC via db.execute
    //   8. fetchAssignmentsWithEmbeds (final select)
    mock.queueResult([{ id: 1, lanes: 2, mixedHeats: true }])
    mock.queueResult([
      { id: 10, competitionId: 1, divisionId: null, name: 'Alice', bibNumber: null, userId: null, withdrawn: false },
      { id: 11, competitionId: 1, divisionId: null, name: 'Bob', bibNumber: null, userId: null, withdrawn: false },
    ])
    mock.queueResult([]) // workout-scoped scores
    mock.queueResult([]) // all scores for grouping
    mock.queueResult([]) // divisions
    mock.queueResult(undefined) // RPC execute
    mock.queueResult([
      { id: 1, heatNumber: 1, lane: 1, workoutId: 1, athleteId: 10,
        athleteName: 'Alice', bibNumber: null, divisionId: null, divisionName: null, divisionOrder: null },
      { id: 2, heatNumber: 1, lane: 2, workoutId: 1, athleteId: 11,
        athleteName: 'Bob', bibNumber: null, divisionId: null, divisionName: null, divisionOrder: null },
    ])

    const res = await POST(req('POST', {}), params('1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    expect(mock.calls.some((c) => c.method === 'execute')).toBe(true)
  })
})
