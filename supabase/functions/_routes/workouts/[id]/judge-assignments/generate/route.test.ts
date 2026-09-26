import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { POST } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const workout = (lanes: number) => [{ id: 1, competitionId: 1, lanes }]
const req = (body: Record<string, unknown> = { maxConsecutive: 2 }) =>
  new Request('http://test/api/workouts/1/judge-assignments/generate?slug=default',
    { method: 'POST', body: JSON.stringify(body) })

const judgeRows = (...ids: number[]) => ids.map(id => ({ id, roleName: 'Judge' }))
const heatRows = (...nums: number[]) => nums.map(heatNumber => ({ heatNumber }))

// Queue order: workout lookup, dead judges query, judge rows, heat rows,
// delete, insert, final read-back.
const queue = (
  lanes: number,
  judges: { id: number; roleName: string }[],
  heats: { heatNumber: number }[],
) => mock.queueResults(workout(lanes), [], judges, heats, [], [], [])

const inserted = () =>
  mock.calls.find(c => c.method === 'values')!.args[0] as
    { volunteerId: number; heatNumber: number; lane: number; workoutId: number }[]

describe('POST /api/workouts/[id]/judge-assignments/generate', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await POST(req(), params('1'))).status).toBe(401)
  })

  it('404s when the workout belongs to another competition', async () => {
    mock.queueResults([])
    expect((await POST(req(), params('1'))).status).toBe(404)
  })

  it('rejects a maxConsecutive of zero', async () => {
    mock.queueResults(workout(4))
    expect((await POST(req({ maxConsecutive: 0 }), params('1'))).status).toBe(400)
  })

  it('rejects a maxConsecutive above 20', async () => {
    mock.queueResults(workout(4))
    expect((await POST(req({ maxConsecutive: 21 }), params('1'))).status).toBe(400)
  })

  // The judge check runs before the heat check, so a competition with neither
  // reports the judges message.
  it('422s with the judges message when no volunteer holds the judge role', async () => {
    queue(4, [{ id: 1, roleName: 'Scorer' }], heatRows(1))
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(422)
    expect(await res.text()).toBe('No judges found. Add volunteers with a "Judge" role first.')
  })

  it('422s when no heats have been drawn', async () => {
    queue(4, judgeRows(1), [])
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(422)
    expect(await res.text()).toBe('No heats found. Generate athlete assignments first.')
  })

  it('matches the judge role case-insensitively', async () => {
    queue(1, [{ id: 1, roleName: 'JUDGE' }], heatRows(1))
    expect((await POST(req(), params('1'))).status).toBe(201)
  })

  // The route runs a judges query whose result it discards, then re-queries.
  // Two round trips where one would do; the shape is load-bearing for anyone
  // counting queued results.
  it('issues a discarded judges query before the one it uses', async () => {
    queue(1, judgeRows(1), heatRows(1))
    await POST(req(), params('1'))
    expect(mock.calls.filter(c => c.method === 'innerJoin')).toHaveLength(3)
  })

  it('replaces the existing assignments rather than adding to them', async () => {
    queue(1, judgeRows(1), heatRows(1))
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(201)
    const order = mock.calls.filter(c => c.method === 'delete' || c.method === 'insert').map(c => c.method)
    expect(order).toEqual(['delete', 'insert'])
  })

  it('fills one lane per judge up to the workout lane count', async () => {
    queue(3, judgeRows(1, 2, 3), heatRows(1))
    await POST(req(), params('1'))
    expect(inserted()).toEqual([
      { volunteerId: 1, heatNumber: 1, lane: 1, workoutId: 1 },
      { volunteerId: 2, heatNumber: 1, lane: 2, workoutId: 1 },
      { volunteerId: 3, heatNumber: 1, lane: 3, workoutId: 1 },
    ])
  })

  // Fewer judges than lanes leaves the remaining lanes unjudged rather than
  // doubling anyone up.
  it('leaves lanes unfilled when there are fewer judges than lanes', async () => {
    queue(4, judgeRows(1, 2), heatRows(1))
    await POST(req(), params('1'))
    expect(inserted().map(a => a.lane)).toEqual([1, 2])
  })

  it('dedupes and sorts the heat numbers taken from athlete assignments', async () => {
    queue(1, judgeRows(1), heatRows(3, 1, 1, 2))
    await POST(req(), params('1'))
    expect(inserted().map(a => a.heatNumber)).toEqual([1, 2, 3])
  })

  // maxConsecutive rests a judge who has just worked that many heats in a row.
  it('rotates judges out after their consecutive limit', async () => {
    queue(1, judgeRows(1, 2), heatRows(1, 2, 3, 4))
    await POST(req({ maxConsecutive: 1 }), params('1'))
    expect(inserted().map(a => a.volunteerId)).toEqual([1, 2, 1, 2])
  })

  // Load balancing is applied before the consecutive limit is ever reached, so
  // with as many judges as lanes the rotation is identical whatever the limit
  // is set to — raising maxConsecutive does not let a judge work back-to-back.
  it('balances by load before the consecutive limit can bind', async () => {
    queue(1, judgeRows(1, 2), heatRows(1, 2, 3, 4))
    await POST(req({ maxConsecutive: 2 }), params('1'))
    expect(inserted().map(a => a.volunteerId)).toEqual([1, 2, 1, 2])
  })

  // The limit only bites when there are more judges than lanes, so the load
  // sort cannot rotate everyone out on its own. Here judges 1 and 2 are resting
  // in heat 2 and only judge 3 is eligible, so heat 2 runs a lane short: the
  // all-reset escape hatch fires only when *nobody* is eligible, not when there
  // are too few to fill the lanes.
  it('leaves a lane unjudged when the limit thins the pool below the lane count', async () => {
    queue(2, judgeRows(1, 2, 3), heatRows(1, 2, 3))
    await POST(req({ maxConsecutive: 1 }), params('1'))
    expect(inserted().map(a => `${a.heatNumber}:${a.lane}:${a.volunteerId}`))
      .toEqual(['1:1:1', '1:2:2', '2:1:3', '3:1:1', '3:2:2'])
  })

  // The limit is soft: when every judge is due a break, all counters reset and
  // the heat is staffed anyway rather than left unjudged.
  it('ignores the consecutive limit when nobody is eligible', async () => {
    queue(2, judgeRows(1, 2), heatRows(1, 2))
    await POST(req({ maxConsecutive: 1 }), params('1'))
    expect(inserted()).toHaveLength(4)
    expect(inserted().map(a => a.volunteerId)).toEqual([1, 2, 1, 2])
  })

  // Between heats, the next judge picked is whoever has worked least so far.
  it('spreads the load by total heats already judged', async () => {
    queue(1, judgeRows(1, 2, 3), heatRows(1, 2, 3, 4, 5, 6))
    await POST(req({ maxConsecutive: 5 }), params('1'))
    expect(inserted().map(a => a.volunteerId)).toEqual([1, 2, 3, 1, 2, 3])
  })

  it('sitting out a heat clears a judge’s consecutive counter', async () => {
    queue(1, judgeRows(1, 2, 3), heatRows(1, 2, 3))
    await POST(req({ maxConsecutive: 1 }), params('1'))
    expect(inserted().map(a => a.volunteerId)).toEqual([1, 2, 3])
  })

  it('returns the regenerated list with judge names', async () => {
    const readBack = [{ id: 1, workoutId: 1, volunteerId: 1, heatNumber: 1, lane: 1, judgeName: 'Alex' }]
    mock.queueResults(workout(1), [], judgeRows(1), heatRows(1), [], [], readBack)
    const res = await POST(req(), params('1'))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(readBack)
  })
})
