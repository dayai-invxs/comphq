import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
import { fetchEvent, type CcEvent } from '../client'

const DIR = new URL('./19948/', import.meta.url)
const BASE = 'https://competitioncorner.net/api2/v1'

export const CC_BASE = BASE

/** A fetch that serves the saved 19948 responses by URL; anything else is a 404. */
export function fixtureFetch(overrides: Record<string, Response> = {}) {
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
    return file ? new Response(readFileSync(new URL(file, DIR), 'utf8')) : new Response('not found', { status: 404 })
  })
}

/** Event 19948 as fetchEvent returns it. */
export const loadEvent19948 = (): Promise<CcEvent> => fetchEvent(19948, fixtureFetch())
