import { describe, it, expect } from 'vitest'
import { supabaseMock as mock } from '@/test/setup'
import { GET } from './route'

describe('GET /api/leaderboard', () => {
  it('returns empty entries when no data', async () => {
    mock.queueResults(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    )
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.workouts).toEqual([])
    expect(body.entries).toEqual([])
  })

  it('sums points across completed workouts and sorts by total', async () => {
    const workouts = [
      { id: 10, number: 1, name: 'A', scoreType: 'time', status: 'completed' },
      { id: 11, number: 2, name: 'B', scoreType: 'time', status: 'completed' },
    ]
    const athletes = [
      { id: 1, name: 'Alice', division: null },
      { id: 2, name: 'Bob', division: { id: 1, name: 'Rx', order: 0 } },
    ]
    const scores = [
      { athleteId: 1, workoutId: 10, points: 1, rawScore: 100 },
      { athleteId: 1, workoutId: 11, points: 1, rawScore: 90 },
      { athleteId: 2, workoutId: 10, points: 2, rawScore: 110 },
      { athleteId: 2, workoutId: 11, points: 2, rawScore: 95 },
    ]

    mock.queueResults(
      { data: workouts, error: null },
      { data: athletes, error: null },
      { data: scores, error: null },
    )

    const res = await GET()
    const body = await res.json()
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].athleteName).toBe('Alice')
    expect(body.entries[0].totalPoints).toBe(2)
    expect(body.entries[1].athleteName).toBe('Bob')
    expect(body.entries[1].totalPoints).toBe(4)
  })
})
