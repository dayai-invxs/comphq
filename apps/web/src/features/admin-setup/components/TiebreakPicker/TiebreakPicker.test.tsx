import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Workout } from '@/api/workouts'
import { TiebreakPicker } from './TiebreakPicker'

const WORKOUTS = [
  { id: 4, number: 1, name: 'Fran' },
  { id: 7, number: 2, name: 'Grace' },
] as Workout[]

interface Over {
  workoutId?: number | null
  onPick?: (id: number | null) => void
  saving?: boolean
}

function picker(over: Over = {}) {
  const onPick = over.onPick ?? vi.fn()
  render(
    <TiebreakPicker
      workouts={WORKOUTS}
      workoutId={over.workoutId ?? null}
      onPick={onPick}
      saving={over.saving ?? false}
    />,
  )
  return onPick
}

const select = () => screen.getByLabelText('Tiebreak workout')

describe('TiebreakPicker', () => {
  it('names its region and says what the setting decides', () => {
    picker()
    expect(screen.getByRole('region', { name: 'Leaderboard Tiebreaker' })).toBeInTheDocument()
    expect(
      screen.getByText(/If athletes are still tied after comparing all workout placements/),
    ).toBeInTheDocument()
  })

  it('offers every workout, and None', () => {
    picker()
    expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'WOD 1: Fran' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'WOD 2: Grace' })).toBeInTheDocument()
  })

  it('shows the workout already designated', () => {
    picker({ workoutId: 7 })
    expect(select()).toHaveValue('7')
  })

  it('saves the pick as a number', () => {
    const onPick = picker()
    fireEvent.change(select(), { target: { value: '7' } })
    expect(onPick).toHaveBeenCalledWith(7)
  })

  // None is a value the setting can hold, not an absence of one: it clears
  // the designated workout.
  it('saves None as a cleared setting', () => {
    const onPick = picker({ workoutId: 7 })
    fireEvent.change(select(), { target: { value: '' } })
    expect(onPick).toHaveBeenCalledWith(null)
  })

  // There is no Save here: the pick is the write. So the control closes while
  // the write is out rather than accepting a second pick that would race it.
  it('takes no second pick while the first is still out', () => {
    picker({ saving: true })
    expect(select()).toBeDisabled()
  })
})
