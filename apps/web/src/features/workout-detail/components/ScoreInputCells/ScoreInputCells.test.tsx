import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PartAInputCell, PartBInputCell } from './ScoreInputCells'
import type { RRField } from '../../useScoreInputs'

// v1: src/components/workout-detail/ScoreInputCells.tsx. The cells a score is
// typed into. The behaviour worth pinning is the blur normaliser — it is what
// lets a judge type 312 and get 3:12 — and which control each score type draws.

// The setters are returned as the mocks they are rather than through the
// spread, so an assertion on `.mock.calls` still sees a mock.
function cellA(over: Partial<Parameters<typeof PartAInputCell>[0]> = {}) {
  const setters = {
    setTime: vi.fn(),
    setRr: vi.fn(),
    setWeight: vi.fn(),
    setTiebreak: vi.fn(),
  }
  render(
    <PartAInputCell
      athleteId={1}
      scoreType="time"
      time={{} as Record<number, string>}
      rr={{} as Record<number, RRField>}
      weight={{} as Record<number, string>}
      tiebreakEnabled={false}
      tiebreakScoreType="time"
      tiebreak={{} as Record<number, string>}
      {...setters}
      {...over}
    />,
  )
  return setters
}

describe('the part A cell', () => {
  it('draws one time box for a timed workout', () => {
    cellA({ time: { 1: '3:12' } })
    expect(screen.getByDisplayValue('3:12')).toBeInTheDocument()
  })

  it('draws rounds and reps for a rounds_reps workout', () => {
    cellA({ scoreType: 'rounds_reps', rr: { 1: { rounds: '4', reps: '7' } } })
    expect(screen.getByDisplayValue('4')).toBeInTheDocument()
    expect(screen.getByDisplayValue('7')).toBeInTheDocument()
    expect(screen.getByText('rds')).toBeInTheDocument()
    expect(screen.getByText('reps')).toBeInTheDocument()
  })

  it('draws a number box for anything else', () => {
    cellA({ scoreType: 'weight', weight: { 1: '90' } })
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
  })

  it('reports what was typed against the athlete it belongs to', () => {
    const { setTime } = cellA()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2:30' } })
    expect(setTime).toHaveBeenCalled()
    expect(setTime.mock.calls[0][0]({})).toEqual({ 1: '2:30' })
  })

  // The normaliser, straight out of v1: digits only, read from the right.
  it.each([
    ['45', '0:45'],
    ['312', '3:12'],
    ['1230', '12:30'],
    ['31205', '3:12.05'],
    ['90', '1:30'],
  ])('turns %s into %s when the box loses focus', (typed, normalised) => {
    const { setTime } = cellA({ time: { 1: typed } })
    fireEvent.blur(screen.getByRole('textbox'))
    expect(setTime.mock.calls[0][0]({})).toEqual({ 1: normalised })
  })

  it('leaves a value that already has a colon alone', () => {
    const { setTime } = cellA({ time: { 1: '3:12' } })
    fireEvent.blur(screen.getByRole('textbox'))
    expect(setTime).not.toHaveBeenCalled()
  })

  it('leaves a value it cannot read alone', () => {
    const { setTime } = cellA({ time: { 1: '1234567' } })
    fireEvent.blur(screen.getByRole('textbox'))
    expect(setTime).not.toHaveBeenCalled()
  })

  it('hides the tiebreak box until the workout asks for one', () => {
    cellA({ time: { 1: '3:12' } })
    expect(screen.queryByText('TB:')).not.toBeInTheDocument()
  })

  it('shows a tiebreak box of the workouts own type', () => {
    cellA({ tiebreakEnabled: true, tiebreakScoreType: 'reps', tiebreak: { 1: '55' } })
    expect(screen.getByText('TB:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('55')).toBeInTheDocument()
  })

  // Every box in the grid is one roving-tabindex group, so arrow keys walk the
  // column the way a scorekeeper expects.
  it('joins every box to the workout-scores keyboard group', () => {
    const { container } = render(
      <PartAInputCell
        athleteId={1} scoreType="time"
        time={{}} setTime={vi.fn()} rr={{}} setRr={vi.fn()} weight={{}} setWeight={vi.fn()}
        tiebreakEnabled tiebreakScoreType="time" tiebreak={{}} setTiebreak={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('[data-keynav-group="workout-scores"]')).toHaveLength(2)
  })
})

describe('the part B cell', () => {
  it('draws its own score type, not part As', () => {
    render(
      <PartBInputCell
        athleteId={1} scoreType="rounds_reps"
        time={{}} setTime={vi.fn()}
        rr={{ 1: { rounds: '2', reps: '9' } }} setRr={vi.fn()}
        weight={{}} setWeight={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('9')).toBeInTheDocument()
  })

  it('has no tiebreak box of its own', () => {
    render(
      <PartBInputCell
        athleteId={1} scoreType="time"
        time={{ 1: '1:00' }} setTime={vi.fn()} rr={{}} setRr={vi.fn()} weight={{}} setWeight={vi.fn()}
      />,
    )
    expect(screen.queryByText('TB:')).not.toBeInTheDocument()
  })
})
