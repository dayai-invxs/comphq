import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkoutDraft } from '@/api/workouts'
import { AddWorkoutForm } from './AddWorkoutForm'

const LOCATIONS = [
  { id: 3, name: 'Main Floor' },
  { id: 4, name: 'Outdoor Rig' },
]

interface Over {
  open?: boolean
  locations?: { id: number; name: string }[]
  saving?: boolean
  error?: unknown
}

function form(over: Over = {}) {
  const onCreate = vi.fn<(draft: WorkoutDraft) => void>()
  const onClose = vi.fn()
  render(
    <AddWorkoutForm
      open={over.open ?? true}
      locations={over.locations ?? []}
      saving={over.saving ?? false}
      error={over.error ?? null}
      onClose={onClose}
      onCreate={onCreate}
    />,
  )
  return { onCreate, onClose }
}

/** Everything the form draws is inside the sheet, and the sheet is what the
    page opens — so a query that cannot find it there is a real failure. */
const sheet = () => within(screen.getByRole('dialog', { name: 'Add workout' }))

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(sheet().getByLabelText(label), { target: { value } })

const submit = () => fireEvent.click(sheet().getByRole('button', { name: 'Create Workout' }))

function fillRequired() {
  type(/^Workout #/, '3')
  type(/^Name/, 'Fran')
}

describe('when it is on screen', () => {
  it('stays shut until the page opens it', () => {
    form({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Workout #/)).not.toBeInTheDocument()
  })

  it('names itself by what it is doing', () => {
    form()
    expect(screen.getByRole('dialog', { name: 'Add workout' })).toBeInTheDocument()
  })

  it('leaves without creating when it is dismissed', () => {
    const { onCreate, onClose } = form()
    fillRequired()
    fireEvent.click(sheet().getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('offers a way out from its header as well', () => {
    const { onClose } = form()
    fireEvent.click(sheet().getByRole('button', { name: 'Close add workout' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('what the form asks for', () => {
  // v1 shipped every box with a value in it, so a create carries a whole
  // workout even when the operator only typed a number and a name.
  it('starts on v1s defaults', () => {
    form()
    expect(sheet().getByLabelText(/^Score Type/)).toHaveValue('time')
    expect(sheet().getByLabelText(/^Lanes/)).toHaveValue(5)
    expect(sheet().getByLabelText(/^Heat Interval/)).toHaveValue('10:00')
    expect(sheet().getByLabelText(/^Time Between Heats/)).toHaveValue('2:00')
    expect(sheet().getByLabelText(/^Corral Call/)).toHaveValue('10:00')
    expect(sheet().getByLabelText(/^Walk Out/)).toHaveValue('2:00')
    expect(sheet().getByRole('switch', { name: /Mixed Heats/ })).toBeChecked()
    expect(sheet().getByRole('switch', { name: /Tie Break Score/ })).not.toBeChecked()
    expect(sheet().getByRole('switch', { name: /Part A \/ Part B/ })).not.toBeChecked()
    expect(sheet().getByRole('switch', { name: /Half Weight/ })).not.toBeChecked()
  })

  it('will not create without a number and a name', () => {
    form()
    expect(sheet().getByRole('button', { name: 'Create Workout' })).toBeDisabled()
    type(/^Workout #/, '3')
    expect(sheet().getByRole('button', { name: 'Create Workout' })).toBeDisabled()
    type(/^Name/, 'Fran')
    expect(sheet().getByRole('button', { name: 'Create Workout' })).toBeEnabled()
  })

  // v1 drew the location select only when the competition had locations to
  // pick from.
  it('offers a location only when there is one', () => {
    form()
    expect(sheet().queryByLabelText(/^Location/)).not.toBeInTheDocument()
  })

  it('lists the locations it was given, and no location', () => {
    form({ locations: LOCATIONS })
    expect(sheet().getByRole('option', { name: 'No location' })).toBeInTheDocument()
    expect(sheet().getByRole('option', { name: 'Main Floor' })).toBeInTheDocument()
  })

  // The second score type only matters once the workout has a second score.
  it('asks for the tiebreak score type only once tiebreak is on', () => {
    form()
    expect(sheet().queryByLabelText(/^Tie Break Score Type/)).not.toBeInTheDocument()
    fireEvent.click(sheet().getByRole('switch', { name: /Tie Break Score/ }))
    expect(sheet().getByLabelText(/^Tie Break Score Type/)).toBeInTheDocument()
  })

  it('asks for the Part B score type only once Part B is on', () => {
    form()
    expect(sheet().queryByLabelText(/^Part B Score Type/)).not.toBeInTheDocument()
    fireEvent.click(sheet().getByRole('switch', { name: /Part A \/ Part B/ }))
    expect(sheet().getByLabelText(/^Part B Score Type/)).toBeInTheDocument()
  })
})

describe('what it sends', () => {
  it('sends the whole workout, defaults included', () => {
    const { onCreate } = form()
    fillRequired()
    submit()
    expect(onCreate).toHaveBeenCalledWith({
      number: 3,
      name: 'Fran',
      description: null,
      scoreType: 'time',
      lanes: 5,
      heatIntervalSecs: 600,
      timeBetweenHeatsSecs: 120,
      callTimeSecs: 600,
      walkoutTimeSecs: 120,
      startTime: null,
      mixedHeats: true,
      tiebreakEnabled: false,
      tiebreakScoreType: 'time',
      partBEnabled: false,
      partBScoreType: 'time',
      halfWeight: false,
      locationId: null,
    })
  })

  // The button lives in the sheet's footer, outside the form it submits, so
  // it is tied back to it by id — and that tie is what carries the create.
  it('submits from the footer, which is outside the form', () => {
    const { onCreate } = form()
    fillRequired()
    expect(sheet().getByRole('button', { name: 'Create Workout' })).toHaveAttribute(
      'form',
      'add-workout',
    )
    submit()
    expect(onCreate).toHaveBeenCalled()
  })

  it('trims the name, as v1 did', () => {
    const { onCreate } = form()
    type(/^Workout #/, '3')
    type(/^Name/, '  Fran  ')
    submit()
    expect(onCreate.mock.calls[0][0].name).toBe('Fran')
  })

  // COM-111. The description can be written at create, not only on edit.
  it('sends the description, trimmed', () => {
    const { onCreate } = form()
    fillRequired()
    type(/^Description/, '  21-15-9 thrusters and pull-ups  ')
    submit()
    expect(onCreate.mock.calls[0][0].description).toBe('21-15-9 thrusters and pull-ups')
  })

  // The four clock boxes are minutes:seconds and the API stores seconds.
  it('sends the clock boxes as seconds', () => {
    const { onCreate } = form()
    fillRequired()
    type(/^Heat Interval/, '12:30')
    type(/^Corral Call/, '5')
    submit()
    expect(onCreate.mock.calls[0][0].heatIntervalSecs).toBe(750)
    expect(onCreate.mock.calls[0][0].callTimeSecs).toBe(300)
  })

  // datetime-local is local time; the API wants RFC3339.
  it('sends a start time as an instant, and no start time as null', () => {
    const { onCreate } = form()
    fillRequired()
    type(/^Start Time/, '2026-06-01T09:30')
    submit()
    expect(onCreate.mock.calls[0][0].startTime).toBe(new Date('2026-06-01T09:30').toISOString())
  })

  it('sends the picked location as a number', () => {
    const { onCreate } = form({ locations: LOCATIONS })
    fillRequired()
    type(/^Location/, '4')
    submit()
    expect(onCreate.mock.calls[0][0].locationId).toBe(4)
  })

  // v1 kept sending the second score types after their switch went back off,
  // and the route defaults them anyway. What the switch decides is the flag.
  it('sends the switches it was left with', () => {
    const { onCreate } = form()
    fillRequired()
    fireEvent.click(sheet().getByRole('switch', { name: /Mixed Heats/ }))
    fireEvent.click(sheet().getByRole('switch', { name: /Half Weight/ }))
    submit()
    expect(onCreate.mock.calls[0][0].mixedHeats).toBe(false)
    expect(onCreate.mock.calls[0][0].halfWeight).toBe(true)
  })
})

describe('when the server refuses', () => {
  // A duplicate workout number answers 409 with a sentence worth reading.
  // It is drawn in the sheet because that is where the values that caused it
  // still are, and the sheet stays open so they can be changed.
  it('shows what it refused, beside what was typed', () => {
    form({ error: new Error('Workout number 3 already exists in this competition.') })
    expect(sheet().getByRole('alert')).toHaveTextContent(
      'Workout number 3 already exists in this competition.',
    )
    expect(sheet().getByLabelText(/^Workout #/)).toBeInTheDocument()
  })

  it('says it is working while the create is out', () => {
    form({ saving: true })
    expect(sheet().getByRole('button', { name: 'Creating...' })).toBeInTheDocument()
  })
})
