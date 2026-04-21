import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { POST, DELETE } from './route'

const params = (id: string, heatNum: string) => ({ params: Promise.resolve({ id, heatNum }) })
const url = 'http://test/api/workouts/1/heats/1/complete?slug=default'

describe('POST /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await POST(new Request(url, { method: 'POST' }), params('99', '1'))
    expect(res.status).toBe(404)
  })

  it('marks heat complete, ranks, updates Score, marks workout done when all heats finished', async () => {
    mock.queueResult({
      data: {
        id: 1, scoreType: 'time', tiebreakEnabled: false, partBEnabled: false,
        partBScoreType: 'time', status: 'active', completedHeats: '[]',
      },
      error: null,
    })
    mock.queueResult({ data: [{ id: 1, athleteId: 1, rawScore: 100 }], error: null })
    mock.queueResult({ data: [{ heatNumber: 1 }], error: null })
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: null, error: null })

    const res = await POST(new Request(url, { method: 'POST' }), params('1', '1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completedHeats).toEqual([1])
    expect(body.workoutCompleted).toBe(true)

    const workoutUpdate = mock.calls.at(-1)!
    expect(workoutUpdate.table).toBe('Workout')
    const patch = workoutUpdate.ops.find(o => o.op === 'update')!.args[0] as Record<string, unknown>
    expect(patch.status).toBe('completed')
    expect(patch.completedHeats).toBe('[1]')
  })
})

describe('DELETE /api/workouts/[id]/heats/[heatNum]/complete', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(401)
  })

  it('uncompletes heat, clears points for its athletes, resets workout if was completed', async () => {
    mock.queueResult({
      data: { id: 1, status: 'completed', completedHeats: '[1,2]' },
      error: null,
    })
    mock.queueResult({ data: [{ athleteId: 5 }, { athleteId: 6 }], error: null })
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: null, error: null })

    const res = await DELETE(new Request(url), params('1', '1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completedHeats).toEqual([2])

    const scoreUpdate = mock.calls.find(c => c.table === 'Score' && c.ops.find(o => o.op === 'update'))!
    expect(scoreUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({ points: null })
    expect(scoreUpdate.ops.find(o => o.op === 'in')?.args).toEqual(['athleteId', [5, 6]])

    const workoutUpdate = mock.calls.at(-1)!
    const patch = workoutUpdate.ops.find(o => o.op === 'update')!.args[0] as Record<string, unknown>
    expect(patch.status).toBe('active')
  })
})
