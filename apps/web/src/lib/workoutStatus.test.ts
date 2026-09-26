import { describe, expect, it } from 'vitest'
import { statusBadge } from './workoutStatus'

describe('statusBadge', () => {
  it("carries v1's labels, including the draft typo", () => {
    expect(statusBadge('draft').label).toBe('INactive')
    expect(statusBadge('active').label).toBe('Active')
    expect(statusBadge('completed').label).toBe('Completed')
  })

  it('gives each status a tone of its own', () => {
    const tones = ['draft', 'active', 'completed'].map((s) => statusBadge(s).tone)
    expect(new Set(tones).size).toBe(3)
  })

  it('shows an unknown status as itself rather than hiding it', () => {
    expect(statusBadge('archived')).toEqual({ label: 'archived', tone: 'neutral' })
  })
})
