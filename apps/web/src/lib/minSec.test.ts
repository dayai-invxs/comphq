import { describe, expect, it } from 'vitest'
import { formatMinSec, parseMinSec } from './minSec'

// v1's parseMinSec lives inline in the workouts admin page. It is the whole
// contract between four text boxes and the seconds the API stores, so it is
// pinned here rather than re-read from the page.
describe('parseMinSec', () => {
  it('reads minutes and seconds', () => {
    expect(parseMinSec('10:00')).toBe(600)
    expect(parseMinSec('2:30')).toBe(150)
  })

  // parseInt stops at the first non-digit and NaN falls back to 0, so nothing
  // a user can type makes it throw. v1 leaned on that; so does this.
  it('reads a bare number as minutes', () => {
    expect(parseMinSec('10')).toBe(600)
  })

  it('treats anything unreadable as zero rather than refusing it', () => {
    expect(parseMinSec('')).toBe(0)
    expect(parseMinSec('abc')).toBe(0)
    expect(parseMinSec(':')).toBe(0)
  })

  // parseInt('1x') is 1, and v1 accepted that rather than validating.
  it('takes the leading digits of a part it cannot fully read', () => {
    expect(parseMinSec('1x:30y')).toBe(90)
  })
})

// The way back, which v1 never needed: its form only ever created, so the
// boxes started on literal defaults. The edit screen has to fill them from
// stored seconds.
describe('formatMinSec', () => {
  it('pads the seconds so the value reads as a clock', () => {
    expect(formatMinSec(600)).toBe('10:00')
    expect(formatMinSec(150)).toBe('2:30')
    expect(formatMinSec(5)).toBe('0:05')
    expect(formatMinSec(0)).toBe('0:00')
  })

  it('round-trips through parseMinSec', () => {
    for (const secs of [0, 5, 60, 150, 600, 3725]) {
      expect(parseMinSec(formatMinSec(secs))).toBe(secs)
    }
  })
})
