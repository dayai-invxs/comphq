import { readFileSync } from 'node:fs'
import { parseEvent, type CcEvent } from '../event'

const DIR = new URL('./19948/', import.meta.url)
const read = (file: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(file, DIR), 'utf8'))

const WORKOUT_IDS = [121778, 121777, 119545, 119547, 121768]

/**
 * Event 19948 as the browser posts it: the event, each schedule workout with
 * the time cap from its workout page, and the heat sheets. Raw, with every field the
 * API sends, so the tests see what the routes see.
 */
export function rawEvent19948(): Record<string, unknown> {
  const pages = new Map(WORKOUT_IDS.map((id) => [id, read(`workout-${id}.json`)]))
  const { workouts } = read('schedule-workouts.json') as { workouts: Array<{ id: number }> }
  return {
    ...read('event.json'),
    workouts: workouts.map((w) => ({ ...w, timeCap: pages.get(w.id)!.timeCap })),
    heats: read('heats.json'),
  }
}

/** Event 19948 as parseEvent returns it. */
export async function loadEvent19948(): Promise<CcEvent> {
  const parsed = parseEvent(rawEvent19948())
  if (!parsed.ok) throw new Error(`fixture no longer parses at ${parsed.where}`)
  return parsed.event
}
