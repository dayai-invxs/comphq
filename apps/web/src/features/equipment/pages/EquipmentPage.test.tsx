import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { EquipmentPage } from './EquipmentPage'

const { apiGet, apiPatch, useSession, useRealtimeInvalidation } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  useSession: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPatch }))
vi.mock('@/lib/session', () => ({ useSession }))
vi.mock('@/lib/useRealtimeInvalidation', () => ({ useRealtimeInvalidation }))

const entry = (athleteId: number, lane: number, divisionName: string | null) => ({ athleteId, lane, divisionName })

const OPS = {
  showBib: false,
  workouts: [
    {
      id: 7,
      number: 1,
      name: 'Fran',
      status: 'active',
      heats: [
        { heatNumber: 1, isComplete: false, entries: [entry(1, 1, 'Rx'), entry(2, 2, 'Scaled')] },
        { heatNumber: 2, isComplete: true, entries: [entry(3, 1, 'Rx')] },
      ],
    },
    { id: 8, number: 2, name: 'Grace', status: 'draft', heats: [] },
  ],
}

const EQUIPMENT = [
  { id: 11, item: 'Barbell 43kg', divisionId: 3, division: { id: 3, name: 'Rx' } },
  { id: 12, item: 'Chalk', divisionId: null, division: null },
]

function serve({ ops = OPS, checks = { athleteChecks: {}, equipChecks: {} }, equipment = EQUIPMENT } = {}) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(ops)
    if (path.startsWith('/api/checks')) return Promise.resolve(checks)
    if (path.includes('/equipment')) return Promise.resolve(equipment)
    return Promise.resolve({ url: null })
  })
  apiPatch.mockResolvedValue({})
}

function mount() {
  return renderRoutes(<Route path=":slug" element={<EquipmentPage />} />, ['/summer'])
}

/** One heat, which is the unit of work: the crew sets a rig heat by heat. */
async function heat(number: number, workout = 'Fran') {
  const panel = await screen.findByRole('region', { name: new RegExp(workout) })
  return within(await within(panel).findByRole('group', { name: `Heat ${number}` }))
}

async function expand(number: number, workout = 'Fran') {
  const row = await heat(number, workout)
  fireEvent.click(row.getByRole('button', { name: 'Show kit' }))
  return row
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.setItem('judgeUnlocked', '1')
  useSession.mockReturnValue({ user: null, loading: false, signOut: vi.fn() })
  serve()
})

describe('EquipmentPage', () => {
  it('asks for the judge password before showing anything', async () => {
    sessionStorage.clear()
    mount()
    expect(await screen.findByRole('heading', { name: 'Equipment Control' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('announces that it is loading until the workouts arrive', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  // A station screen: one job, and one way out of it.
  it('carries no competition navigation, only a way back', async () => {
    mount()
    await heat(1)
    expect(screen.queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to competition' })).toBeInTheDocument()
  })

  it('lists a heat with a checkbox per division on the floor', async () => {
    mount()
    const first = await heat(1)
    expect(first.getByRole('checkbox', { name: 'Rx' })).toBeInTheDocument()
    expect(first.getByRole('checkbox', { name: 'Scaled' })).toBeInTheDocument()
  })

  it('says when a workout has no heats yet', async () => {
    mount()
    expect(await screen.findByText('No heats assigned.')).toBeInTheDocument()
  })

  it('marks the heat that has already run', async () => {
    mount()
    expect((await heat(2)).getByText('Run')).toBeInTheDocument()
    expect((await heat(1)).queryByText('Run')).not.toBeInTheDocument()
  })

  it('marks a heat whose every division is ticked', async () => {
    serve({ checks: { athleteChecks: {}, equipChecks: { '7-1-Rx': true, '7-1-Scaled': true } } })
    mount()
    expect((await heat(1)).getByText('Set')).toBeInTheDocument()
  })

  // Nothing left to set up for a workout that is over.
  it('drops a workout whose heats are all complete', async () => {
    serve({
      ops: {
        showBib: false,
        workouts: [{ id: 7, number: 1, name: 'Fran', status: 'completed', heats: [{ heatNumber: 1, isComplete: true, entries: [entry(1, 1, 'Rx')] }] }],
      },
    })
    mount()
    expect(await screen.findByText('Nothing left to set')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Fran/ })).not.toBeInTheDocument()
  })

  it('shows the ticks it was left with', async () => {
    serve({ checks: { athleteChecks: {}, equipChecks: { '7-1-Rx': true } } })
    mount()
    const first = await heat(1)
    expect(first.getByRole('checkbox', { name: 'Rx' })).toBeChecked()
    expect(first.getByRole('checkbox', { name: 'Scaled' })).not.toBeChecked()
  })

  it('sends a tick keyed by workout, heat and division', async () => {
    mount()
    const first = await heat(1)
    fireEvent.click(first.getByRole('checkbox', { name: 'Rx' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', {
        slug: 'summer',
        type: 'equipment',
        entry: { key: '7-1-Rx', value: true },
      }),
    )
    expect(first.getByRole('checkbox', { name: 'Rx' })).toBeChecked()
  })

  it('keys an athlete with no division apart from the named ones', async () => {
    serve({
      ops: {
        showBib: false,
        workouts: [{ id: 7, number: 1, name: 'Fran', status: 'active', heats: [{ heatNumber: 1, isComplete: false, entries: [entry(1, 1, null)] }] }],
      },
    })
    mount()
    const first = await heat(1)
    fireEvent.click(first.getByRole('checkbox', { name: 'No Division' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', expect.objectContaining({
        entry: { key: '7-1-__none__', value: true },
      })),
    )
  })

  it('says so when a heat has nobody in it', async () => {
    serve({
      ops: {
        showBib: false,
        workouts: [{ id: 7, number: 1, name: 'Fran', status: 'active', heats: [{ heatNumber: 1, isComplete: false, entries: [] }] }],
      },
    })
    mount()
    expect((await heat(1)).getByText('No athletes assigned')).toBeInTheDocument()
  })

  // A failed read is not an empty floor, and it must not shimmer for ever.
  it('says the read failed rather than shimmering for ever', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the heats')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  it('clears every tick on reset, once the person confirms', async () => {
    serve({ checks: { athleteChecks: {}, equipChecks: { '7-1-Rx': true } } })
    mount()
    await heat(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset checks' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', expect.objectContaining({ checks: {} })),
    )
  })

  it('leaves the ticks alone when the person declines', async () => {
    serve({ checks: { athleteChecks: {}, equipChecks: { '7-1-Rx': true } } })
    mount()
    await heat(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(apiPatch).not.toHaveBeenCalled()
  })

  // The tick stays where the finger put it — that part is deliberate — but the
  // crew must know the server never heard it.
  it('warns when a tick did not reach the server', async () => {
    mount()
    const first = await heat(1)
    apiPatch.mockRejectedValue(new Error('nope'))
    fireEvent.click(first.getByRole('checkbox', { name: 'Rx' }))
    expect(await screen.findByText(/Checks not saved/)).toBeInTheDocument()
  })

  it('holds the reset prompt open when the clear is refused', async () => {
    serve({ checks: { athleteChecks: {}, equipChecks: { '7-1-Rx': true } } })
    mount()
    await heat(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const dialog = await screen.findByRole('alertdialog')
    apiPatch.mockRejectedValue(new Error('nope'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset checks' }))
    await waitFor(() => expect(apiPatch).toHaveBeenCalled())
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('asks before clearing rather than clearing on the tap', async () => {
    mount()
    await heat(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await screen.findByRole('alertdialog')
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('shows the equipment and the lanes behind an expander', async () => {
    mount()
    const first = await heat(1)
    expect(first.queryByText('Barbell 43kg')).not.toBeInTheDocument()
    fireEvent.click(first.getByRole('button', { name: 'Show kit' }))
    expect(first.getByText('Barbell 43kg')).toBeInTheDocument()
    expect(first.getByText('Lane 1')).toBeInTheDocument()
    fireEvent.click(first.getByRole('button', { name: 'Hide kit' }))
    expect(first.queryByText('Barbell 43kg')).not.toBeInTheDocument()
  })

  // An item with no division belongs to everyone in the heat, and is marked so
  // nobody carries two of them out.
  it('repeats an all-divisions item under each division and marks it', async () => {
    mount()
    const first = await expand(1)
    expect(first.getAllByText('Chalk')).toHaveLength(2)
    expect(first.getAllByText('(all)')).toHaveLength(2)
  })

  it('leaves an all-divisions item unmarked when the heat has only one division', async () => {
    mount()
    const second = await expand(2)
    expect(second.getByText('Chalk')).toBeInTheDocument()
    expect(second.queryByText('(all)')).not.toBeInTheDocument()
  })

  it('says when a division has nothing listed', async () => {
    serve({ equipment: [] })
    mount()
    const first = await expand(1)
    expect(first.getAllByText('No equipment listed')).toHaveLength(2)
  })

  it('refreshes on a live event for this competition', async () => {
    mount()
    await heat(1)
    expect(useRealtimeInvalidation).toHaveBeenCalledWith([['ops', 'summer'], ['checks', 'summer']])
  })
})
