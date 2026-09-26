import { describe, it, expect } from 'vitest'
import { supabaseMock as mock, setAuthUser } from '@/test/setup'
import { GET, POST } from './route'

const SELECT = 'id, item, divisionId, division:Division(id, name)'
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const getReq = (slug = 'default') => new Request(`http://test/api/workouts/1/equipment?slug=${slug}`)
const postReq = (body: Record<string, unknown>) =>
  new Request('http://test/api/workouts/1/equipment?slug=default', { method: 'POST', body: JSON.stringify(body) })

describe('GET /api/workouts/[id]/equipment', () => {
  // DEFECT (v1, ported as-is): GET resolves the competition but never checks a
  // session, so equipment lists are readable by anyone with a slug. POST on the
  // same route does gate. Locked here; tracked separately for a fix.
  it('serves an anonymous caller', async () => {
    setAuthUser(null)
    mock.queueResults({ data: { id: 1 }, error: null }, { data: [], error: null })
    expect((await GET(getReq(), params('1'))).status).toBe(200)
  })

  it('404s when the slug does not resolve', async () => {
    const res = await GET(getReq(''), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Competition not found')
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResult({ data: null, error: null })
    const res = await GET(getReq(), params('1'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not found')
  })

  it('orders all-division rows first, then by item name', async () => {
    const rows = [{ id: 1, item: 'Barbell', divisionId: null, division: null }]
    mock.queueResults({ data: { id: 1 }, error: null }, { data: rows, error: null })

    const res = await GET(getReq(), params('1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(rows)

    const call = mock.lastCall!
    expect(call.table).toBe('WorkoutEquipment')
    expect(call.ops.find(o => o.op === 'select')!.args[0]).toBe(SELECT)
    const orders = call.ops.filter(o => o.op === 'order')
    expect(orders[0].args).toEqual(['divisionId', { nullsFirst: true }])
    expect(orders[1].args[0]).toBe('item')
  })

  it('coalesces a null data payload to an empty array', async () => {
    mock.queueResults({ data: { id: 1 }, error: null }, { data: null, error: null })
    expect(await (await GET(getReq(), params('1'))).json()).toEqual([])
  })

  it('surfaces a query error as 500', async () => {
    mock.queueResults({ data: { id: 1 }, error: null }, { data: null, error: { message: 'boom' } })
    expect((await GET(getReq(), params('1'))).status).toBe(500)
  })
})

describe('POST /api/workouts/[id]/equipment', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(postReq({ item: 'Barbell' }), params('1'))).status).toBe(401)
  })

  it('rejects an empty item', async () => {
    expect((await POST(postReq({ item: ' ' }), params('1'))).status).toBe(400)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResult({ data: null, error: null })
    expect((await POST(postReq({ item: 'Barbell' }), params('1'))).status).toBe(404)
  })

  it('defaults an omitted divisionId to null, meaning all divisions', async () => {
    mock.queueResults(
      { data: { id: 1 }, error: null },
      { data: { id: 9, item: 'Barbell', divisionId: null, division: null }, error: null },
    )
    const res = await POST(postReq({ item: 'Barbell' }), params('1'))
    expect(res.status).toBe(201)
    expect(mock.lastCall!.ops.find(o => o.op === 'insert')!.args[0])
      .toEqual({ workoutId: 1, item: 'Barbell', divisionId: null })
  })

  it('inserts with the supplied divisionId and returns 201', async () => {
    const created = { id: 9, item: 'Barbell', divisionId: 3, division: { id: 3, name: 'Rx' } }
    mock.queueResults({ data: { id: 1 }, error: null }, { data: created, error: null })

    const res = await POST(postReq({ item: 'Barbell', divisionId: 3 }), params('1'))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)
    expect(mock.lastCall!.ops.find(o => o.op === 'insert')!.args[0])
      .toEqual({ workoutId: 1, item: 'Barbell', divisionId: 3 })
  })

  it('surfaces an insert error as 500', async () => {
    mock.queueResults({ data: { id: 1 }, error: null }, { data: null, error: { message: 'nope' } })
    expect((await POST(postReq({ item: 'Barbell' }), params('1'))).status).toBe(500)
  })
})
