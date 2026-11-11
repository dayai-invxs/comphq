import { describe, it, expect } from 'vitest'
import { skippedPlaces } from './skippedPlace'

const points = (table: Record<string, number>) => (athleteId: number, workoutId: number) => table[`${athleteId}-${workoutId}`] ?? null

describe('the place a skipped workout gives', () => {
  const athletes = [
    { id: 1, division: 'RX' }, { id: 2, division: 'RX' }, { id: 3, division: 'RX' }, { id: 4, division: 'RX' },
    { id: 5, division: 'Scaled' }, { id: 6, division: 'Scaled' },
  ]

  it('is the place after the last athlete of the division who scored, shared by everyone who skipped', () => {
    const place = skippedPlaces([{ id: 9, status: 'completed' }], athletes, points({ '1-9': 1, '2-9': 2 }))
    expect(place(3, 9)).toBe(3)
    expect(place(4, 9)).toBe(3)
  })

  // Ties among the scorers still leave the skip one place after all of them.
  it('counts every scorer, however they tied', () => {
    const place = skippedPlaces([{ id: 9, status: 'completed' }], athletes, points({ '1-9': 1, '2-9': 1, '3-9': 1 }))
    expect(place(4, 9)).toBe(4)
  })

  it('is nothing for an athlete who scored', () => {
    const place = skippedPlaces([{ id: 9, status: 'completed' }], athletes, points({ '1-9': 1 }))
    expect(place(1, 9)).toBeNull()
  })

  // While the workout runs, no score may only mean not yet.
  it('is nothing while the workout is still running', () => {
    const place = skippedPlaces([{ id: 9, status: 'active' }], athletes, points({ '1-9': 1 }))
    expect(place(2, 9)).toBeNull()
  })

  // A division nobody scored in did not run the workout.
  it('is nothing in a division nobody scored in', () => {
    const place = skippedPlaces([{ id: 9, status: 'completed' }], athletes, points({ '1-9': 1 }))
    expect(place(5, 9)).toBeNull()
  })

  it('counts each division on its own', () => {
    const place = skippedPlaces([{ id: 9, status: 'completed' }], athletes,
      points({ '1-9': 1, '2-9': 2, '3-9': 3, '5-9': 1 }))
    expect(place(4, 9)).toBe(4)
    expect(place(6, 9)).toBe(2)
  })
})
