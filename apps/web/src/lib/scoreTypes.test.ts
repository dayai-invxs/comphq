import { describe, expect, it } from 'vitest'
import { SCORE_TYPE_OPTIONS, scoreTypeLabel } from './scoreTypes'

// The score-type half of v1's workoutEnums.ts. The status half is
// workoutStatus.ts — it was split because only the status half carried
// Tailwind class strings; the values here are v1's unchanged.
describe('SCORE_TYPE_OPTIONS', () => {
  it('offers the three v1 offers, in v1s order, with v1s wording', () => {
    expect(SCORE_TYPE_OPTIONS).toEqual([
      { value: 'time', label: 'Time (lower is better)' },
      { value: 'rounds_reps', label: 'Rounds + Reps (higher is better)' },
      { value: 'weight', label: 'Weight (higher is better)' },
    ])
  })

  // The legacy aliases are accepted at the API boundary and have labels, but
  // v1 never put them in a dropdown, so neither does this.
  it('leaves the legacy aliases out of the dropdown', () => {
    const offered = SCORE_TYPE_OPTIONS.map((o) => o.value)
    expect(offered).not.toContain('lower_is_better')
    expect(offered).not.toContain('higher_is_better')
  })
})

describe('scoreTypeLabel', () => {
  it('gives the compact label rows use, not the dropdown wording', () => {
    expect(scoreTypeLabel('time')).toBe('Time')
    expect(scoreTypeLabel('rounds_reps')).toBe('Rounds + Reps')
    expect(scoreTypeLabel('weight')).toBe('Weight')
  })

  // Rows still have to read for workouts stored under the old names.
  it('still labels the legacy aliases', () => {
    expect(scoreTypeLabel('lower_is_better')).toBe('Time')
    expect(scoreTypeLabel('higher_is_better')).toBe('Reps / Weight')
  })

  it('shows an unknown value rather than a blank', () => {
    expect(scoreTypeLabel('points')).toBe('points')
  })
})
