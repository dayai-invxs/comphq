import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: string) =>
  new Request('http://test/api/athletes/1/withdraw?slug=default', { method })

const wk = (over: Record<string, unknown> = {}) => ({
  id: 10, scoreType: 'time', tiebreakEnabled: false, tiebreakScoreType: 'time',
  partBEnabled: false, partBScoreType: 'reps', status: 'draft', ...over,
})

describe('POST /api/athletes/[id]/withdraw', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(req('POST'), params('1'))).status).toBe(401)
  })

  it('404s when the athlete is not in this competition', async () => {
    mock.queueResults([])
    const res = await POST(req('POST'), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Athlete not found')
  })

  // Withdrawing twice is a no-op, not an error, and writes nothing.
  it('short-circuits when the athlete is already withdrawn', async () => {
    mock.queueResults([{ id: 1, withdrawn: true }])
    const res = await POST(req('POST'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ withdrawn: true })
    expect(mock.calls.some(c => c.method === 'update')).toBe(false)
  })

  it('flags the athlete and stops when the competition has no workouts', async () => {
    mock.queueResults([{ id: 1, withdrawn: false }], [], [])
    const res = await POST(req('POST'), params('1'))
    expect(res.status).toBe(200)
    expect(mock.calls.find(c => c.method === 'set')!.args[0]).toEqual({ withdrawn: true })
    expect(mock.calls.some(c => c.method === 'insert')).toBe(false)
  })

  it('inserts a zero score for every workout the athlete has not scored', async () => {
    mock.queueResults(
      [{ id: 1, withdrawn: false }],
      [],
      [wk({ id: 10 }), wk({ id: 11 })],
      [],
      [],
    )
    await POST(req('POST'), params('1'))

    const values = mock.calls.find(c => c.method === 'values')!.args[0] as Record<string, unknown>[]
    expect(values).toEqual([
      { athleteId: 1, workoutId: 10, rawScore: 0, tiebreakRawScore: null, partBRawScore: null, points: null, partBPoints: null },
      { athleteId: 1, workoutId: 11, rawScore: 0, tiebreakRawScore: null, partBRawScore: null, points: null, partBPoints: null },
    ])
  })

  // An existing score is never overwritten — a withdrawal after scoring keeps
  // the result the athlete actually posted.
  it('skips workouts the athlete has already scored', async () => {
    mock.queueResults(
      [{ id: 1, withdrawn: false }],
      [],
      [wk({ id: 10 }), wk({ id: 11 })],
      [{ workoutId: 10 }],
      [],
    )
    await POST(req('POST'), params('1'))

    const values = mock.calls.find(c => c.method === 'values')!.args[0] as Record<string, unknown>[]
    expect(values.map(v => v.workoutId)).toEqual([11])
  })

  it('writes no scores at all when every workout is already scored', async () => {
    mock.queueResults(
      [{ id: 1, withdrawn: false }],
      [],
      [wk({ id: 10 })],
      [{ workoutId: 10 }],
    )
    const res = await POST(req('POST'), params('1'))
    expect(res.status).toBe(200)
    expect(mock.calls.some(c => c.method === 'insert')).toBe(false)
  })

  // Zero rows mirror the workout's shape: a tiebreak column only gets a 0 when
  // the workout has a tiebreak, and likewise for Part B.
  it('zeroes the tiebreak and Part B columns only where the workout uses them', async () => {
    mock.queueResults(
      [{ id: 1, withdrawn: false }],
      [],
      [wk({ id: 10, tiebreakEnabled: true, partBEnabled: true })],
      [],
      [],
    )
    await POST(req('POST'), params('1'))

    const values = mock.calls.find(c => c.method === 'values')!.args[0] as Record<string, unknown>[]
    expect(values[0]).toMatchObject({ rawScore: 0, tiebreakRawScore: 0, partBRawScore: 0 })
  })

  it('recalculates only the completed workouts', async () => {
    mock.queueResults(
      [{ id: 1, withdrawn: false }],
      [],
      [wk({ id: 10, status: 'completed' }), wk({ id: 11, status: 'draft' })],
      [],
      [],
      [{ athleteId: 1, workoutId: 10, rawScore: 0, tiebreakRawScore: null, partBRawScore: null, divisionId: 3 }],
      [],
    )
    const res = await POST(req('POST'), params('1'))
    expect(res.status).toBe(200)

    // Two inserts: the zero-score batch, then rankAndPersist's upsert for the
    // one completed workout.
    expect(mock.calls.filter(c => c.method === 'insert')).toHaveLength(2)
  })

  // A completed workout that turns out to have no scores at all is skipped
  // rather than ranked.
  it('skips the recalculation when a completed workout has no scores', async () => {
    mock.queueResults(
      [{ id: 1, withdrawn: false }],
      [],
      [wk({ id: 10, status: 'completed' })],
      [],
      [],
      [],
    )
    await POST(req('POST'), params('1'))
    expect(mock.calls.filter(c => c.method === 'insert')).toHaveLength(1)
  })
})

describe('DELETE /api/athletes/[id]/withdraw', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(req('DELETE'), params('1'))).status).toBe(401)
  })

  it('404s when the athlete is not in this competition', async () => {
    mock.queueResults([])
    expect((await DELETE(req('DELETE'), params('1'))).status).toBe(404)
  })

  // Un-withdrawing clears the flag only. The zero scores inserted on withdrawal
  // stay, and no workout is re-ranked — the athlete keeps 0s until rescored.
  it('clears the flag and leaves the inserted zero scores in place', async () => {
    mock.queueResults([{ id: 1, withdrawn: true }], [])
    const res = await DELETE(req('DELETE'), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ withdrawn: false })
    expect(mock.calls.find(c => c.method === 'set')!.args[0]).toEqual({ withdrawn: false })
    expect(mock.calls.some(c => c.method === 'delete')).toBe(false)
    expect(mock.calls.some(c => c.method === 'insert')).toBe(false)
  })

  it('is idempotent for an athlete who is not withdrawn', async () => {
    mock.queueResults([{ id: 1, withdrawn: false }], [])
    expect((await DELETE(req('DELETE'), params('1'))).status).toBe(200)
  })
})
