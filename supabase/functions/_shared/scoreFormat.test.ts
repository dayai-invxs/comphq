import { describe, it, expect } from 'vitest'
import {
  timeToMs, msToTimeParts, roundsRepsToScore, scoreToRoundsReps, formatScore, formatTiebreak,
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
