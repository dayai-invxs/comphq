import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { fmtHeatTime } from '@/lib/heatTime'
import { AthleteControlPage } from './AthleteControlPage'

const { apiGet, apiPatch, apiPut, useRealtimeInvalidation } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  useRealtimeInvalidation: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPatch, apiPut }))
vi.mock('@/lib/useRealtimeInvalidation', () => ({ useRealtimeInvalidation }))

const START = Date.parse('2026-08-26T09:00:00.000Z')

const entry = (athleteId: number, athleteName: string, lane: number) =>
  ({ athleteId, athleteName, bibNumber: null, divisionName: 'Rx', lane })

const WORKOUT = {
  id: 7,
  number: 1,
  name: 'Fran',
  status: 'active',
  locationName: null,
  startTime: '2026-08-26T09:00:00.000Z',
  heatIntervalSecs: 600,
  timeBetweenHeatsSecs: 0,
  callTimeSecs: 300,
  walkoutTimeSecs: 120,
  heatStartOverrides: {},
  heats: [
    { heatNumber: 1, isComplete: false, entries: [entry(2, 'Bob Brown', 3), entry(1, 'Ada Ant', 1)] },
    { heatNumber: 2, isComplete: true, entries: [entry(3, 'Cy Cat', 1)] },
  ],
}

// The second workout starts four hours later and has no heats yet, so nothing
// in this fixture collides.
const OPS = {
  showBib: false,
  workouts: [
    WORKOUT,
    { ...WORKOUT, id: 8, number: 2, name: 'Grace', startTime: '2026-08-26T13:00:00.000Z', heats: [] },
  ],
}

const CHECKS = { athleteChecks: {}, equipChecks: {} }

function serve(ops: unknown = OPS, checks: unknown = CHECKS) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/ops')) return Promise.resolve(ops)
    if (path.startsWith('/api/checks')) return Promise.resolve(checks)
    return Promise.resolve({ url: null })
  })
  apiPatch.mockResolvedValue({})
  apiPut.mockResolvedValue({})
}

function mount() {
  return renderRoutes(<Route path=":slug/control" element={<AthleteControlPage />} />, ['/summer/control'])
}

// The heats are rows of a DataTable; the first row is the header, so the
// numbered heats start one row down.
async function heatRow(number: number, workout = 1) {
  const table = await screen.findByRole('table', { name: `Workout ${workout} heats` })
  const rows = within(table).getAllByRole('row')
  return rows[number] as HTMLElement
}

function localHHMM(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

beforeEach(() => {
  vi.clearAllMocks()
  serve()
})

describe('AthleteControlPage', () => {
  it('reads the ops and check state for the slug in the address', async () => {
    mount()
    await screen.findByRole('region', { name: 'Workout 1: Fran' })
    expect(apiGet).toHaveBeenCalledWith('/api/ops?slug=summer')
    expect(apiGet).toHaveBeenCalledWith('/api/checks?slug=summer')
  })

  // v1 keyed this off an empty workout list rather than the query state, so a
  // competition with no workouts at all says it is loading forever.
  it('announces that it is loading until the first workout arrives', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('says so when there is no workout at all', async () => {
    serve({ showBib: false, workouts: [] })
    mount()
    expect(await screen.findByText('Nothing to run yet')).toBeInTheDocument()
  })

  // A failed read is not an empty desk, and it must not shimmer for ever.
  it('says the read failed rather than shimmering for ever', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the heats')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument()
  })

  // A station screen: one job, and one way out of it.
  it('carries no competition navigation, only a way back', async () => {
    mount()
    await screen.findByRole('region', { name: 'Workout 1: Fran' })
    expect(screen.queryByRole('link', { name: 'Leaderboard' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to competition' })).toBeInTheDocument()
  })

  it('lists every workout, whatever its status', async () => {
    mount()
    expect(await screen.findByRole('region', { name: 'Workout 1: Fran' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workout 2: Grace' })).toBeInTheDocument()
  })

  it('says so when a workout has no heats', async () => {
    mount()
    expect(await screen.findByText('No heats assigned.')).toBeInTheDocument()
  })

  // The heats went back to being a table — DataTable owns the columns and
  // their alignment, and the header names the corral, the walk-out and the
  // start once for every heat under it. The table pans on a narrow screen;
  // that trade was taken knowingly when the hand-rolled grid went.
  it('draws the heats as a table whose header names the columns', async () => {
    mount()
    const table = await screen.findByRole('table', { name: 'Workout 1 heats' })
    for (const name of ['Heat', 'Corral', 'Walk Out', 'Start']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument()
    }
  })

  it('counts the corral and walk-out back from the heat start', async () => {
    mount()
    const row = within(await heatRow(1))
    expect(row.getByText(fmtHeatTime(START - 300_000))).toBeInTheDocument()
    expect(row.getByText(fmtHeatTime(START - 120_000))).toBeInTheDocument()
    expect(row.getByText(fmtHeatTime(START))).toBeInTheDocument()
    // Heat 2 is one interval later.
    expect(within(await heatRow(2)).getByText(fmtHeatTime(START + 600_000))).toBeInTheDocument()
  })

  it('marks a heat that has been scored', async () => {
    mount()
    expect(within(await heatRow(2)).getByText('Complete')).toBeInTheDocument()
    expect(within(await heatRow(1)).queryByText('Complete')).not.toBeInTheDocument()
  })

  it('sends the heat\'s check record when a corral is ticked', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('checkbox', { name: 'Corral heat 1' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', {
        slug: 'summer',
        type: 'athlete',
        entry: { key: '7-1', value: { corral: true, walkout: false } },
      }),
    )
  })

  it('leaves a tick already on the record alone', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: false } }, equipChecks: {} })
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('checkbox', { name: 'Walk Out heat 1' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', {
        slug: 'summer',
        type: 'athlete',
        entry: { key: '7-1', value: { corral: true, walkout: true } },
      }),
    )
  })

  it('unticks a box that was already ticked', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: true } }, equipChecks: {} })
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('checkbox', { name: 'Corral heat 1' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', {
        slug: 'summer',
        type: 'athlete',
        entry: { key: '7-1', value: { corral: false, walkout: true } },
      }),
    )
  })

  // The cache is written first and the request follows. React Query hands the
  // new value to its observers on the next tick, which is what waitFor is for.
  it('shows the tick before the server has answered', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('checkbox', { name: 'Corral heat 1' }))
    await waitFor(async () =>
      expect(within(await heatRow(1)).getByRole('checkbox', { name: 'Corral heat 1' })).toBeChecked())
    expect(apiPatch).toHaveBeenCalled()
  })

  // A heat that has been called and walked out is behind the desk now. The two
  // ticks are the fact; the table receding the row is drawn on top of it.
  it('holds both ticks for a heat that has been called and walked out', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: true } }, equipChecks: {} })
    mount()
    const done = within(await heatRow(1))
    expect(done.getByRole('checkbox', { name: 'Corral heat 1' })).toBeChecked()
    expect(done.getByRole('checkbox', { name: 'Walk Out heat 1' })).toBeChecked()
    expect(within(await heatRow(2)).getByRole('checkbox', { name: 'Corral heat 2' })).not.toBeChecked()
  })

  it('asks before clearing every check rather than clearing on the tap', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: true } }, equipChecks: {} })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    await screen.findByRole('alertdialog')
    expect(apiPatch).not.toHaveBeenCalled()
  })

  it('clears every check once the question is answered', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: true } }, equipChecks: {} })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset checks' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', { slug: 'summer', type: 'athlete', checks: {} }),
    )
  })

  it('clears nothing when the question is declined', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(apiPatch).not.toHaveBeenCalled()
  })

  // The lanes hang off the row in a popover now — an inline sub-row cannot
  // live inside a table row, and the lanes are a detail to glance at rather
  // than a column to compare.
  it('keeps the lanes folded away until they are asked for', async () => {
    mount()
    const row = within(await heatRow(1))
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
    fireEvent.click(row.getByRole('button', { name: 'Lanes' }))
    expect(row.getByRole('button', { name: 'Lanes' })).toHaveAttribute('aria-expanded', 'true')
    const panel = within(await screen.findByRole('dialog', { name: 'Heat 1 lanes' }))
    const items = panel.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Lane 1')
    expect(items[0]).toHaveTextContent('Ada Ant')
    expect(items[1]).toHaveTextContent('Lane 3')
    expect(items[1]).toHaveTextContent('Bob Brown')
  })

  it('folds them away again', async () => {
    mount()
    const row = within(await heatRow(1))
    fireEvent.click(row.getByRole('button', { name: 'Lanes' }))
    await screen.findByRole('dialog', { name: 'Heat 1 lanes' })
    fireEvent.click(row.getByRole('button', { name: 'Lanes' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Heat 1 lanes' })).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Ada Ant')).not.toBeInTheDocument()
  })

  it('offers no lane list for a heat nobody is in', async () => {
    serve({
      showBib: false,
      workouts: [{ ...WORKOUT, heats: [{ heatNumber: 1, isComplete: false, entries: [] }] }],
    })
    mount()
    expect(within(await heatRow(1)).queryByRole('button', { name: 'Lanes' })).not.toBeInTheDocument()
  })

  it('opens the start time on the value it already holds', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    expect(within(await heatRow(1)).getByLabelText('Heat 1 start time')).toHaveValue(
      localHHMM(START),
    )
  })

  it('saves a new start time against the day the heat already ran on', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    const input = within(await heatRow(1)).getByLabelText('Heat 1 start time')
    fireEvent.change(input, { target: { value: '10:30' } })
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Save' }))

    const base = new Date(START)
    const expected = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 30, 0, 0)
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith('/api/workouts/7/heat-times?slug=summer', {
        heatNumber: 1,
        isoTime: expected.toISOString(),
      }),
    )
  })

  it('reads the heats again once a time has moved', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    const before = apiGet.mock.calls.filter((c) => String(c[0]).startsWith('/api/ops')).length
    fireEvent.change(within(await heatRow(1)).getByLabelText('Heat 1 start time'), {
      target: { value: '10:30' },
    })
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiGet.mock.calls.filter((c) => String(c[0]).startsWith('/api/ops')).length)
        .toBeGreaterThan(before),
    )
    expect(within(await heatRow(1)).queryByLabelText('Heat 1 start time')).not.toBeInTheDocument()
  })

  it('presses Enter to save', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    const input = within(await heatRow(1)).getByLabelText('Heat 1 start time')
    fireEvent.change(input, { target: { value: '10:30' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(apiPut).toHaveBeenCalled())
  })

  it('presses Escape to give up', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    fireEvent.keyDown(within(await heatRow(1)).getByLabelText('Heat 1 start time'), {
      key: 'Escape',
    })
    expect(within(await heatRow(1)).queryByLabelText('Heat 1 start time')).not.toBeInTheDocument()
    expect(apiPut).not.toHaveBeenCalled()
  })

  it('cancels an edit outright', async () => {
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Cancel' }))
    expect(within(await heatRow(1)).queryByLabelText('Heat 1 start time')).not.toBeInTheDocument()
    expect(apiPut).not.toHaveBeenCalled()
  })

  it('offers no edit for a heat with no start time at all', async () => {
    serve({ showBib: false, workouts: [{ ...WORKOUT, startTime: null }] })
    mount()
    expect(within(await heatRow(1)).queryByRole('button', { name: 'Edit heat 1 start time' })).not.toBeInTheDocument()
  })

  // v1 drew a red border and nothing else, which says nothing to a reader who
  // cannot see it. The fact is the same; it is now written down.
  it('names a heat that collides with the workout beside it', async () => {
    serve({
      showBib: false,
      workouts: [WORKOUT, { ...WORKOUT, id: 8, number: 2, name: 'Grace' }],
    })
    mount()
    expect(within(await heatRow(1, 2)).getByText('Overlap')).toBeInTheDocument()
  })

  // COM-117. The badge sits in one cell and is easy to miss on a long table;
  // the whole row takes the danger tint as well.
  it('tints a colliding heat red across the row', async () => {
    serve({
      showBib: false,
      workouts: [WORKOUT, { ...WORKOUT, id: 8, number: 2, name: 'Grace' }],
    })
    mount()
    expect((await heatRow(1, 2)).className).toMatch(/danger/)
  })

  it('leaves a heat that collides with nothing untinted', async () => {
    mount()
    expect((await heatRow(1)).className).not.toMatch(/danger/)
  })

  it('says nothing about a heat that collides with nothing', async () => {
    mount()
    expect(within(await heatRow(1)).queryByText('Overlap')).not.toBeInTheDocument()
  })

  // v1 subscribed to the heats and left checks to the three-second poll. The
  // poll is now a 15s safety net, so a tick made on another phone has to
  // arrive over the socket: both keys subscribe.
  it('subscribes to the heats it draws and the checks it ticks', async () => {
    mount()
    await screen.findByRole('region', { name: 'Workout 1: Fran' })
    expect(useRealtimeInvalidation).toHaveBeenCalledWith([['ops', 'summer'], ['checks', 'summer']])
  })

  // The tick stays where the finger put it — that part is deliberate — but the
  // desk must know the server never heard it.
  it('warns when a tick did not reach the server', async () => {
    mount()
    apiPatch.mockRejectedValue(new Error('nope'))
    fireEvent.click(within(await heatRow(1)).getByRole('checkbox', { name: 'Corral heat 1' }))
    expect(await screen.findByText(/Checks not saved/)).toBeInTheDocument()
  })

  it('holds the reset prompt open when the clear is refused', async () => {
    serve(OPS, { athleteChecks: { '7-1': { corral: true, walkout: true } }, equipChecks: {} })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    const dialog = await screen.findByRole('alertdialog')
    apiPatch.mockRejectedValue(new Error('nope'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset checks' }))
    await waitFor(() => expect(apiPatch).toHaveBeenCalled())
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('says why when a moved start time is refused, and keeps the editor open', async () => {
    apiPut.mockRejectedValue(new Error('locked'))
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    const input = within(await heatRow(1)).getByLabelText('Heat 1 start time')
    fireEvent.change(input, { target: { value: '10:30' } })
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/locked/)).toBeInTheDocument()
    expect(within(await heatRow(1)).getByLabelText('Heat 1 start time')).toBeInTheDocument()
  })

  it('locks the Save button while the time is in flight', async () => {
    let release!: () => void
    apiPut.mockImplementation(() => new Promise<void>((r) => { release = () => r() }))
    mount()
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Edit heat 1 start time' }))
    fireEvent.change(within(await heatRow(1)).getByLabelText('Heat 1 start time'), {
      target: { value: '10:30' },
    })
    fireEvent.click(within(await heatRow(1)).getByRole('button', { name: 'Save' }))
    await waitFor(async () =>
      expect(within(await heatRow(1)).getByRole('button', { name: 'Save' })).toBeDisabled())
    release()
  })
})
