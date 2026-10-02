import { describe, it, expect } from 'vitest'
import { toIsoOrNull, zonedTimeToIso } from './datetime'

describe('toIsoOrNull', () => {
  it('returns null for empty string', () => {
    expect(toIsoOrNull('')).toBeNull()
    expect(toIsoOrNull('   ')).toBeNull()
  })

  it('returns null for unparseable input', () => {
    expect(toIsoOrNull('not a date')).toBeNull()
  })

  it('converts a datetime-local value into a full ISO timestamp', () => {
    const iso = toIsoOrNull('2026-05-01T14:30')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
    // Round-tripping preserves the local instant.
    expect(new Date(iso!).getTime()).toBe(new Date('2026-05-01T14:30').getTime())
  })

  it('passes already-ISO strings through unchanged shape', () => {
    const iso = toIsoOrNull('2026-05-01T14:30:00.000Z')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('zonedTimeToIso', () => {
  it('reads a wall-clock time in the given zone', () => {
    expect(zonedTimeToIso('2026-04-25', '08:15', 'America/Los_Angeles')).toBe('2026-04-25T15:15:00.000Z')
    expect(zonedTimeToIso('2026-01-10', '08:15', 'America/Los_Angeles')).toBe('2026-01-10T16:15:00.000Z')
    expect(zonedTimeToIso('2026-04-25', '08:15', 'UTC')).toBe('2026-04-25T08:15:00.000Z')
    expect(zonedTimeToIso('2026-04-25', '08:15', 'Asia/Kolkata')).toBe('2026-04-25T02:45:00.000Z')
  })

  it('handles the hour after a spring-forward change', () => {
    // US clocks jump 02:00 → 03:00 on 2026-03-08; 03:30 is PDT (UTC-7).
    expect(zonedTimeToIso('2026-03-08', '03:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z')
  })

  it('returns null for a bad zone or time', () => {
    expect(zonedTimeToIso('2026-04-25', '08:15', 'Not/AZone')).toBeNull()
    expect(zonedTimeToIso('2026-04-25', '8am', 'UTC')).toBeNull()
    expect(zonedTimeToIso('04/25/2026', '08:15', 'UTC')).toBeNull()
  })
})
