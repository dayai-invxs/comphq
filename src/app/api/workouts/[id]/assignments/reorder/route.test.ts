import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { PUT } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const url = '?slug=default'

function req(body: unknown) {
  return new Request(`http://test/api/workouts/1/assignments/reorder${url}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

// Current DB state used to validate incoming updates. Two heats, five total rows.
const currentRows = [
  { id: 1, heatNumber: 1, lane: 1 },
  { id: 2, heatNumber: 1, lane: 2 },
  { id: 3, heatNumber: 1, lane: 3 },
  { id: 4, heatNumber: 2, lane: 1 },
  { id: 5, heatNumber: 2, lane: 2 },
]

// NOTE: requireCompetitionAdmin is mocked at the module level in setup.ts, so
// the UserProfile/CompetitionAdmin selects never reach the drizzleMock queue —
// only the route's own queries do (Workout → assignments → (maybe RPC) → select).

describe('PUT /api/workouts/[id]/assignments/reorder', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await PUT(req({ updates: [] }), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    // requireWorkoutInCompetition finds no row.
    mock.queueResult([])
    const res = await PUT(req({ updates: [{ id: 1, heatNumber: 1, lane: 1 }] }), params('99'))
    expect(res.status).toBe(404)
  })

  it('happy path: invokes the RPC once and returns fresh rows', async () => {
    mock.queueResult([{ id: 1 }])       // Workout exists
    mock.queueResult(currentRows)        // current assignments for validation
    mock.queueResult(undefined)          // RPC execute
    mock.queueResult([])                 // final joined select

    const updates = [
      { id: 3, heatNumber: 1, lane: 2 },
      { id: 2, heatNumber: 2, lane: 1 },
      { id: 4, heatNumber: 2, lane: 2 },
      { id: 5, heatNumber: 2, lane: 3 },
    ]
    const res = await PUT(req({ updates }), params('1'))
    expect(res.status).toBe(200)
    expect(mock.calls.some((c) => c.method === 'execute')).toBe(true)
  })

  it('returns 400 and does NOT call RPC when resulting state is invalid', async () => {
    mock.queueResult([{ id: 1 }])
    mock.queueResult(currentRows)

    const badUpdates = [{ id: 2, heatNumber: 1, lane: 1 }] // collides with id=1
    const res = await PUT(req({ updates: badUpdates }), params('1'))
    expect(res.status).toBe(400)
    expect(mock.calls.some((c) => c.method === 'execute')).toBe(false)
  })

  it('empty updates returns 200 and does NOT call RPC', async () => {
    mock.queueResult([{ id: 1 }])
    mock.queueResult(currentRows)
    mock.queueResult([]) // final select

    const res = await PUT(req({ updates: [] }), params('1'))
    expect(res.status).toBe(200)
    expect(mock.calls.some((c) => c.method === 'execute')).toBe(false)
  })

  it('returns 409 when RPC fails with a unique-constraint violation', async () => {
    mock.queueResult([{ id: 1 }])      // Workout
    mock.queueResult(currentRows)       // current assignments

    // Simulate the Postgres 23505 error path by making the RPC execute throw.
    const pgErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })
    mock.db.execute.mockImplementationOnce(() => Promise.reject(pgErr))

    const updates = [
      { id: 3, heatNumber: 1, lane: 2 },
      { id: 2, heatNumber: 2, lane: 1 },
      { id: 4, heatNumber: 2, lane: 2 },
      { id: 5, heatNumber: 2, lane: 3 },
    ]
    const res = await PUT(req({ updates }), params('1'))
    expect(res.status).toBe(409)
  })
})
