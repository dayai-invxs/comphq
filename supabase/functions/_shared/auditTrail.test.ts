import { describe, it, expect, vi } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { createRouter } from './router'
import { getRequestContext } from './request-context'

// The router writes the trail: after a change a signed-in person made, and
// only then. A route says who the caller is by checking access, which is
// what sets the actor; these stand-ins set it the same way.

const signedIn = (competitionId: number | null = 7) => {
  const ctx = getRequestContext()!
  ctx.actor = { userId: 'u-1', email: 'sam@example.test', competitionId }
}

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://edge.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const inserted = () => mock.calls.filter((c) => c.method === 'values').map((c) => c.args[0] as Record<string, unknown>)

describe('the audit trail', () => {
  it('records who saved a score, where, and what they sent', async () => {
    const router = createRouter('workouts', [{
      method: 'POST',
      pattern: '/workouts/:id/scores',
      handler: async (req) => { signedIn(); await req.json(); return Response.json({ id: 1 }) },
    }])
    const res = await router(call('POST', '/workouts/12/scores?slug=summer', { athleteId: 4, rawScore: 95 }))
    expect(res.status).toBe(200)
    expect(inserted()).toEqual([{
      userId: 'u-1',
      userName: 'sam@example.test',
      competitionId: 7,
      action: 'POST /workouts/:id/scores',
      resourceType: 'workouts',
      resourceId: '12',
      diff: { params: { id: '12' }, body: { athleteId: 4, rawScore: 95 } },
    }])
  })

  it('records nothing for a change that was refused or failed', async () => {
    const router = createRouter('workouts', [{
      method: 'DELETE',
      pattern: '/workouts/:id',
      handler: () => { signedIn(); return new Response('Workout not found', { status: 404 }) },
    }])
    await router(call('DELETE', '/workouts/12'))
    expect(inserted()).toEqual([])
  })

  it('records nothing for a reader, or a caller nobody signed in as', async () => {
    const router = createRouter('workouts', [
      { method: 'GET', pattern: '/workouts', handler: () => { signedIn(); return Response.json([]) } },
      { method: 'POST', pattern: '/workouts', handler: () => Response.json({}) },
    ])
    await router(call('GET', '/workouts'))
    await router(call('POST', '/workouts', { name: 'Fran' }))
    expect(inserted()).toEqual([])
  })

  it('never keeps a password', async () => {
    const router = createRouter('users', [{
      method: 'POST',
      pattern: '/users',
      handler: () => { signedIn(null); return Response.json({}, { status: 201 }) },
    }])
    await router(call('POST', '/users', { email: 'a@b.test', password: 'hunter22', nested: { newPassword: 'x' } }))
    expect(inserted()[0].diff).toEqual({ body: { email: 'a@b.test', password: '[redacted]', nested: { newPassword: '[redacted]' } } })
    expect(inserted()[0].competitionId).toBeNull()
  })

  // Ticks come many a minute and the next tick undoes them.
  it('leaves corral and walk-out ticks off the trail', async () => {
    const router = createRouter('checks', [{
      method: 'PATCH', pattern: '/checks', handler: () => { signedIn(); return new Response(null, { status: 204 }) },
    }])
    await router(call('PATCH', '/checks', { slug: 'summer', type: 'equipment', entry: { key: 'a', value: true } }))
    expect(inserted()).toEqual([])
  })

  it('does not keep a body too large to be useful', async () => {
    const router = createRouter('import', [{
      method: 'POST', pattern: '/import/heats', handler: () => { signedIn(); return Response.json({}) },
    }])
    await router(call('POST', '/import/heats', { csv: 'x'.repeat(25_000) }))
    expect(inserted()[0].diff).toEqual({ body: expect.stringMatching(/^\[\d+ characters, not kept\]$/) })
  })

  // Logging must never cost the change it records.
  it('answers the change even when the trail cannot be written', async () => {
    mock.db.insert.mockImplementationOnce(() => { throw new Error('db down') })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createRouter('workouts', [{
      method: 'POST', pattern: '/workouts', handler: () => { signedIn(); return Response.json({ id: 3 }, { status: 201 }) },
    }])
    const res = await router(call('POST', '/workouts', { name: 'Fran' }))
    expect(res.status).toBe(201)
    expect(quiet).toHaveBeenCalledWith('[audit] failed to log:', 'POST /workouts', 'db down')
    quiet.mockRestore()
  })
})
