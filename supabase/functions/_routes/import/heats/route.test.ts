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

  it('places an athlete/team listed in two heats of a workout, with a warning', async () => {
    mock.queueResult([{ id: 10, number: 1 }])
    mock.queueResult([{ id: 100, name: 'Team A' }, { id: 101, name: 'Team B' }])
    mock.queueResult(undefined)

    const csv = 'workout,heat,lane,athlete\n1,1,1,Team A\n1,1,2,Team B\n1,2,1,team a'
    const body = await (await POST(jsonReq(csv))).json()

    expect(body.imported).toBe(3)
    expect(body.errors).toEqual([])
    expect(body.warnings).toEqual([{ message: '"Team A" is in workout #1 2 times (heats 1, 2)' }])
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
