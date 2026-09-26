import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatDndProvider } from '../heat-dnd-context'
import type { Assignment, Score, Workout } from '../../useWorkoutDetail'
import { HeatCard } from './HeatCard'

// v1: src/components/workout-detail/HeatCard.tsx. One heat — its clock, its
// lanes, the boxes a score is typed into and the two buttons that end it.
// The gesture layer is exercised through the registry it writes to; GSAP
// itself is mocked, because jsdom has no layout for a Draggable to read.

const { create } = vi.hoisted(() => ({ create: vi.fn(() => [{ kill: vi.fn() }]) }))
vi.mock('@/lib/gsap-client', () => ({
  gsap: { set: vi.fn(), registerPlugin: vi.fn() },
  Draggable: { create },
}))

const athlete = (id: number, name: string, division: string | null) => ({
  id,
  name,
  bibNumber: null,
  division: division ? { id: 1, name: division, order: 1 } : null,
})

const ENTRIES: Assignment[] = [
  { id: 91, heatNumber: 1, lane: 2, athlete: athlete(2, 'Bob Brown', 'Rx') },
  { id: 90, heatNumber: 1, lane: 1, athlete: athlete(1, 'Ann Adams', 'Rx') },
]

const START = '2026-06-01T10:00:00.000Z'

const WORKOUT: Workout = {
  id: 7,
  number: 1,
  name: 'Fran',
  description: null,
  scoreType: 'time',
  lanes: 2,
  heatIntervalSecs: 600,
  timeBetweenHeatsSecs: 300,
  callTimeSecs: 300,
  walkoutTimeSecs: 120,
  startTime: START,
  status: 'active',
  mixedHeats: false,
  tiebreakEnabled: false,
  tiebreakScoreType: 'time',
  partBEnabled: false,
  partBScoreType: 'time',
  halfWeight: false,
  locationId: null,
  heatStartOverrides: {},
  completedHeats: [],
  assignments: ENTRIES,
  scores: [],
}

const SCORE: Score = {
  id: 1,
  athleteId: 1,
  rawScore: 192_050,
  tiebreakRawScore: null,
  points: 3,
  partBRawScore: null,
  partBPoints: null,
  athlete: athlete(1, 'Ann Adams', 'Rx'),
}

type Props = Parameters<typeof HeatCard>[0]

const scoreInputs = () =>
  ({
    weightInputs: {},
    timeInputs: {},
    rrInputs: {},
    tiebreakInputs: {},
    partBTimeInputs: {},
    partBWeightInputs: {},
    partBRrInputs: {},
    setWeightInputs: vi.fn(),
    setTimeInputs: vi.fn(),
    setRrInputs: vi.fn(),
    setTiebreakInputs: vi.fn(),
    setPartBTimeInputs: vi.fn(),
    setPartBWeightInputs: vi.fn(),
    setPartBRrInputs: vi.fn(),
    hydrate: vi.fn(),
    clear: vi.fn(),
    buildPayload: vi.fn(),
  }) as unknown as Props['scoreInputs']

function mount(over: Partial<Props> = {}) {
  const props: Props = {
    workout: WORKOUT,
    heatNumber: 1,
    entries: ENTRIES,
    isComplete: false,
    loading: false,
    scoreInputs: scoreInputs(),
    onSaveHeat: vi.fn(),
    onCompleteHeat: vi.fn(),
    onUndoHeat: vi.fn(),
    onReorder: vi.fn(),
    onSaveHeatTime: vi.fn().mockResolvedValue(undefined),
    isSaving: false,
    ...over,
  }
  const view = render(
    <HeatDndProvider>
      <HeatCard {...props} />
    </HeatDndProvider>,
  )
  return { ...view, props }
}

const cells = (rowIndex: number) =>
  within(screen.getAllByRole('row')[rowIndex])
    .getAllByRole('cell')
    .map((c) => c.textContent)

beforeEach(() => vi.clearAllMocks())

describe('the lanes', () => {
  it('lists athletes in lane order, not the order they arrived in', () => {
    mount()
    expect(cells(1).slice(0, 4)).toEqual(['1', '1', 'Ann Adams', 'Rx'])
    expect(cells(2).slice(0, 4)).toEqual(['2', '1', 'Bob Brown', 'Rx'])
  })

  it('draws a dash for an athlete with no division', () => {
    mount({ entries: [{ id: 92, heatNumber: 1, lane: 1, athlete: athlete(3, 'Cal Cook', null) }] })
    expect(cells(1)[3]).toBe('—')
  })

  it('marks each row with the assignment it is, so a drop can find it', () => {
    const { container } = mount()
    const ids = [...container.querySelectorAll('[data-assignment-id]')].map((el) =>
      el.getAttribute('data-assignment-id'),
    )
    expect(ids).toEqual(['90', '91'])
  })

  it('offers somewhere to drop when the heat is empty', () => {
    mount({ entries: [] })
    expect(screen.getByText('Drop athletes here')).toBeInTheDocument()
  })

  it('gives every athlete a score box', () => {
    mount()
    expect(screen.getAllByLabelText('Score time')).toHaveLength(2)
  })
})

describe('ending the heat', () => {
  it('offers save and complete while the heat is open', () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Save Heat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete Heat' }))
    expect(props.onSaveHeat).toHaveBeenCalledWith(1)
    expect(props.onCompleteHeat).toHaveBeenCalledWith(1)
  })

  // v1 made the Completed badge itself the way back — there is no other undo.
  it('offers only the way back once it is complete', () => {
    const { props } = mount({ isComplete: true })
    expect(screen.queryByRole('button', { name: 'Save Heat' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete Heat' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }))
    expect(props.onUndoHeat).toHaveBeenCalledWith(1)
  })

  it('stops all three buttons while a request is in flight', () => {
    mount({ loading: true })
    expect(screen.getByRole('button', { name: 'Save Heat' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Complete Heat' })).toBeDisabled()
    mount({ loading: true, isComplete: true })
    expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled()
  })
})

describe('the heat clock', () => {
  const at = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const start = Date.parse(START)

  it('shows the start, the corral call and the walk out', () => {
    mount()
    expect(screen.getByText(new RegExp(at(start)))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Corral: ${at(start - 300_000)}`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Walk Out: ${at(start - 120_000)}`))).toBeInTheDocument()
  })

  // The interval and the gap between heats both count — heat 2 is 15 minutes
  // after heat 1, not 10.
  it('offsets a later heat by the interval and the gap together', () => {
    mount({ heatNumber: 2 })
    expect(screen.getByText(new RegExp(at(start + 900_000)))).toBeInTheDocument()
  })

  it('shows no clock at all when the workout has no start time', () => {
    mount({ workout: { ...WORKOUT, startTime: null } })
    expect(screen.queryByRole('button', { name: 'Edit time' })).not.toBeInTheDocument()
  })

  it('saves an edited time on the heats own date', async () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    fireEvent.change(screen.getByLabelText('Heat start time'), { target: { value: '14:45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onSaveHeatTime).toHaveBeenCalled())
    const [heatNumber, iso] = vi.mocked(props.onSaveHeatTime).mock.calls[0]
    const saved = new Date(iso as string)
    expect(heatNumber).toBe(1)
    expect([saved.getHours(), saved.getMinutes()]).toEqual([14, 45])
    expect(saved.toDateString()).toBe(new Date(start).toDateString())
  })

  it('saves an edited time once, however fast the clicks come', async () => {
    const { props } = mount()
    let release!: () => void
    vi.mocked(props.onSaveHeatTime).mockImplementation(() => new Promise<void>((r) => { release = () => r() }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    fireEvent.change(screen.getByLabelText('Heat start time'), { target: { value: '14:45' } })
    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(save)
    fireEvent.click(save)
    release()
    await waitFor(() => expect(props.onSaveHeatTime).toHaveBeenCalledTimes(1))
  })

  it('opens the box on the time the heat already starts at', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    const d = new Date(start)
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    expect(screen.getByLabelText('Heat start time')).toHaveValue(hhmm)
  })

  it('commits on Enter and abandons on Escape', async () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    fireEvent.keyDown(screen.getByLabelText('Heat start time'), { key: 'Escape' })
    expect(screen.queryByLabelText('Heat start time')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    fireEvent.change(screen.getByLabelText('Heat start time'), { target: { value: '09:15' } })
    fireEvent.keyDown(screen.getByLabelText('Heat start time'), { key: 'Enter' })
    await waitFor(() => expect(props.onSaveHeatTime).toHaveBeenCalled())
  })

  it('leaves the time alone when the edit is abandoned', () => {
    const { props } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Edit time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onSaveHeatTime).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Heat start time')).not.toBeInTheDocument()
  })
})

describe('the judge column', () => {
  const JUDGES = [{ id: 5, name: 'Jo Judge' }]

  it('stays hidden when the competition has no judges', () => {
    mount()
    expect(screen.queryByRole('columnheader', { name: 'Judge' })).not.toBeInTheDocument()
    mount({ judges: [] })
    expect(screen.queryByRole('columnheader', { name: 'Judge' })).not.toBeInTheDocument()
  })

  it('shows who is judging each lane', () => {
    mount({
      judges: JUDGES,
      judgesByLane: new Map([[1, { volunteerId: 5, assignmentId: 77, judgeName: 'Jo Judge' }]]),
    })
    expect(screen.getByRole('columnheader', { name: 'Judge' })).toBeInTheDocument()
    expect(screen.getByLabelText('Judge for lane 1')).toHaveValue('5')
    expect(screen.getByLabelText('Judge for lane 2')).toHaveValue('')
  })

  it('names the heat and the lane the change belongs to', () => {
    const onJudgeChange = vi.fn()
    mount({ judges: JUDGES, heatNumber: 3, onJudgeChange })
    fireEvent.change(screen.getByLabelText('Judge for lane 2'), { target: { value: '5' } })
    expect(onJudgeChange).toHaveBeenCalledWith(3, 2, 5)
  })

  it('reports a lane cleared as no judge at all', () => {
    const onJudgeChange = vi.fn()
    mount({
      judges: JUDGES,
      judgesByLane: new Map([[1, { volunteerId: 5, assignmentId: 77, judgeName: 'Jo Judge' }]]),
      onJudgeChange,
    })
    fireEvent.change(screen.getByLabelText('Judge for lane 1'), { target: { value: '' } })
    expect(onJudgeChange).toHaveBeenCalledWith(1, 1, null)
  })
})

describe('the score columns', () => {
  it('is headed Score when there is only one part', () => {
    mount()
    expect(screen.getByRole('columnheader', { name: 'Score' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Part B' })).not.toBeInTheDocument()
  })

  it('splits into Part A and Part B when the workout has two', () => {
    mount({ workout: { ...WORKOUT, partBEnabled: true } })
    expect(screen.getByRole('columnheader', { name: 'Part A' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Part B' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Part B time')).toHaveLength(2)
  })

  it('shows a tiebreak box only when the workout has one', () => {
    mount()
    expect(screen.queryByLabelText('Tiebreak time')).not.toBeInTheDocument()
    mount({ workout: { ...WORKOUT, tiebreakEnabled: true } })
    expect(screen.getAllByLabelText('Tiebreak time')).toHaveLength(2)
  })
})

describe('the points a score earned', () => {
  const scored = (over: Partial<typeof SCORE> = {}) => ({
    ...WORKOUT,
    scores: [{ ...SCORE, ...over }],
  })

  it('shows the placing and the score behind it', () => {
    mount({ workout: scored() })
    expect(screen.getByRole('button', { name: '#3' })).toBeInTheDocument()
    expect(screen.getByText('3:12.05')).toBeInTheDocument()
  })

  it('leaves a dash where nothing has been scored', () => {
    mount({ workout: scored() })
    expect(cells(2).at(-1)).toBe('—')
  })

  // The placing is a dash, but the score it will be ranked on still shows.
  it('shows a dash for a scored athlete with no placing yet', () => {
    mount({ workout: scored({ points: null }) })
    expect(screen.queryByRole('button', { name: /^#/ })).not.toBeInTheDocument()
    expect(cells(1).at(-1)).toBe('—3:12.05')
  })

  it('hides a zero raw score rather than printing 0:00.00', () => {
    mount({ workout: scored({ rawScore: 0 }) })
    expect(screen.queryByText('0:00.00')).not.toBeInTheDocument()
  })

  it('shows the tiebreak that broke it', () => {
    mount({ workout: { ...scored({ tiebreakRawScore: 5_000 }), tiebreakScoreType: 'time' } })
    expect(screen.getByText('TB 0:05.00')).toBeInTheDocument()
  })

  it('shows the Part B placing beside the Part A one', () => {
    mount({ workout: { ...scored({ partBPoints: 2 }), partBEnabled: true } })
    expect(screen.getByText('/ B#2')).toBeInTheDocument()
  })

  // v1 asked twice before letting a placing be typed over.
  it('asks before letting the placing be overridden', async () => {
    const onPointsOverride = vi.fn().mockResolvedValue(undefined)
    mount({ workout: scored(), onPointsOverride })
    fireEvent.click(screen.getByRole('button', { name: '#3' }))
    expect(screen.getByText('Change points?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    const box = screen.getByLabelText('Points')
    expect(box).toHaveValue(3)
    fireEvent.change(box, { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onPointsOverride).toHaveBeenCalledWith(1, 2))
  })

  it('drops the question when the answer is no', () => {
    const onPointsOverride = vi.fn()
    mount({ workout: scored(), onPointsOverride })
    fireEvent.click(screen.getByRole('button', { name: '#3' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByText('Change points?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#3' })).toBeInTheDocument()
  })

  it('refuses a placing below first', () => {
    const onPointsOverride = vi.fn().mockResolvedValue(undefined)
    mount({ workout: scored(), onPointsOverride })
    fireEvent.click(screen.getByRole('button', { name: '#3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onPointsOverride).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Points')).toBeInTheDocument()
  })

  it('leaves the placing alone when nothing can override it', () => {
    mount({ workout: scored() })
    fireEvent.click(screen.getByRole('button', { name: '#3' }))
    expect(screen.queryByText('Change points?')).not.toBeInTheDocument()
  })
})

describe('while a reorder is in flight', () => {
  it('replaces the lanes with skeletons rather than stale rows', () => {
    mount({ isSaving: true })
    expect(screen.queryByText('Ann Adams')).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('shows one skeleton even for a heat with nobody in it', () => {
    mount({ entries: [], isSaving: true })
    expect(screen.queryByText('Drop athletes here')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })

  it('does not arm a drag while the heat is saving or complete', () => {
    mount({ isSaving: true })
    expect(create).not.toHaveBeenCalled()
    mount({ isComplete: true })
    expect(create).not.toHaveBeenCalled()
  })

  it('arms one drag per row otherwise', () => {
    mount()
    expect(create).toHaveBeenCalledTimes(2)
  })
})
