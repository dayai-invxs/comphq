import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { DELETE } from './route'

const params = (id: string, heatNum: string) => ({ params: Promise.resolve({ id, heatNum }) })
const req = () => new Request('http://test/api/workouts/1/heats/2?slug=default', { method: 'DELETE' })

describe('DELETE /api/workouts/[id]/heats/[heatNum]', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await DELETE(req(), params('1', '2'))
    expect(res.status).toBe(401)
  })

  it('rejects a heat number that is not a positive integer', async () => {
    const res = await DELETE(req(), params('1', 'abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the workout is not in the competition', async () => {
    mock.queueResult([])
    const res = await DELETE(req(), params('99', '2'))
    expect(res.status).toBe(404)
  })

  it('refuses with 409 while the workout has scores, writing nothing', async () => {
    mock.queueResult([{ id: 1 }])
    mock.queueResult([{ id: 7 }]) // a score exists
    const res = await DELETE(req(), params('1', '2'))
    expect(res.status).toBe(409)
    expect(await res.text()).toMatch(/Clear all scores/)
    expect(mock.calls.some((c) => c.method === 'transaction')).toBe(false)
    expect(mock.calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('deletes the heat from assignments, judges and completions and leaves later heats alone', async () => {
    mock.queueResult([{ id: 1 }])
    mock.queueResult([]) // no scores
    const res = await DELETE(req(), params('1', '2'))
    expect(res.status).toBe(200)
    expect(mock.calls.some((c) => c.method === 'transaction')).toBe(true)
    expect(mock.calls.filter((c) => c.method === 'delete')).toHaveLength(3)
    // No renumbering and no start-time rewrite: the gap stays.
    expect(mock.calls.some((c) => c.method === 'update')).toBe(false)
  })
})
