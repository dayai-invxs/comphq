import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

function jsonReq(csv: string, slug = 'default') {
  return new Request('http://test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv, slug }),
  })
}

describe('POST /api/import/heats', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(jsonReq('1,1,1,Alice'))
    expect(res.status).toBe(401)
  })

  it('rejects empty csv', async () => {
    const res = await POST(jsonReq(''))
    expect(res.status).toBe(400)
  })

  it('reports errors for missing workouts and athletes but imports valid rows', async () => {
    // Promise.all: workouts lookup, athletes lookup. Then the RPC via db.execute.
    mock.queueResult([{ id: 10, number: 1 }])
    mock.queueResult([{ id: 100, name: 'Alice' }])
    mock.queueResult(undefined) // RPC execute

    const csv = 'workout,heat,lane,athlete\n1,1,1,Alice\n1,1,2,Unknown\n2,1,1,Alice'
    const res = await POST(jsonReq(csv))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.imported).toBe(1)
    expect(body.workoutsAffected).toEqual([1])
    expect(body.errors).toEqual([
      { line: 3, message: 'Athlete not found: "Unknown"' },
      { line: 4, message: 'Workout #2 not found' },
    ])
    // The RPC was invoked via db.execute.
    expect(mock.calls.some((c) => c.method === 'execute')).toBe(true)
  })

  it('rejects malformed numeric cells', async () => {
    mock.queueResult([])
    mock.queueResult([])
    const res = await POST(jsonReq('x,y,z,Alice'))
    const body = await res.json()
    expect(body.imported).toBe(0)
    expect(body.errors[0].message).toMatch(/Non-numeric/)
  })
})
