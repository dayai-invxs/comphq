import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (slug = 'default') => new Request(`http://test/api/workouts/1/reset?slug=${slug}`, { method: 'POST' })

describe('POST /api/workouts/[id]/reset', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(req(), params('1'))).status).toBe(401)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResults([])
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Workout not found')
  })

  it('clears scores and heat completions, then returns the workout to draft', async () => {
    mock.queueResults([{ id: 1, competitionId: 1 }], [], [], [])
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(mock.calls.filter(c => c.method === 'delete')).toHaveLength(2)
    expect(mock.calls.find(c => c.method === 'set')!.args[0]).toEqual({ status: 'draft' })
  })

  // Heat assignments survive a reset — the lane draw is kept, only results go.
  it('leaves heat assignments in place', async () => {
    mock.queueResults([{ id: 1, competitionId: 1 }], [], [], [])
    await POST(req(), params('1'))
    expect(mock.calls.filter(c => c.method === 'delete')).toHaveLength(2)
  })
})
