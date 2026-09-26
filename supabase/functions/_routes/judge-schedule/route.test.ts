import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (slug = 'default') => new Request(`http://test/api/judge-schedule?slug=${slug}`)

const START = '2026-01-01T10:00:00.000Z'
const startMs = Date.parse(START)

const wk = (over: Record<string, unknown> = {}) => ({
  id: 1, number: 1, name: 'WOD 1', startTime: START,
  heatIntervalSecs: 600, timeBetweenHeatsSecs: 0, heatStartOverrides: null,
  callTimeSecs: 60, walkoutTimeSecs: null, locationName: null, ...over,
})

describe('GET /api/judge-schedule', () => {
  // This route reads the competition without a session gate — the judge board
  // is a public display. Locked here so the port keeps it public.
  it('serves an anonymous caller', async () => {
    setAuthUser(null)
    mock.queueResults([], [])
    expect((await GET(req())).status).toBe(200)
  })

  it('404s when the slug does not resolve', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Competition not found')
  })

  it('returns empty lists when the competition has no volunteers', async () => {
    mock.queueResults([], [])
    expect(await (await GET(req())).json()).toEqual({ judges: [], workouts: [] })
  })

  // The judges header counts only volunteers whose role name is "judge",
  // matched case-insensitively, and is sorted by name.
  it('lists only judge-role volunteers, sorted by name', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Zoe' }, { id: 2, name: 'Alex' }, { id: 3, name: 'Sam' }],
      [
        { id: 1, name: 'Zoe', roleName: 'JUDGE' },
        { id: 2, name: 'Alex', roleName: 'judge' },
        { id: 3, name: 'Sam', roleName: 'Scorer' },
      ],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.judges).toEqual([{ id: 2, name: 'Alex' }, { id: 1, name: 'Zoe' }])
    expect(body.workouts).toEqual([])
  })

  it('returns the judges but no workouts when the competition has none', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.judges).toEqual([{ id: 1, name: 'Alex' }])
    expect(body.workouts).toEqual([])
  })

  it('groups assignments by heat and orders them by lane', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }, { id: 2, name: 'Zoe' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }, { id: 2, name: 'Zoe', roleName: 'Judge' }],
      [wk()],
      [
        { workoutId: 1, volunteerId: 2, heatNumber: 1, lane: 2 },
        { workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1 },
      ],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }, { workoutId: 1, heatNumber: 1, lane: 2 }],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.workouts).toHaveLength(1)
    expect(body.workouts[0].heats[0].assignments).toEqual([
      { judgeId: 1, judgeName: 'Alex', lane: 1 },
      { judgeId: 2, judgeName: 'Zoe', lane: 2 },
    ])
  })

  // Judge names come from every volunteer, not just judge-role ones, so a
  // volunteer assigned to a lane without the judge role still resolves. An
  // unknown id falls back to '?'.
  it('falls back to a question mark for an unknown volunteer id', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk()],
      [{ workoutId: 1, volunteerId: 99, heatNumber: 1, lane: 1 }],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.workouts[0].heats[0].assignments[0]).toEqual({ judgeId: 99, judgeName: '?', lane: 1 })
  })

  // A completed heat drops out of the board entirely, taking its assignments
  // with it.
  it('hides heats that are already complete', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk()],
      [
        { workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1 },
        { workoutId: 1, volunteerId: 1, heatNumber: 2, lane: 1 },
      ],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }, { workoutId: 1, heatNumber: 2, lane: 1 }],
      [{ workoutId: 1, heatNumber: 1 }],
    )
    const body = await (await GET(req())).json()
    expect(body.workouts[0].heats.map((h: { heatNumber: number }) => h.heatNumber)).toEqual([2])
  })

  // A judge assigned to a lane no athlete occupies is dropped: the board shows
  // lanes that will actually run.
  it('drops an assignment on a lane with no athlete in it', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk()],
      [
        { workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1 },
        { workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 8 },
      ],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.workouts[0].heats[0].assignments.map((a: { lane: number }) => a.lane)).toEqual([1])
  })

  // A workout with no surviving assignments is filtered out of the response.
  it('omits a workout whose heats have no assignments left', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk({ id: 1 }), wk({ id: 2, number: 2, name: 'WOD 2' })],
      [{ workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1 }],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }, { workoutId: 2, heatNumber: 1, lane: 1 }],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.workouts.map((w: { id: number }) => w.id)).toEqual([1])
  })

  it('computes heat and walkout times from the workout schedule', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk({ walkoutTimeSecs: 120, locationName: 'Floor A' })],
      [{ workoutId: 1, volunteerId: 1, heatNumber: 2, lane: 1 }],
      [{ workoutId: 1, heatNumber: 2, lane: 1 }],
      [],
    )
    const body = await (await GET(req())).json()
    const heat = body.workouts[0].heats[0]
    expect(heat.heatTimeMs).toBe(startMs + 600_000)
    expect(heat.walkoutTimeMs).toBe(startMs + 600_000 - 120_000)
    expect(body.workouts[0].locationName).toBe('Floor A')
  })

  // With no walkout offset configured, walkoutTimeMs equals the heat time
  // rather than being null.
  it('uses the heat time as the walkout time when no offset is set', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk()],
      [{ workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1 }],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }],
      [],
    )
    const heat = (await (await GET(req())).json()).workouts[0].heats[0]
    expect(heat.heatTimeMs).toBe(startMs)
    expect(heat.walkoutTimeMs).toBe(startMs)
  })

  it('reports null times for a workout with no start time', async () => {
    mock.queueResults(
      [{ id: 1, name: 'Alex' }],
      [{ id: 1, name: 'Alex', roleName: 'Judge' }],
      [wk({ startTime: null, walkoutTimeSecs: 120 })],
      [{ workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1 }],
      [{ workoutId: 1, heatNumber: 1, lane: 1 }],
      [],
    )
    const heat = (await (await GET(req())).json()).workouts[0].heats[0]
    expect(heat.heatTimeMs).toBeNull()
    expect(heat.walkoutTimeMs).toBeNull()
  })

  it('returns 500 when a query throws', async () => {
    const boom = { then: () => { throw new Error('db down') } }
    mock.queueResult(boom)
    const res = await GET(req())
    expect(res.status).toBe(500)
  })
})
