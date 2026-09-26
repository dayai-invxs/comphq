import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { WorkoutsAdminPage } from './WorkoutsAdminPage'

const { apiGet, apiPost, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPatch }))

const WORKOUTS = [
  { id: 11, number: 1, name: 'Fran', scoreType: 'time', lanes: 5, status: 'completed' },
  { id: 12, number: 2, name: 'Grace', scoreType: 'weight', lanes: 6, status: 'draft' },
]
const LOCATIONS = [{ id: 3, name: 'Main Floor' }]
const SETTINGS = { tiebreakWorkoutId: 12 }
const EQUIPMENT = {
  items: [
    {
      item: 'Barbell',
      maxCount: 8,
      breakdown: [
        { workoutId: 12, workoutNumber: 2, workoutName: 'Grace', divisionNames: [null], maxCount: 8 },
      ],
    },
  ],
}

function serve(over: Record<string, unknown> = {}) {
  apiGet.mockImplementation((path: string) => {
    const answer = (key: string, value: unknown) =>
      key in over ? Promise.resolve(over[key]) : Promise.resolve(value)
    if (path.startsWith('/api/workouts')) return answer('workouts', WORKOUTS)
    if (path.startsWith('/api/workout-locations')) return answer('locations', LOCATIONS)
    if (path.startsWith('/api/settings')) return answer('settings', SETTINGS)
    if (path.startsWith('/api/equipment-summary')) return answer('equipment', EQUIPMENT)
    return Promise.resolve(null)
  })
}

function mount() {
  return renderRoutes(
    <Route path=":slug/admin/workouts" element={<WorkoutsAdminPage />} />,
    ['/summer/admin/workouts'],
  )
}

// The tiebreak select names workouts exactly as the list does, so the row is
// reached by the one thing only it is: a link to the workout's own screen.
const row = (name: RegExp) => screen.findByRole('link', { name })

/** Four regions on this screen carry the same controls as each other — two
    imports with a CSV box each — so each is reached through its own name. */
const region = (name: string) => within(screen.getByRole('region', { name }))

const sheet = () => within(screen.getByRole('dialog', { name: 'Add workout' }))

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(sheet().getByLabelText(label), { target: { value } })

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add workout' }))
}

async function fillAndCreate(number: string, name: string) {
  type(/^Workout #/, number)
  type(/^Name/, name)
  fireEvent.click(sheet().getByRole('button', { name: 'Create Workout' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiPost.mockResolvedValue({ id: 13 })
  apiPatch.mockResolvedValue(SETTINGS)
})

describe('the workout list', () => {
  it('reads the workouts for the competition in the address', async () => {
    mount()
    await row(/WOD 1: Fran/)
    expect(apiGet).toHaveBeenCalledWith('/api/workouts?slug=summer')
  })

  it('gives each workout its lanes, its score type and its status', async () => {
    mount()
    const fran = within((await row(/WOD 1: Fran/)).closest('tr') as HTMLElement)
    expect(fran.getByText('5')).toBeInTheDocument()
    expect(fran.getByText('Time')).toBeInTheDocument()
    expect(fran.getByText('Completed')).toBeInTheDocument()

    const grace = within((await row(/WOD 2: Grace/)).closest('tr') as HTMLElement)
    expect(grace.getByText('6')).toBeInTheDocument()
    expect(grace.getByText('Weight')).toBeInTheDocument()
    // The badge keeps v1's wording, typo included.
    expect(grace.getByText('INactive')).toBeInTheDocument()
  })

  it('links each workout to its own screen', async () => {
    mount()
    expect(await row(/WOD 1: Fran/)).toHaveAttribute('href', '/summer/admin/workouts/11')
  })

  it('says how many workouts the competition has', async () => {
    mount()
    expect(await screen.findByText('2 in this competition')).toBeInTheDocument()
  })

  // A bare "Loading…" tells nobody how much is coming. The shape of the table
  // is drawn while it is out, and the region says it is busy.
  it('holds the tables place while the read is out', () => {
    mount()
    expect(screen.getByText('Workouts', { selector: 'h1' })).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  // v1 drew an empty table under a heading, which reads as a failure rather
  // than as a competition nobody has set up yet.
  it('says what a workout is, and offers to add one, when there are none', async () => {
    serve({ workouts: [] })
    mount()
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Workouts' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add workout' })).toHaveLength(2)
  })
})

describe('adding a workout', () => {
  // v1 unfolded the form above the list, pushing what the screen is for below
  // the fold. It opens beside the list instead, and only when asked.
  it('opens the form only when asked', async () => {
    mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openForm()
    expect(sheet().getByLabelText(/^Workout #/)).toBeInTheDocument()
  })

  it('keeps the list on screen while the form is open', async () => {
    mount()
    await row(/WOD 1: Fran/)
    await openForm()
    expect(screen.getByRole('link', { name: /WOD 1: Fran/ })).toBeInTheDocument()
  })

  it('posts the draft with the competition it belongs to', async () => {
    mount()
    await openForm()
    await fillAndCreate('3', 'Diane')
    await waitFor(() => expect(apiPost).toHaveBeenCalled())
    expect(apiPost.mock.calls[0][0]).toBe('/api/workouts')
    expect(apiPost.mock.calls[0][1]).toMatchObject({ slug: 'summer', number: 3, name: 'Diane' })
  })

  it('shuts the form once the workout exists', async () => {
    mount()
    await openForm()
    await fillAndCreate('3', 'Diane')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // A duplicate number answers 409. v1 kept the form open with what was typed
  // still in it, and said what the server said.
  it('keeps the form open and says what the server refused', async () => {
    apiPost.mockRejectedValue(new Error('Workout number 1 already exists in this competition.'))
    mount()
    await openForm()
    await fillAndCreate('1', 'Fran')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workout number 1 already exists in this competition.',
    )
    expect(sheet().getByLabelText(/^Name/)).toHaveValue('Fran')
  })

  // The refusal belongs to the values that caused it, so reopening the form
  // for a different workout must not open it under the last one's error.
  it('does not reopen under the last refusal', async () => {
    apiPost.mockRejectedValue(new Error('Workout number 1 already exists in this competition.'))
    mount()
    await openForm()
    await fillAndCreate('1', 'Fran')
    await screen.findByRole('alert')
    fireEvent.click(sheet().getByRole('button', { name: 'Cancel' }))
    await openForm()
    expect(sheet().queryByRole('alert')).not.toBeInTheDocument()
  })

  // v1 drew the location select only when the competition had locations.
  it('offers the competitions locations', async () => {
    mount()
    await openForm()
    expect(await screen.findByRole('option', { name: 'Main Floor' })).toBeInTheDocument()
  })
})

describe('the tiebreaker', () => {
  it('shows the workout already designated', async () => {
    mount()
    await waitFor(() => expect(screen.getByLabelText('Tiebreak workout')).toHaveValue('12'))
  })

  // v1 saved on change, with no save button.
  it('saves a new pick straight away', async () => {
    mount()
    await waitFor(() => expect(screen.getByLabelText('Tiebreak workout')).toHaveValue('12'))
    fireEvent.change(screen.getByLabelText('Tiebreak workout'), { target: { value: '11' } })
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/settings', { slug: 'summer', tiebreakWorkoutId: 11 }),
    )
  })

  it('says so when the save is refused', async () => {
    apiPatch.mockRejectedValue(new Error('Forbidden'))
    mount()
    await waitFor(() => expect(screen.getByLabelText('Tiebreak workout')).toHaveValue('12'))
    fireEvent.change(screen.getByLabelText('Tiebreak workout'), { target: { value: '11' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Save tiebreaker: Forbidden')
  })
})

describe('the equipment master list', () => {
  // The walk across every workout's equipment is not what this screen is for,
  // so v1 put it behind a button and so does this.
  it('does not ask for the summary until it is asked for', async () => {
    mount()
    await row(/WOD 1: Fran/)
    expect(apiGet).not.toHaveBeenCalledWith(expect.stringContaining('/api/equipment-summary'))
    fireEvent.click(region('Equipment Master List').getByRole('button', { name: 'Load' }))
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/equipment-summary?slug=summer'),
    )
    expect(await screen.findByText('Barbell')).toBeInTheDocument()
  })
})

describe('the imports', () => {
  it('posts a pasted heat CSV to the heats route', async () => {
    mount()
    await row(/WOD 1: Fran/)
    const panel = region('Import Heat Assignments')
    fireEvent.change(panel.getByLabelText('CSV'), { target: { value: 'a,b' } })
    fireEvent.click(panel.getByRole('button', { name: 'Import' }))
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/import/heats', { slug: 'summer', csv: 'a,b' }),
    )
  })

  it('posts a pasted judge CSV to its own route', async () => {
    mount()
    await row(/WOD 1: Fran/)
    const panel = region('Import Judge Assignments')
    fireEvent.change(panel.getByLabelText('CSV'), { target: { value: 'c,d' } })
    fireEvent.click(panel.getByRole('button', { name: 'Import' }))
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/import/judge-assignments', {
        slug: 'summer',
        csv: 'c,d',
      }),
    )
  })
})

describe('when a read fails', () => {
  function refuseWorkouts() {
    apiGet.mockImplementation((path: string) => {
      if (path.startsWith('/api/workouts')) return Promise.reject(new Error('Forbidden'))
      return Promise.resolve([])
    })
  }

  it('says which read failed, in v1s wording', async () => {
    refuseWorkouts()
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Load workouts: Forbidden')
  })

  // The banner names the read that failed, not the nearest one: a locations
  // failure blamed on the workouts sends the admin to the wrong list.
  it('names the locations read when that is the one that failed', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.startsWith('/api/workout-locations')) return Promise.reject(new Error('Forbidden'))
      if (path.startsWith('/api/workouts')) return Promise.resolve(WORKOUTS)
      return Promise.resolve(SETTINGS)
    })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Load locations: Forbidden')
  })

  it('names the settings read when that is the one that failed', async () => {
    apiGet.mockImplementation((path: string) => {
      if (path.startsWith('/api/settings')) return Promise.reject(new Error('Forbidden'))
      if (path.startsWith('/api/workouts')) return Promise.resolve(WORKOUTS)
      return Promise.resolve(LOCATIONS)
    })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Load settings: Forbidden')
  })

  // v1's banner had a dismiss link on it.
  it('can be dismissed', async () => {
    refuseWorkouts()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // A failed read is not an empty competition, but the screen has to draw
  // something — and what it draws must not claim there are no workouts while
  // the banner says the list could not be read.
  it('reports the failure above whatever it draws in the lists place', async () => {
    refuseWorkouts()
    mount()
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Load workouts: Forbidden')
    expect(screen.getByText('No workouts yet')).toBeInTheDocument()
  })
})
