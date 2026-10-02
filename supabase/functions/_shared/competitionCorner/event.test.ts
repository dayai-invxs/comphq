import { describe, expect, it } from 'vitest'
import { parseEvent } from './event'
import { loadEvent19948, rawEvent19948 } from './__fixtures__/event19948'

describe('parseEvent', () => {
  it('reads the event, its divisions, workouts and heats', async () => {
    const ev = await loadEvent19948()

    expect(ev.id).toBe(19948)
    expect(ev.name).toBe('Rugged Rumble - Gladiator Games')
    expect(ev.divisions).toHaveLength(6)
    expect(ev.divisions[0]).toEqual({ id: 131045, title: 'Rx - Individual Women', format: 'individual' })
    expect(ev.workouts.map((w) => w.id)).toEqual([121778, 121777, 119545, 119547, 121768])
    expect(ev.heats).toHaveLength(43)
  })

  it('keeps each workout its time cap', async () => {
    const ev = await loadEvent19948()
    const cap = Object.fromEntries(ev.workouts.map((w) => [w.id, w.timeCap]))

    expect(cap).toEqual({ 121778: null, 121777: '00:08:00', 119545: null, 119547: null, 121768: '00:14:00' })
  })

  it('keeps the workout fields the mapper needs', async () => {
    const ev = await loadEvent19948()
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
    const ev = await loadEvent19948()

    expect(ev.heats.every((h) => /^\d{2}:\d{2}$/.test(h.time))).toBe(true)
  })

  it('keeps lanes without social links', async () => {
    const ev = await loadEvent19948()

    expect(ev.heats[0].stations[0]).toEqual({
      station: 1,
      participantId: 1430644,
      participantName: 'Maddie Clark',
      divisionId: 131085,
      affiliate: 'CROSSFIT PSYCHED',
    })
  })

  // An event announced before its schedule: divisions only.
  it('reads an event with no workouts or heats yet', () => {
    const parsed = parseEvent({ ...rawEvent19948(), workouts: [], heats: [] })

    expect(parsed).toMatchObject({ ok: true, event: { workouts: [], heats: [] } })
  })

  it('names where a posted event stops matching', () => {
    const raw = rawEvent19948()
    const heats = raw.heats as Array<Record<string, unknown>>
    heats[3] = { ...heats[3], time: 9 }

    expect(parseEvent(raw)).toEqual({ ok: false, where: 'heats.3.time' })
    expect(parseEvent(null)).toEqual({ ok: false, where: 'the event' })
  })
})
