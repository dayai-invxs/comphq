import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const req = (body: unknown) =>
  new Request('http://test/api/import/judge-assignments', { method: 'POST', body: JSON.stringify(body) })

const csvReq = (csv: string) => req({ slug: 'default', csv })

const WORKOUTS = [{ id: 10, number: 1 }, { id: 11, number: 2 }]
const VOLUNTEERS = [{ id: 7, name: 'Alex' }, { id: 8, name: 'Zoe' }]

// Queue order: workouts, volunteers, then a delete and an insert per row
// inside the transaction.
const queue = (rows: number) =>
  mock.queueResults(WORKOUTS, VOLUNTEERS, ...Array.from({ length: rows * 2 }, () => []))

describe('POST /api/import/judge-assignments', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await POST(csvReq('1,1,1,Alex'))
    expect(res.status).toBe(401)
    expect((await res.json()).errors[0].message).toBe('Unauthorized')
  })

  // A schema failure is reported in the ImportResult envelope rather than as a
  // bare 400 body, so the client parses one shape either way.
  it('reports a validation failure inside the result envelope', async () => {
    const res = await POST(req({ slug: 'default' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.imported).toBe(0)
    expect(body.errors[0].line).toBe(0)
    expect(body.errors[0].message).toMatch(/Validation failed/)
  })

  it('imports rows keyed on workout number, not workout id', async () => {
    queue(1)
    const res = await POST(csvReq('2,3,4,Alex'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1, workoutsAffected: [2], errors: [] })
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ workoutId: 11, volunteerId: 7, heatNumber: 3, lane: 4 })
  })

  it('skips a header row that mentions workout', async () => {
    queue(1)
    const res = await POST(csvReq('workout,heat,lane,judge\n1,1,1,Alex'))
    expect(await res.json()).toEqual({ imported: 1, workoutsAffected: [1], errors: [] })
  })

  it('handles CRLF line endings and blank lines', async () => {
    queue(2)
    const res = await POST(csvReq('1,1,1,Alex\r\n\r\n1,1,2,Zoe\r\n'))
    expect((await res.json()).imported).toBe(2)
  })

  // Any volunteer matches, whatever role they hold — unlike the per-workout
  // import route, this one does not require the judge role.
  it('matches any volunteer regardless of role, ignoring case and whitespace', async () => {
    queue(1)
    const res = await POST(csvReq('1,1,1,  aLeX  '))
    expect((await res.json()).imported).toBe(1)
  })

  // Trailing cells are rejoined into the judge name, but each cell is trimmed
  // first, so the space after the comma is lost.
  it('rejoins trailing cells into the judge name without the original spacing', async () => {
    mock.queueResults(WORKOUTS, [{ id: 7, name: 'Doe,Jane' }], [], [])
    const res = await POST(csvReq('1,1,1,Doe, Jane'))
    expect((await res.json()).imported).toBe(1)
  })

  // A spreadsheet export quotes a name holding a comma, and the quoted cell
  // keeps its spacing.
  it('matches a quoted name that holds a comma', async () => {
    mock.queueResults(WORKOUTS, [{ id: 7, name: 'Doe, Jane' }], [], [])
    const res = await POST(csvReq('1,1,1,"Doe, Jane"'))
    expect((await res.json()).imported).toBe(1)
  })

  // DEFECT (v1, ported as-is): the consequence of that trim is that a judge
  // stored the natural way, "Doe, Jane", never matches its own CSV row.
  it('fails to match a stored name that has a space after the comma', async () => {
    mock.queueResults(WORKOUTS, [{ id: 7, name: 'Doe, Jane' }])
    const body = await (await POST(csvReq('1,1,1,Doe, Jane'))).json()
    expect(body.imported).toBe(0)
    expect(body.errors).toEqual([{ line: 1, message: 'Judge not found: "Doe,Jane"' }])
  })

  // A row with a blank judge name is dropped silently — not imported, and not
  // reported as an error either.
  it('drops a row with an empty judge name without reporting it', async () => {
    queue(1)
    const res = await POST(csvReq('1,1,1,Alex\n1,1,2,'))
    expect(await res.json()).toEqual({ imported: 1, workoutsAffected: [1], errors: [] })
  })

  // COM-114. A bad row is reported and skipped; the good rows still land.
  it('imports the good rows and reports the bad ones', async () => {
    queue(1)
    const res = await POST(csvReq('1,1,1,Alex\n1,1,2,Nobody'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      imported: 1,
      workoutsAffected: [1],
      errors: [{ line: 2, message: 'Judge not found: "Nobody"' }],
    })
    expect(mock.calls.find(c => c.method === 'values')!.args[0])
      .toEqual({ workoutId: 10, volunteerId: 7, heatNumber: 1, lane: 1 })
  })

  it('touches nothing when every row fails', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const body = await (await POST(csvReq('1,1,2,Nobody'))).json()
    expect(body.imported).toBe(0)
    expect(mock.calls.some(c => c.method === 'transaction')).toBe(false)
  })

  // Two rows for one lane used to go into a single insert and trip the unique
  // constraint, failing the lot. Rows now apply in file order: the later wins.
  it('lets a later row for the same lane replace an earlier one', async () => {
    queue(2)
    const res = await POST(csvReq('1,1,1,Alex\n1,1,1,Zoe'))
    expect((await res.json()).imported).toBe(2)
    expect(mock.calls.filter(c => c.method === 'values').map(c => c.args[0]))
      .toEqual([
        { workoutId: 10, volunteerId: 7, heatNumber: 1, lane: 1 },
        { workoutId: 10, volunteerId: 8, heatNumber: 1, lane: 1 },
      ])
  })

  it('reports a row with too few columns', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const body = await (await POST(csvReq('1,1,Alex'))).json()
    expect(body.errors).toEqual([{ line: 1, message: 'Expected 4 columns (workout, heat, lane, judge_name), got 3' }])
  })

  it('reports a row with unparseable numbers', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const body = await (await POST(csvReq('one,1,1,Alex'))).json()
    expect(body.errors).toEqual([{ line: 1, message: 'Invalid numbers in: "one,1,1,Alex"' }])
  })

  it('reports a workout number that does not exist', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const body = await (await POST(csvReq('9,1,1,Alex'))).json()
    expect(body.errors).toEqual([{ line: 1, message: 'Workout #9 not found' }])
  })

  // Line numbers account for the skipped header, so they match what the user
  // sees in their spreadsheet.
  it('numbers error lines from the original file including the header', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const body = await (await POST(csvReq('workout,heat,lane,judge\n1,1,1,Alex\n9,1,1,Alex'))).json()
    expect(body.errors[0].line).toBe(3)
  })

  it('collects every failing row rather than stopping at the first', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const body = await (await POST(csvReq('9,1,1,Alex\none,1,1,Alex'))).json()
    expect(body.errors.map((e: { line: number }) => e.line)).toEqual([1, 2])
  })

  // Each row clears anything already holding either its lane or its judge in
  // that heat, so an import cannot trip either unique constraint.
  it('clears conflicting rows inside a transaction before inserting', async () => {
    queue(2)
    await POST(csvReq('1,1,1,Alex\n1,1,2,Zoe'))
    expect(mock.calls.some(c => c.method === 'transaction')).toBe(true)
    expect(mock.calls.filter(c => c.method === 'delete')).toHaveLength(2)
    expect(mock.calls.filter(c => c.method === 'insert')).toHaveLength(2)
  })

  it('reports affected workout numbers deduped and sorted', async () => {
    queue(3)
    const res = await POST(csvReq('2,1,1,Alex\n1,1,1,Alex\n2,2,1,Zoe'))
    expect((await res.json()).workoutsAffected).toEqual([1, 2])
  })

  it('touches nothing when the CSV has no data rows', async () => {
    mock.queueResults(WORKOUTS, VOLUNTEERS)
    const res = await POST(csvReq('workout,heat,lane,judge'))
    expect(await res.json()).toEqual({ imported: 0, workoutsAffected: [], errors: [] })
    expect(mock.calls.some(c => c.method === 'transaction')).toBe(false)
  })
})
