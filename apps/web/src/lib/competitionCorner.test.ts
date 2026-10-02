import { describe, expect, it, vi } from 'vitest'
import { CC_API, fetchCcEvent, parseEventUrl, summarizeEvent } from './competitionCorner'

describe('parseEventUrl', () => {
  it.each([
    ['https://competitioncorner.net/events/19948/details', 19948],
    ['https://competitioncorner.net/events/19948', 19948],
    ['competitioncorner.net/events/19948/schedule?tab=1', 19948],
    ['https://www.competitioncorner.net/events/19948/details', 19948],
    ['19948', 19948],
    ['  19948  ', 19948],
  ])('reads the event id from %s', (url, id) => {
    expect(parseEventUrl(url)).toBe(id)
  })

  it.each([
    'https://example.com/events/19948',
    'https://competitioncorner.net/leaderboard/19948',
    'https://competitioncorner.net/events/abc',
    '',
    '0',
  ])('rejects %s', (url) => {
    expect(parseEventUrl(url)).toBeNull()
  })
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A fake Competition Corner: path below the API root to response. */
function source(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname.slice(new URL(CC_API).pathname.length + 1)
    const route = routes[path]
    return route ? route() : json({ error: 'Not found' }, 404)
  })
}

const EVENT = { id: 7, name: 'Summer Throwdown', divisions: [{ id: 1, title: 'Rx', format: 'individual' }], extra: 'kept' }
const WORKOUT = { id: 11, name: 'WOD 1', type: 'fortime' }
const HEAT = { id: 21, workoutId: 11, stations: [] }

const full = () => ({
  'events/7': () => json(EVENT),
  'schedule/events/7/workouts': () => json({ dates: [], workouts: [WORKOUT] }),
  'events/7/workouts/11/public': () => json({ id: 11, timeCap: '00:12:00' }),
  'schedule/events/7/heats': () => json([HEAT]),
})

describe('fetchCcEvent', () => {
  it('joins the event, its workouts with their time caps, and its heats', async () => {
    const fetchFn = source(full())

    const event = await fetchCcEvent(7, fetchFn)

    expect(event).toEqual({ ...EVENT, workouts: [{ ...WORKOUT, timeCap: '00:12:00' }], heats: [HEAT] })
  })

  // Competition Corner's server caches each answer by URL with the headers of
  // whichever request filled it; one filled without an Origin lacks the CORS
  // header, so the browser refuses it for minutes. A query no one else sends
  // gets a fresh answer, made for this browser's request.
  it('asks for every answer fresh, so it carries the CORS header', async () => {
    const fetchFn = source(full())

    await fetchCcEvent(7, fetchFn)
    await fetchCcEvent(7, fetchFn)

    const urls = fetchFn.mock.calls.map(([url]) => url)
    expect(urls).toHaveLength(8)
    expect(urls.every((u) => new URL(u).searchParams.has('fresh'))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
  })

  // An event announced before its schedule is published.
  it('reads an event with no workouts or heats yet', async () => {
    const fetchFn = source({
      ...full(),
      'schedule/events/7/workouts': () => json({ dates: [], workouts: [] }),
      'schedule/events/7/heats': () => json([]),
    })

    expect(await fetchCcEvent(7, fetchFn)).toMatchObject({ workouts: [], heats: [] })
  })

  // Every read 404s for a wrong id; the event's answer must win however they land.
  it('says when the event does not exist', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/events/8')) await new Promise((r) => setTimeout(r, 5))
      return json({ error: 'Event not found' }, 404)
    })

    await expect(fetchCcEvent(8, fetchFn)).rejects.toThrow('Competition Corner has no event 8. Check the link.')
  })

  it('names the part Competition Corner refused', async () => {
    const fetchFn = source({ ...full(), 'schedule/events/7/heats': () => json({}, 403) })

    await expect(fetchCcEvent(7, fetchFn)).rejects.toThrow(
      "Competition Corner answered 403 when reading the event's heat sheets. Try again in a minute.",
    )
  })

  it('names the workout whose page failed', async () => {
    const fetchFn = source({ ...full(), 'events/7/workouts/11/public': () => json({}, 500) })

    await expect(fetchCcEvent(7, fetchFn)).rejects.toThrow(
      'Competition Corner answered 500 when reading workout WOD 1. Try again in a minute.',
    )
  })

  it('says when Competition Corner cannot be reached', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch') })

    await expect(fetchCcEvent(7, fetchFn)).rejects.toThrow(
      "Couldn't reach Competition Corner from this browser. Check your connection and try again; if it keeps failing, Competition Corner may be blocking this browser, so try another one.",
    )
  })

  it('says when an answer is not the data the import reads', async () => {
    const fetchFn = source({ ...full(), 'schedule/events/7/workouts': () => new Response('<html>', { status: 200 }) })

    await expect(fetchCcEvent(7, fetchFn)).rejects.toThrow(
      "Competition Corner sent something other than the event's workouts. Try again in a minute.",
    )
  })
})

describe('summarizeEvent', () => {
  it('counts what the event lists', () => {
    expect(summarizeEvent({ divisions: [1, 2], workouts: [1], heats: [1, 2, 3] })).toEqual({
      text: 'Competition Corner lists 2 divisions, 1 workout and 3 heats.',
      notice: null,
    })
  })

  it('explains an event with no workouts yet', () => {
    expect(summarizeEvent({ divisions: [1], workouts: [], heats: [] })).toEqual({
      text: 'Competition Corner lists 1 division, 0 workouts and 0 heats.',
      notice:
        'This event has no workouts or heat sheets published yet, so only divisions can be imported. Run the import again once the schedule is out.',
    })
  })

  it('explains an event with workouts but no heat sheets', () => {
    expect(summarizeEvent({ divisions: [1], workouts: [1], heats: [] }).notice).toBe(
      'This event has no heat sheets published yet, so no athletes or lanes can be imported. Athletes come from the heat sheets; run the import again once they are out.',
    )
  })
})
