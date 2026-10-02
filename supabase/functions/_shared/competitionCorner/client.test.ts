import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { CcFetchError, fetchEvent, parseEventUrl } from './client'

const FIXTURES = new URL('./__fixtures__/19948/', import.meta.url)
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8')

const BASE = 'https://competitioncorner.net/api2/v1'

/** Serves the saved 19948 responses by URL; anything else is a 404. */
function fixtureFetch(overrides: Record<string, Response> = {}) {
  const routes: Record<string, string> = {
    [`${BASE}/events/19948`]: 'event.json',
    [`${BASE}/schedule/events/19948/workouts`]: 'schedule-workouts.json',
    [`${BASE}/schedule/events/19948/heats`]: 'heats.json',
  }
  for (const id of [119545, 119547, 121768, 121777, 121778]) {
    routes[`${BASE}/events/19948/workouts/${id}/public`] = `workout-${id}.json`
  }
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (overrides[url]) return overrides[url]
    const file = routes[url]
    return file ? new Response(fixture(file)) : new Response('not found', { status: 404 })
  })
}

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

describe('fetchEvent', () => {
  it('returns the event, its divisions, workouts and heats', async () => {
    const ev = await fetchEvent(19948, fixtureFetch())

    expect(ev.id).toBe(19948)
    expect(ev.name).toBe('Rugged Rumble - Gladiator Games')
    expect(ev.divisions).toHaveLength(6)
    expect(ev.divisions[0]).toEqual({ id: 131045, title: 'Rx - Individual Women', format: 'individual' })
    expect(ev.workouts.map((w) => w.id)).toEqual([121778, 121777, 119545, 119547, 121768])
    expect(ev.heats).toHaveLength(43)
  })

  it('adds each workout its time cap from the workout page', async () => {
    const ev = await fetchEvent(19948, fixtureFetch())
    const cap = Object.fromEntries(ev.workouts.map((w) => [w.id, w.timeCap]))

    expect(cap).toEqual({ 121778: null, 121777: '00:08:00', 119545: null, 119547: null, 121768: '00:14:00' })
  })

  it('keeps the workout fields the mapper needs', async () => {
    const ev = await fetchEvent(19948, fixtureFetch())
    const wod1 = ev.workouts.find((w) => w.id === 121778)!

    expect(wod1).toMatchObject({
      name: 'Maximus - WOD 1',
      type: 'amrap',
      tiebreakerType: 'time',
      location: 'Gym Floor',
      date: '2026-04-25T00:00:00',
    })
    expect(wod1.description).toContain('13 Minute AMREP')
  })

  it('trims heat times, which the source sometimes pads', async () => {
    const ev = await fetchEvent(19948, fixtureFetch())

    expect(ev.heats.every((h) => /^\d{2}:\d{2}$/.test(h.time))).toBe(true)
  })

  it('keeps lanes without social links', async () => {
    const ev = await fetchEvent(19948, fixtureFetch())

    expect(ev.heats[0].stations[0]).toEqual({
      station: 1,
      participantId: 1430644,
      participantName: 'Maddie Clark',
      divisionId: 131085,
      affiliate: 'CROSSFIT PSYCHED',
    })
  })

  it('fetches every endpoint in parallel, not one after another', async () => {
    const fetchFn = fixtureFetch()
    let inFlight = 0
    let peak = 0
    const tracked = vi.fn(async (input: string | URL | Request) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 0))
      try { return await fetchFn(input) } finally { inFlight-- }
    })

    await fetchEvent(19948, tracked)

    expect(peak).toBeGreaterThanOrEqual(3)
  })

  it('throws CcFetchError with the status when the event is missing', async () => {
    const fetchFn = fixtureFetch({ [`${BASE}/events/19948`]: new Response('nope', { status: 404 }) })

    await expect(fetchEvent(19948, fetchFn)).rejects.toMatchObject({ name: 'CcFetchError', status: 404 })
  })

  it('throws CcFetchError when a response no longer has the expected shape', async () => {
    const fetchFn = fixtureFetch({ [`${BASE}/events/19948`]: new Response(JSON.stringify({ id: 'x' })) })

    await expect(fetchEvent(19948, fetchFn)).rejects.toBeInstanceOf(CcFetchError)
  })
})
