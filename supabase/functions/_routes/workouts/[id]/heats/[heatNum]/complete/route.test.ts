import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST, DELETE } from './route'

const params = (id: string, heatNum: string) => ({ params: Promise.resolve({ id, heatNum }) })
const url = 'http://test/api/workouts/1/heats/1/complete?slug=default'

describe('POST /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult([]) // requireWorkoutInCompetition
    const res = await POST(new Request(url, { method: 'POST' }), params('99', '1'))
    expect(res.status).toBe(404)
  })

  it('upserts HeatCompletion, ranks, reports workout completed when all heats done', async () => {
    // Shift order:
    //   1. requireWorkoutInCompetition
    //   2. HeatCompletion insert-onConflictDoNothing
    //   3. getCompletedHeats helper (fires during Promise.all array eval)
    //   4-5. Promise.all iteration: Score select, HeatAssignment distinct heats
    //   6. rankAndPersist insert-onConflictDoUpdate
    //   7. Workout status update
    mock.queueResult([{
      id: 1, status: 'active', scoreType: 'time',
      tiebreakEnabled: false, tiebreakScoreType: 'time',
      partBEnabled: false, partBScoreType: 'time',
    }])
    mock.queueResult(undefined) // HeatCompletion insert
    mock.queueResult([{ heatNumber: 1 }]) // getCompletedHeats
    mock.queueResult([
      { athleteId: 1, workoutId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null },
    ])
    mock.queueResult([{ heatNumber: 1 }]) // HeatAssignment distinct heats
    mock.queueResult(undefined) // rankAndPersist upsert
    mock.queueResult(undefined) // Workout status update

    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completedHeats).toEqual([1])
    expect(body.workoutCompleted).toBe(true)

    // HeatCompletion insert values — idempotent shape.
    const heatInsertValues = mock.calls.find(
      (c) => c.method === 'values' &&
        (c.args[0] as { heatNumber?: number }).heatNumber === 1 &&
        (c.args[0] as { workoutId?: number }).workoutId === 1,
    )
    expect(heatInsertValues).toBeTruthy()
    // onConflictDoNothing in the chain for idempotence.
    expect(mock.calls.some((c) => c.method === 'onConflictDoNothing')).toBe(true)
    // Workout status set → 'completed'.
    const statusSet = mock.calls.find(
      (c) => c.method === 'set' && (c.args[0] as { status?: string }).status === 'completed',
    )
    expect(statusSet).toBeTruthy()
  })
})

describe('DELETE /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('removes HeatCompletion row, clears points, resets workout if was completed', async () => {
    // Query order for DELETE:
    //   1. requireWorkoutInCompetition
    //   2. HeatCompletion delete
    //   3. HeatAssignment select (athletes in this heat)
    //   4. Score points clear
    //   5. Workout status revert
    //   6. getCompletedHeats
    mock.queueResult([{ status: 'completed' }])
    mock.queueResult(undefined) // HeatCompletion delete
    mock.queueResult([{ athleteId: 5 }, { athleteId: 6 }]) // HeatAssignment select
    mock.queueResult(undefined) // Score points clear
    mock.queueResult(undefined) // Workout status revert
    mock.queueResult([{ heatNumber: 2 }]) // getCompletedHeats

    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completedHeats).toEqual([2])

    // Score update clears points.
    const pointsClear = mock.calls.find(
      (c) => c.method === 'set' && (c.args[0] as { points?: number | null }).points === null,
    )
    expect(pointsClear).toBeTruthy()
    // Workout status reverted to 'active'.
    const statusRevert = mock.calls.find(
      (c) => c.method === 'set' && (c.args[0] as { status?: string }).status === 'active',
    )
    expect(statusRevert).toBeTruthy()
  })
})
