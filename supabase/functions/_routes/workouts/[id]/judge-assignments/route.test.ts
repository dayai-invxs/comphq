import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST, DELETE } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const WORKOUT = [{ id: 1, competitionId: 1, lanes: 8 }]

const getReq = (slug = 'default') => new Request(`http://test/api/workouts/1/judge-assignments?slug=${slug}`)
const postReq = (body: unknown, action?: string) =>
  new Request(`http://test/api/workouts/1/judge-assignments?slug=default${action ? `&action=${action}` : ''}`,
    { method: 'POST', body: JSON.stringify(body) })
const deleteReq = (body?: unknown) =>
  new Request('http://test/api/workouts/1/judge-assignments?slug=default',
    { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

describe('GET /api/workouts/[id]/judge-assignments', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(getReq(), params('1'))).status).toBe(401)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResults([])
    const res = await GET(getReq(), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Workout not found')
  })

  it('returns assignments joined to judge names, ordered by heat then lane', async () => {
    const rows = [{ id: 1, workoutId: 1, volunteerId: 2, heatNumber: 1, lane: 1, judgeName: 'Alex' }]
    mock.queueResults(WORKOUT, rows)
    const res = await GET(getReq(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)
    expect(mock.calls.some(c => c.method === 'innerJoin')).toBe(true)
  })
})

describe('POST /api/workouts/[id]/judge-assignments', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(postReq({ volunteerId: 1, heatNumber: 1, lane: 1 }), params('1'))).status).toBe(401)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResults([])
    expect((await POST(postReq({ volunteerId: 1, heatNumber: 1, lane: 1 }), params('1'))).status).toBe(404)
  })

  it('rejects a lane of zero', async () => {
    mock.queueResults(WORKOUT)
    expect((await POST(postReq({ volunteerId: 1, heatNumber: 1, lane: 0 }), params('1'))).status).toBe(400)
  })

  // A second judge for the same (heat, lane) replaces the first rather than
  // failing on the unique constraint.
  it('upserts a single assignment on (workout, heat, lane)', async () => {
    mock.queueResults(WORKOUT, [{ id: 5, workoutId: 1, volunteerId: 2, heatNumber: 1, lane: 1 }])
    const res = await POST(postReq({ volunteerId: 2, heatNumber: 1, lane: 1 }), params('1'))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 5, workoutId: 1, volunteerId: 2, heatNumber: 1, lane: 1 })
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ workoutId: 1, volunteerId: 2, heatNumber: 1, lane: 1 })
    expect(mock.calls.some(c => c.method === 'onConflictDoUpdate')).toBe(true)
  })

  it('resolves judge names to volunteer ids on import', async () => {
    mock.queueResults(
      WORKOUT,
      [{ id: 7, name: 'Alex' }],
      [],
      [{ id: 1, workoutId: 1, volunteerId: 7, heatNumber: 1, lane: 1, judgeName: 'Alex' }],
    )
    const res = await POST(postReq({ lines: [{ judgeName: 'Alex', heatNumber: 1, lane: 1 }] }, 'import'), params('1'))
    expect(res.status).toBe(201)
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual([{ workoutId: 1, volunteerId: 7, heatNumber: 1, lane: 1 }])
  })

  // Name matching is case- and whitespace-insensitive on both sides.
  it('matches judge names ignoring case and surrounding whitespace', async () => {
    mock.queueResults(
      WORKOUT,
      [{ id: 7, name: '  ALEX ' }],
      [],
      [],
    )
    const res = await POST(postReq({ lines: [{ judgeName: 'alex', heatNumber: 1, lane: 1 }] }, 'import'), params('1'))
    expect(res.status).toBe(201)
  })

  // One unknown name fails the whole import — it is all or nothing.
  it('422s the whole import when any judge name is unknown', async () => {
    mock.queueResults(WORKOUT, [{ id: 7, name: 'Alex' }])
    const res = await POST(postReq({
      lines: [
        { judgeName: 'Alex', heatNumber: 1, lane: 1 },
        { judgeName: 'Nobody', heatNumber: 1, lane: 2 },
      ],
    }, 'import'), params('1'))
    expect(res.status).toBe(422)
    expect(await res.text()).toBe('Judge not found: "Nobody"')
    expect(mock.calls.some(c => c.method === 'insert')).toBe(false)
  })

  // Import inserts with onConflictDoNothing, so a slot that already has a judge
  // keeps the existing one instead of being overwritten.
  it('leaves an occupied slot alone on import', async () => {
    mock.queueResults(WORKOUT, [{ id: 7, name: 'Alex' }], [], [])
    await POST(postReq({ lines: [{ judgeName: 'Alex', heatNumber: 1, lane: 1 }] }, 'import'), params('1'))
    expect(mock.calls.some(c => c.method === 'onConflictDoNothing')).toBe(true)
  })

  it('rejects an import with no lines', async () => {
    mock.queueResults(WORKOUT)
    expect((await POST(postReq({ lines: [] }, 'import'), params('1'))).status).toBe(400)
  })
})

describe('DELETE /api/workouts/[id]/judge-assignments', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await DELETE(deleteReq({ ids: [1] }), params('1'))).status).toBe(401)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResults([])
    expect((await DELETE(deleteReq({ ids: [1] }), params('1'))).status).toBe(404)
  })

  it('deletes the listed ids and reports the requested count', async () => {
    mock.queueResults(WORKOUT, [])
    const res = await DELETE(deleteReq({ ids: [1, 2] }), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 2 })
  })

  // A body that fails validation is treated as "no body" and clears every
  // assignment for the workout. A typo in the payload wipes the board.
  it('clears the whole workout when the body is absent', async () => {
    mock.queueResults(WORKOUT, [])
    const res = await DELETE(deleteReq(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 'all' })
  })

  it('clears the whole workout when the body fails validation', async () => {
    mock.queueResults(WORKOUT, [])
    const res = await DELETE(deleteReq({ ids: 'nope' }), params('1'))
    expect(await res.json()).toEqual({ deleted: 'all' })
  })

  // The id-scoped delete is not scoped to the workout, so an id from another
  // workout would still be removed.
  it('reports the requested count rather than the rows actually removed', async () => {
    mock.queueResults(WORKOUT, [])
    const res = await DELETE(deleteReq({ ids: [999] }), params('1'))
    expect(await res.json()).toEqual({ deleted: 1 })
  })
})
