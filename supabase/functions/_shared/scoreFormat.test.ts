import { describe, it, expect } from 'vitest'
import {
  timeToMs, msToTimeParts, roundsRepsToScore, scoreToRoundsReps, formatScore, formatTiebreak, displayScoreType,
} from './scoreFormat'

describe('timeToMs / msToTimeParts round-trip', () => {
  it('converts to ms and back', () => {
    const ms = timeToMs(3, 45, 678)
    expect(ms).toBe(3 * 60000 + 45 * 1000 + 678)
    expect(msToTimeParts(ms)).toEqual({ mins: 3, secs: 45, ms: 678 })
  })
})

describe('roundsReps round-trip', () => {
  it('encodes and decodes', () => {
    const score = roundsRepsToScore(5, 23)
    expect(scoreToRoundsReps(score)).toEqual({ rounds: 5, reps: 23 })
  })
})

describe('formatScore', () => {
  it('formats time scores as m:ss.cc (centiseconds)', () => {
    expect(formatScore(3 * 60000 + 5 * 1000 + 120, 'time')).toBe('3:05.12')
    expect(formatScore(3 * 60000 + 5 * 1000 + 500, 'time')).toBe('3:05.50')
    expect(formatScore(3 * 60000 + 5 * 1000, 'time')).toBe('3:05.00')
  })
  it('formats rounds_reps', () => {
    expect(formatScore(roundsRepsToScore(4, 15), 'rounds_reps')).toBe('4r + 15')
  })
  it('falls back to plain number', () => {
    expect(formatScore(42, 'higher_is_better')).toBe('42')
  })
})

describe('formatTiebreak', () => {
  it('formats like time in centiseconds', () => {
    expect(formatTiebreak(2 * 60000 + 7 * 1000 + 40)).toBe('2:07.04')
    expect(formatTiebreak(2 * 60000 + 7 * 1000)).toBe('2:07.00')
  })
})

describe('a capped score', () => {
  it('reads as the rounds and reps it holds, whatever the workout type', () => {
    expect(formatScore(40012, 'time', true)).toBe('CAP 4r + 12')
    expect(formatScore(0, 'time', true)).toBe('CAP 0r + 0')
  })

  it('leaves an uncapped time as a time', () => {
    expect(formatScore(330000, 'time', false)).toBe('5:30.00')
  })
})

// A rounds + reps workout scored with no rounds anywhere is a reps workout:
// its scores show as the rep count. One round anywhere brings rounds back.
describe('displayScoreType', () => {
  it('shows reps alone when no score has a round', () => {
    const type = displayScoreType('rounds_reps', [143, 98, null])
    expect(type).toBe('higher_is_better')
    expect(formatScore(143, type)).toBe('143')
  })

  it('keeps rounds once any score has one', () => {
    expect(displayScoreType('rounds_reps', [143, roundsRepsToScore(1, 2)])).toBe('rounds_reps')
  })

  it('leaves every other score type alone', () => {
    expect(displayScoreType('time', [143])).toBe('time')
    expect(displayScoreType('weight', [143])).toBe('weight')
  })
})
