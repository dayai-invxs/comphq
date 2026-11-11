import { beforeEach, describe, it, expect, vi } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'

const { rankCompletedHeats, getCompletedHeats } = vi.hoisted(() => ({
  rankCompletedHeats: vi.fn(),
  getCompletedHeats: vi.fn(),
}))
vi.mock('@/lib/heatRanking', () => ({ rankCompletedHeats }))
vi.mock('@/lib/heatCompletion', () => ({ getCompletedHeats }))

import { POST, DELETE } from './route'

const params = (id: string, heatNum: string) => ({ params: Promise.resolve({ id, heatNum }) })
const url = 'http://test/api/workouts/1/heats/1/complete?slug=default'
const WORKOUT = {
  id: 1, status: 'active', scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time',
  partBEnabled: false, partBScoreType: 'time', knockout: false,
}
const setTo = (field: string, value: unknown) =>
  mock.calls.find((c) => c.method === 'set' && (c.args[0] as Record<string, unknown>)[field] === value)

beforeEach(() => {
  rankCompletedHeats.mockReset()
  getCompletedHeats.mockReset()
})

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

  it('records the heat as complete, idempotently, and re-ranks from completed heats', async () => {
    mock.queueResult([WORKOUT])
    mock.queueResult(undefined) // HeatCompletion insert
    rankCompletedHeats.mockResolvedValue({ completedHeats: [1], workoutDone: false, error: null })

    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ completedHeats: [1], workoutCompleted: false })
    expect(mock.calls.some((c) => c.method === 'values'
      && (c.args[0] as { workoutId: number; heatNumber: number }).heatNumber === 1)).toBe(true)
    expect(mock.calls.some((c) => c.method === 'onConflictDoNothing')).toBe(true)
    expect(rankCompletedHeats).toHaveBeenCalledWith(1, expect.objectContaining({ scoreType: 'time' }))
    expect(setTo('status', 'completed')).toBeUndefined()
  })

  it('marks the workout completed once every heat is', async () => {
    mock.queueResult([WORKOUT])
    mock.queueResult(undefined)
    rankCompletedHeats.mockResolvedValue({ completedHeats: [1, 2], workoutDone: true, error: null })
    mock.queueResult(undefined) // Workout status update

    const body = await (await POST(new Request(url, { method: 'POST' }), params('1', '2'))).json()
    expect(body.workoutCompleted).toBe(true)
    expect(setTo('status', 'completed')).toBeTruthy()
  })

  it('leaves a knockout unranked: it is placed when the tournament finishes', async () => {
    mock.queueResult([{ ...WORKOUT, knockout: true }])
    mock.queueResult(undefined)
    getCompletedHeats.mockResolvedValue([1])
    const body = await (await POST(new Request(url, { method: 'POST' }), params('1', '1'))).json()
    expect(body).toEqual({ completedHeats: [1], workoutCompleted: false })
    expect(rankCompletedHeats).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('reopens the heat, reopens a completed workout, and re-ranks from what is still complete', async () => {
    mock.queueResult([{ ...WORKOUT, status: 'completed' }])
    mock.queueResult(undefined) // HeatCompletion delete
    mock.queueResult(undefined) // Workout status revert
    rankCompletedHeats.mockResolvedValue({ completedHeats: [2], workoutDone: false, error: null })

    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ completedHeats: [2] })
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(true)
    expect(setTo('status', 'active')).toBeTruthy()
    expect(rankCompletedHeats).toHaveBeenCalledWith(1, expect.objectContaining({ scoreType: 'time' }))
  })
})
