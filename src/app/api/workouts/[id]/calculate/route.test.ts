import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = () => new Request('http://test/api/workouts/1/calculate?slug=default', { method: 'POST' })

describe('POST /api/workouts/[id]/calculate', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult({ data: null, error: null }) // requireWorkoutInCompetition
    const res = await POST(req(), params('99'))
    expect(res.status).toBe(404)
  })

  it('ranks scores, updates points, marks workout completed', async () => {
    mock.queueResult({
      data: { id: 1, scoreType: 'time', tiebreakEnabled: false, partBEnabled: false, partBScoreType: 'time' },
      error: null,
    })
    mock.queueResult({
      data: [
        { id: 10, athleteId: 1, rawScore: 100 },
        { id: 11, athleteId: 2, rawScore: 90 },
      ],
      error: null,
    })
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: null, error: null })
    mock.queueResult({ data: null, error: null })

    const res = await POST(req(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Rankings calculated', count: 2 })

    const statusUpdate = mock.calls.at(-1)!
    expect(statusUpdate.table).toBe('Workout')
    expect(statusUpdate.ops.find(o => o.op === 'update')?.args[0]).toEqual({ status: 'completed' })
  })
})
