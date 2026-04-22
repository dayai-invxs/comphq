import { describe, it, expect, vi } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { getServerSession } from 'next-auth'
import { PUT } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: Record<string, unknown>) =>
  new Request('http://test/api/workouts/1/heat-times?slug=default', {
    method: 'PUT',
    body: JSON.stringify(body),
  })

describe('PUT /api/workouts/[id]/heat-times', () => {
  it('rejects unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null)
    const res = await PUT(req({ heatNumber: 1, isoTime: '2026-01-01T10:00:00Z' }), params('1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when workout not in caller competition', async () => {
    mock.queueResult({ data: null, error: null }) // requireWorkoutInCompetition
    const res = await PUT(req({ heatNumber: 1, isoTime: '2026-01-01T10:00:00Z' }), params('99'))
    expect(res.status).toBe(404)
  })

  it('sets override and clears all later overrides', async () => {
    // Column is jsonb now — Supabase returns the parsed object, not a string.
    mock.queueResult({ data: { heatStartOverrides: { '1': '2026-01-01T10:00:00Z', '2': '2026-01-01T10:10:00Z', '5': '2026-01-01T10:40:00Z' } }, error: null })
    mock.queueResult({ data: { id: 1, heatStartOverrides: {} }, error: null })

    const res = await PUT(req({ heatNumber: 3, isoTime: '2026-01-01T10:20:00Z' }), params('1'))
    expect(res.status).toBe(200)

    const updateCall = mock.calls.find(c => c.ops.find(o => o.op === 'update'))!
    const patch = updateCall.ops.find(o => o.op === 'update')!.args[0] as { heatStartOverrides: Record<string, string> }
    expect(patch.heatStartOverrides).toEqual({
      '1': '2026-01-01T10:00:00Z',
      '2': '2026-01-01T10:10:00Z',
      '3': '2026-01-01T10:20:00Z',
    })
  })
})
