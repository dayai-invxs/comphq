import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (slug = 'default') => new Request(`http://test/api/export/zip?slug=${slug}`)

describe('GET /api/export/zip', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns a valid ZIP with per-table CSVs + manifest', async () => {
    // Query order: workouts, then Promise.all of athletes, divisions,
    // assignments⨝athletes, scores.
    mock.queueResults(
      [{
        id: 10, number: 1, name: 'Fran', scoreType: 'time', status: 'completed',
        lanes: 3, halfWeight: false,
      }],
      [{ id: 1, name: 'Alice', bibNumber: '101', divisionId: 1 }],
      [{ id: 1, name: 'Rx', order: 0 }],
      [{
        workoutId: 10, heatNumber: 1, lane: 1,
        athleteId: 1, athleteName: 'Alice', bibNumber: '101', divisionId: 1,
      }],
      [{
        athleteId: 1, workoutId: 10, rawScore: 225123,
        tiebreakRawScore: null, points: 1, partBRawScore: null, partBPoints: null,
      }],
    )

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/\.zip"$/)

    const buf = new Uint8Array(await res.arrayBuffer())
    const files = unzipSync(buf)
    const names = Object.keys(files).sort()
    expect(names).toEqual([
      'athletes.csv', 'divisions.csv', 'heat_assignments.csv',
      'manifest.json', 'scores.csv', 'workouts.csv',
    ])

    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.counts).toEqual({ athletes: 1, divisions: 1, workouts: 1, assignments: 1, scores: 1 })
    expect(manifest.version).toBe(1)

    expect(strFromU8(files['athletes.csv'])).toContain('Alice')
    expect(strFromU8(files['workouts.csv'])).toContain('Fran')
    expect(strFromU8(files['scores.csv'])).toContain('225123')
  })
})
