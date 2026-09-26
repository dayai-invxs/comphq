import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Workout } from '../../useWorkoutDetail'
import { WorkoutEditForm } from './WorkoutEditForm'

// v1: src/components/workout-detail/WorkoutEditForm.tsx. Every setting a
// workout has, in one form. What is worth pinning is the two conversions the
// form owns — m:ss to seconds and a local datetime to an ISO instant — and the
// three boxes that only exist once the toggle beside them is on.

const WORKOUT: Workout = {
  id: 7,
  number: 2,
  name: 'Fran',
  description: 'Thrusters and pull-ups',
  scoreType: 'time',
  lanes: 6,
  heatIntervalSecs: 615,
  timeBetweenHeatsSecs: 300,
  callTimeSecs: 305,
  walkoutTimeSecs: 120,
  startTime: '2026-06-01T10:00:00.000Z',
  status: 'active',
  mixedHeats: false,
  tiebreakEnabled: false,
  tiebreakScoreType: 'time',
  partBEnabled: false,
  partBScoreType: 'weight',
  halfWeight: false,
  locationId: null,
  heatStartOverrides: {},
  completedHeats: [],
  assignments: [],
  scores: [],
}

const LOCATIONS = [{ id: 3, name: 'Main Floor' }]

function mount(over: Partial<Parameters<typeof WorkoutEditForm>[0]> = {}) {
  const props = {
    workout: WORKOUT,
    loading: false,
    locations: [] as { id: number; name: string }[],
    onSave: vi.fn().mockResolvedValue(true),
    onCancel: vi.fn(),
    ...over,
  }
  render(<WorkoutEditForm {...props} />)
  return props
}

const saved = (props: ReturnType<typeof mount>) =>
  vi.mocked(props.onSave).mock.calls[0][0] as Record<string, unknown>

describe('what the form opens on', () => {
  it('fills every box from the workout', () => {
    mount()
    expect(screen.getByLabelText('Workout #')).toHaveValue(2)
    expect(screen.getByLabelText('Name')).toHaveValue('Fran')
    expect(screen.getByLabelText('Description')).toHaveValue('Thrusters and pull-ups')
    expect(screen.getByLabelText('Lanes')).toHaveValue(6)
    expect(screen.getByLabelText('Score Type')).toHaveValue('time')
  })

  // Stored seconds, read back as the m:ss the boxes are typed in.
  it('shows the four intervals as minutes and seconds', () => {
    mount()
    expect(screen.getByLabelText('Heat Interval')).toHaveValue('10:15')
    expect(screen.getByLabelText('Time Between Heats')).toHaveValue('5:00')
    expect(screen.getByLabelText('Corral Call (before heat)')).toHaveValue('5:05')
    expect(screen.getByLabelText('Walk Out (before heat)')).toHaveValue('2:00')
  })

  it('shows the start time in the browsers own clock', () => {
    mount()
    const d = new Date(WORKOUT.startTime!)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(screen.getByLabelText('Start Time')).toHaveValue(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    )
  })

  it('leaves the start time empty when the workout has none', () => {
    mount({ workout: { ...WORKOUT, startTime: null } })
    expect(screen.getByLabelText('Start Time')).toHaveValue('')
  })

  it('offers a location only where there are locations to offer', () => {
    mount()
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument()
    mount({ locations: LOCATIONS, workout: { ...WORKOUT, locationId: 3 } })
    expect(screen.getByLabelText('Location')).toHaveValue('3')
  })
})

describe('the settings that reveal another', () => {
  it('hides the tiebreak score type until the tiebreak is on', () => {
    mount()
    expect(screen.queryByLabelText('Tie Break Score Type')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Tie Break Score' }))
    expect(screen.getByLabelText('Tie Break Score Type')).toHaveValue('time')
  })

  it('hides the Part B score type until Part B is on', () => {
    mount()
    expect(screen.queryByLabelText('Part B Score Type')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Part A / Part B' }))
    expect(screen.getByLabelText('Part B Score Type')).toHaveValue('weight')
  })

  // v1 reworded the subtitle as the toggle moved — it is the only place the
  // form says what mixing heats does.
  it('says what mixed heats means either way', () => {
    mount()
    expect(screen.getByText('Each heat contains only one division')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Mixed Heats' }))
    expect(screen.getByText('Athletes from different divisions can share a heat')).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('sends every setting, with the intervals back in seconds', async () => {
    const props = mount({ locations: LOCATIONS })
    fireEvent.change(screen.getByLabelText('Heat Interval'), { target: { value: '7:30' } })
    fireEvent.change(screen.getByLabelText('Lanes'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(saved(props)).toEqual({
      name: 'Fran',
      description: 'Thrusters and pull-ups',
      number: 2,
      scoreType: 'time',
      lanes: 8,
      heatIntervalSecs: 450,
      timeBetweenHeatsSecs: 300,
      callTimeSecs: 305,
      walkoutTimeSecs: 120,
      startTime: WORKOUT.startTime,
      mixedHeats: false,
      tiebreakEnabled: false,
      tiebreakScoreType: 'time',
      partBEnabled: false,
      partBScoreType: 'weight',
      halfWeight: false,
      locationId: 3,
    })
  })

  it('trims the name and turns an emptied description into no description', async () => {
    const props = mount()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Grace  ' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(saved(props).name).toBe('Grace')
    expect(saved(props).description).toBeNull()
  })

  it('sends no location as no location, not as zero', async () => {
    const props = mount({ locations: LOCATIONS })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(saved(props).locationId).toBeNull()
  })

  it('closes the form once the save lands', async () => {
    const props = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(props.onCancel).toHaveBeenCalled())
  })

  // A rejected save leaves the form open with what was typed still in it.
  it('stays open when the save is refused', async () => {
    const props = mount({ onSave: vi.fn().mockResolvedValue(false) })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(props.onSave).toHaveBeenCalled())
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('says it is saving and refuses a second submit', () => {
    mount({ loading: true })
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  })

  it('leaves without saving on either cancel', () => {
    const props = mount()
    for (const button of screen.getAllByRole('button', { name: 'Cancel' })) fireEvent.click(button)
    expect(props.onCancel).toHaveBeenCalledTimes(2)
    expect(props.onSave).not.toHaveBeenCalled()
  })
})
