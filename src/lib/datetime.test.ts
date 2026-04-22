import { describe, it, expect } from 'vitest'
import { toIsoOrNull } from './datetime'

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
