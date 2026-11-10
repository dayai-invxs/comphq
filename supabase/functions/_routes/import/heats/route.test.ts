import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

function jsonReq(csv: string, slug = 'default', mode?: string) {
  return new Request('http://test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv, slug, mode }),
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

  it('refuses an unknown mode', async () => {
    const res = await POST(jsonReq('1,1,1,Alice', 'default', 'wipe'))
    expect(res.status).toBe(400)
  })

  it('previews: names workouts in the file that already have heats, and writes nothing', async () => {
    mock.queueResult([{ id: 10, number: 1, name: 'Fran' }, { id: 11, number: 2, name: 'Grace' }])
    mock.queueResult([{ id: 100, name: 'Alice' }])
    mock.queueResult([{ workoutId: 10, heatNumber: 1 }, { workoutId: 10, heatNumber: 2 }, { workoutId: 10, heatNumber: 2 }])
    mock.queueResult([{ id: 5 }]) // workout 10 has a score

    const body = await (await POST(jsonReq('1,1,1,Alice\n2,1,1,Alice', 'default', 'preview'))).json()
    expect(body).toEqual({ existing: [{ number: 1, name: 'Fran', heats: 2, lanes: 3, scored: true }] })
    expect(mock.calls.some((c) => ['execute', 'insert', 'delete'].includes(c.method))).toBe(false)
  })

  it('adds / updates: keeps lanes not in the file and changes only what it names', async () => {
    mock.queueResult([{ id: 10, number: 1, name: 'Fran' }])
    mock.queueResult([{ id: 100, name: 'Alice' }, { id: 101, name: 'Bob' }])
    mock.queueResult([ // existing lanes
      { id: 1, athleteId: 100, heatNumber: 1, lane: 1, round: null },
      { id: 2, athleteId: 102, heatNumber: 1, lane: 2, round: null },
      { id: 3, athleteId: 103, heatNumber: 2, lane: 1, round: null },
    ])
    mock.queueResult(undefined) // delete
    mock.queueResult(undefined) // insert

    const body = await (await POST(jsonReq('1,1,1,Alice\n1,1,2,Bob', 'default', 'merge'))).json()
    expect(body.imported).toBe(2)
    expect(body.notes).toEqual([{ message: 'Workout #1: 1 existing lane replaced or moved; 1 lane not in the file left as they were; 1 already matched.' }])
    expect(mock.calls.some((c) => c.method === 'execute')).toBe(false)
    expect(mock.calls.find((c) => c.method === 'values')!.args[0]).toEqual([{ workoutId: 10, athleteId: 101, heatNumber: 1, lane: 2, round: null }])
  })

  it('refuses a lane listed twice in one workout', async () => {
    mock.queueResult([{ id: 10, number: 1, name: 'Fran' }])
    mock.queueResult([{ id: 100, name: 'Alice' }, { id: 101, name: 'Bob' }])
    mock.queueResult(undefined)

    const body = await (await POST(jsonReq('1,1,1,Alice\n1,1,1,Bob'))).json()
    expect(body.imported).toBe(1)
    expect(body.errors).toEqual([{ line: 2, message: 'Heat 1 lane 1 is listed more than once in workout #1' }])
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
