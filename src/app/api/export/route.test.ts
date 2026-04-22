import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (url = 'http://test/api/export?slug=default') => new Request(url)

describe('GET /api/export', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 404 when slug is missing', async () => {
    const res = await GET(new Request('http://test/api/export'))
    expect(res.status).toBe(404)
  })

  it('returns CSV with the expected content-type and filename header', async () => {
    // Four parallel queries after the initial Workout fetch → queue 5 results.
    mock.queueResult({ data: [{ id: 10, number: 1, name: 'WOD 1', scoreType: 'time', status: 'completed', lanes: 3, halfWeight: false }], error: null })
    mock.queueResult({ data: [{ id: 1, name: 'Alice', bibNumber: '7', divisionId: 1 }], error: null })
    mock.queueResult({ data: [{ id: 1, name: 'Rx', order: 0 }], error: null })
    mock.queueResult({ data: [{ workoutId: 10, heatNumber: 1, lane: 1, athlete: { id: 1, name: 'Alice', bibNumber: '7', divisionId: 1 } }], error: null })
    mock.queueResult({ data: [{ athleteId: 1, workoutId: 10, rawScore: 210, points: 1, partBRawScore: null, partBPoints: null }], error: null })

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="default-export-\d{4}-\d{2}-\d{2}\.csv"/)

    const body = await res.text()
    // Spot-check the three main sections + rank row.
    expect(body).toMatch(/WORKOUTS/)
    expect(body).toMatch(/HEAT ASSIGNMENTS/)
    expect(body).toMatch(/OVERALL LEADERBOARD/)
    expect(body).toMatch(/Alice/)
  })
})
