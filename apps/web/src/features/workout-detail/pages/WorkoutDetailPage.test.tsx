import { Route } from 'react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { currentPath, renderRoutes } from '@/test/harness'
import type { Assignment, Score, Workout } from '../useWorkoutDetail'
import { WorkoutDetailPage } from './WorkoutDetailPage'

const { apiGet, apiPost, apiPut, apiPatch, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPut, apiPatch, apiDel }))

// v1: src/app/[slug]/admin/workouts/[id]/page.tsx. The screen a workout is run
// from. HeatCard has its own suite, so it is stubbed down to the props the page
// hands it — what is under test here is the wiring: which athletes a heat saves,
// which lane a judge lands in, and which prompt guards which write.
//
// The stub draws no region of its own. The page wraps each heat in one, so that
// the index beside the heats has something to point a fragment at and so a
// screen reader can be told which heat it has arrived in.

type StubProps = {
  heatNumber: number
  isComplete: boolean
  isSaving: boolean
  judges?: { id: number; name: string }[]
  judgesByLane?: Map<number, { judgeName: string }>
  onSaveHeat: (n: number) => void
  onCompleteHeat: (n: number) => void
  onJudgeChange?: (heatNumber: number, lane: number, volunteerId: number | null) => void
  onPointsOverride?: (athleteId: number, points: number) => Promise<void>
}

vi.mock('../components/HeatCard/HeatCard', () => ({
  HeatCard: (p: StubProps) => (
    <div>
      <span>{p.isComplete ? 'complete' : 'open'}</span>
      {p.isSaving && <span>saving</span>}
      <span>offers {p.judges?.map((j) => j.name).join(',') || 'nobody'}</span>
      <span>lane 1 {p.judgesByLane?.get(1)?.judgeName ?? 'unjudged'}</span>
      <button onClick={() => p.onSaveHeat(p.heatNumber)}>save heat {p.heatNumber}</button>
      <button onClick={() => p.onCompleteHeat(p.heatNumber)}>complete heat {p.heatNumber}</button>
      <button onClick={() => p.onJudgeChange?.(p.heatNumber, 1, 9)}>judge heat {p.heatNumber}</button>
      <button onClick={() => void p.onPointsOverride?.(1, 5)}>override heat {p.heatNumber}</button>
    </div>
  ),
}))

const athlete = (id: number, name: string) =>
  ({ id, name, bibNumber: null, division: null })

const assign = (id: number, heatNumber: number, lane: number, aId: number, name: string): Assignment =>
  ({ id, heatNumber, lane, athlete: athlete(aId, name) })

const SCORE: Score = {
  id: 1, athleteId: 1, rawScore: 192000, tiebreakRawScore: null,
  points: 1, partBRawScore: null, partBPoints: null, athlete: athlete(1, 'Ann'),
}

const WORKOUT: Workout = {
  id: 42, number: 3, name: 'Fran', description: 'Thrusters and pull-ups',
  scoreType: 'time', lanes: 2, heatIntervalSecs: 600, timeBetweenHeatsSecs: 90,
  callTimeSecs: 120, walkoutTimeSecs: 60, startTime: null, status: 'draft',
  mixedHeats: false, tiebreakEnabled: false, tiebreakScoreType: 'time',
  partBEnabled: false, partBScoreType: 'time', halfWeight: false, locationId: null,
  heatStartOverrides: {}, completedHeats: [1],
  assignments: [
    assign(10, 1, 1, 1, 'Ann'),
    assign(11, 1, 2, 2, 'Bo'),
    assign(12, 2, 1, 3, 'Cy'),
  ],
  scores: [SCORE],
}

const JUDGE_ASSIGNMENTS = [
  { id: 90, volunteerId: 1, heatNumber: 1, lane: 1, judgeName: 'Jo' },
]
const ROLES = [{ id: 5, name: 'Judge' }]
const VOLUNTEERS = [{ id: 1, name: 'Jo', roleId: 5 }, { id: 2, name: 'Kit', roleId: null }]

function serve(over: Partial<Workout> = {}, judgeRows = JUDGE_ASSIGNMENTS, volunteers = VOLUNTEERS) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/workouts/42/judge-assignments')) return Promise.resolve(judgeRows)
    if (path.startsWith('/api/workouts/42')) return Promise.resolve({ ...WORKOUT, ...over })
    if (path.startsWith('/api/workout-locations')) return Promise.resolve([{ id: 4, name: 'Floor' }])
    if (path.startsWith('/api/volunteer-roles')) return Promise.resolve(ROLES)
    if (path.startsWith('/api/volunteers')) return Promise.resolve(volunteers)
    if (path.startsWith('/api/settings')) return Promise.resolve({ judgeMaxConsecutive: 4 })
    return Promise.reject(new Error(`unexpected GET ${path}`))
  })
}

function mount() {
  return renderRoutes(
    <Route path="/:slug/admin/workouts/:id" element={<WorkoutDetailPage />} />,
    ['/rugged-rumble/admin/workouts/42'],
  )
}

async function open(over: Partial<Workout> = {}, judgeRows = JUDGE_ASSIGNMENTS, volunteers = VOLUNTEERS) {
  serve(over, judgeRows, volunteers)
  const view = mount()
  await screen.findByRole('heading', { name: 'WOD 3: Fran' })
  return view
}

/** Answers the prompt the page just raised. */
async function confirmWith(label: string) {
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

/** The index beside the heats — one link per heat. */
const index = () => within(screen.getByRole('navigation', { name: 'Heats' }))

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiPost.mockResolvedValue([])
  apiPut.mockResolvedValue({})
  apiPatch.mockResolvedValue({})
  apiDel.mockResolvedValue({})
})

describe('what the workout says about itself', () => {
  it('names the workout and how it is run', async () => {
    await open()
    expect(screen.getByText('INactive')).toBeInTheDocument()
    expect(screen.getByText(/2 lanes · Time · Separate heats · 1m 30s between heats/)).toBeInTheDocument()
  })

  it('says when it starts, once it has a start time', async () => {
    await open({ startTime: '2026-05-01T09:00:00.000Z' })
    expect(screen.getByText(/^Starts /)).toBeInTheDocument()
  })

  it('shows the description until the settings are being edited', async () => {
    await open()
    // The edit form holds the same text in its textarea, so the read-only
    // copy is the paragraph specifically.
    const shown = () => screen.queryByText('Thrusters and pull-ups', { selector: 'p' })
    expect(shown()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Settings' }))
    expect(shown()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })

  // v1 printed "Loading..." where the whole screen would be. What is coming is
  // a workout with heats in it, so that is the shape held open.
  it('holds the pages place while the workout is read', () => {
    mount()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'WOD 3: Fran' })).not.toBeInTheDocument()
  })

  it('sends the workout somewhere else when it cannot be read', async () => {
    apiGet.mockRejectedValue(new HttpError(404, 'Not found'))
    mount()
    await waitFor(() => expect(currentPath()).toBe('/rugged-rumble/admin/workouts'))
  })

  // A network blip is not a deleted workout. Only a real 404 may bounce the
  // admin to the list; anything else stays put and says what went wrong.
  it('stays put and says why when the read merely failed', async () => {
    apiGet.mockRejectedValue(new HttpError(500, 'Database unavailable'))
    mount()
    await screen.findByText(/Database unavailable/)
    expect(currentPath()).toBe('/rugged-rumble/admin/workouts/42')
  })
})

describe('moving the workout through its states', () => {
  it('activates a draft', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith(
      '/api/workouts/42?slug=rugged-rumble', { status: 'active' },
    ))
  })

  it('deactivates an active workout', async () => {
    await open({ status: 'active' })
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith(expect.any(String), { status: 'draft' }))
  })

  it('reactivates a completed one', async () => {
    await open({ status: 'completed' })
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith(expect.any(String), { status: 'active' }))
  })

  it('offers no reset while the workout is still a draft', async () => {
    await open()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('resets only after the warning is answered', async () => {
    await open({ status: 'active' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(apiPost).not.toHaveBeenCalledWith('/api/workouts/42/reset?slug=rugged-rumble', {})
    await confirmWith('Reset workout')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/workouts/42/reset?slug=rugged-rumble', {}))
  })

  it('deletes and leaves for the workout list', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await confirmWith('Delete workout')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/workouts/42?slug=rugged-rumble'))
    await waitFor(() => expect(currentPath()).toBe('/rugged-rumble/admin/workouts'))
  })

  // The dialog owns the outcome: a refused delete keeps the prompt up with the
  // reason, and above all does not walk the admin to the list as if it landed.
  it('a refused delete keeps the page and the prompt', async () => {
    await open()
    apiDel.mockRejectedValue(new HttpError(500, 'Delete refused'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await confirmWith('Delete workout')
    const dialog = await screen.findByRole('alertdialog')
    await within(dialog).findByText(/Delete refused/)
    expect(currentPath()).toBe('/rugged-rumble/admin/workouts/42')
  })

  it('a status change locks its button while in flight', async () => {
    await open()
    let release!: (v: unknown) => void
    apiPut.mockImplementation(() => new Promise((r) => { release = r }))
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled())
    release({})
  })
})

describe('filling the heats', () => {
  // v1 drew an empty column with two buttons above it. A workout with no heats
  // is the one state where generating them is the only thing to do, so that is
  // what the screen says and offers.
  it('says what is missing when the workout has no heats', async () => {
    await open({ assignments: [] })
    expect(screen.getByText('No heats yet')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Heats' })).not.toBeInTheDocument()
  })

  it('generates by division order or by cumulative points', async () => {
    await open({ assignments: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Generate (Random / Division Order)' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/assignments?slug=rugged-rumble', { useCumulative: false },
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Generate (By Cumulative Points)' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(expect.any(String), { useCumulative: true }))
  })

  it('locks both generators once heats exist', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Generate (Random / Division Order)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate (By Cumulative Points)' })).toBeDisabled()
  })

  it('unlocks them once the replacement is agreed to', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock to Regenerate' }))
    await confirmWith('Unlock')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate (By Cumulative Points)' })).toBeEnabled())
  })

  it('says where the strongest athletes end up', async () => {
    await open()
    expect(screen.getByText(/Best athletes are placed in the last heat/)).toBeInTheDocument()
  })
})

// v1 ran a dozen full-height heats down one column, so which heat still needed
// scores could only be answered by reading all of them.
describe('the index beside the heats', () => {
  it('lists every heat the workout has, in order', async () => {
    await open()
    expect(index().getAllByRole('link').map((a) => a.getAttribute('href')))
      .toEqual(['#heat-1', '#heat-2'])
  })

  it('says how much of each heat is scored', async () => {
    await open()
    expect(index().getByRole('link', { name: /^Heat 1/ })).toHaveTextContent('1/2 scored')
    expect(index().getByRole('link', { name: /^Heat 2/ })).toHaveTextContent('0/1 scored')
  })

  it('marks the heats that are closed', async () => {
    await open()
    expect(index().getByRole('link', { name: /^Heat 1/ })).toHaveTextContent('Done')
    expect(index().getByRole('link', { name: /^Heat 2/ })).not.toHaveTextContent('Done')
  })

  it('says when each heat starts, once the workout has a start time', async () => {
    await open({ startTime: '2026-05-01T09:00:00.000Z' })
    expect(index().getByRole('link', { name: /^Heat 1 \d{1,2}:\d{2}/ })).toBeInTheDocument()
  })

  // The link is a fragment rather than a selection, because every heat stays
  // rendered: an athlete is dragged from one heat into another, and a heat that
  // is not on the page has nothing to drop onto.
  it('points at the heat it names, which is on the page', async () => {
    await open()
    fireEvent.click(index().getByRole('link', { name: /^Heat 2/ }))
    expect(document.getElementById('heat-2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save heat 1' })).toBeInTheDocument()
  })
})

describe('the heats themselves', () => {
  it('draws one region per heat, in order, marking the completed ones', async () => {
    await open()
    const cards = screen.getAllByRole('region', { name: /^Heat / })
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(['Heat 1', 'Heat 2'])
    expect(within(cards[0]).getByText('complete')).toBeInTheDocument()
    expect(within(cards[1]).getByText('open')).toBeInTheDocument()
  })

  it('saves only the athletes in the heat that asked', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'save heat 2' }))
    // Only Ann has a score to send, and Ann swims in heat 1.
    await waitFor(() => expect(screen.getByText('Heat 2 scores saved.')).toBeInTheDocument())
    expect(apiPost).not.toHaveBeenCalledWith(expect.stringContaining('/scores'), expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'save heat 1' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/scores?slug=rugged-rumble',
      { athleteId: 1, rawScore: 192000, tiebreakRawScore: null, partBRawScore: null },
    ))
  })

  it('completes a heat with its own scores', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'complete heat 1' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/heats/1/complete?slug=rugged-rumble', {},
    ))
  })

  it('saves every athlete at once', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Save All Scores' }))
    await waitFor(() => expect(screen.getByText('All scores saved.')).toBeInTheDocument())
  })

  it('will not clear scores it does not have', async () => {
    await open({ scores: [] })
    expect(screen.getByRole('button', { name: 'Clear All Scores' })).toBeDisabled()
  })

  it('clears every score once the warning is answered', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Clear All Scores' }))
    await confirmWith('Clear all scores')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/workouts/42/scores?slug=rugged-rumble'))
  })

  // The count sits beside the button, not in it: the label is already the
  // widest thing in a 240px rail, and a growing suffix is what clipped it.
  it('counts the athletes still unscored beside the calculate button', async () => {
    await open()
    expect(screen.getByText('1/3 scored')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculate Rankings & Complete' })).not.toHaveTextContent('1/3')
  })

  it('will not calculate before anything is scored', async () => {
    await open({ scores: [] })
    expect(screen.getByRole('button', { name: /Calculate Rankings & Complete/ })).toBeDisabled()
  })

  it('saves before it calculates', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Calculate Rankings & Complete/ }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/calculate?slug=rugged-rumble', {},
    ))
    const paths = apiPost.mock.calls.map((c) => c[0])
    expect(paths.indexOf('/api/workouts/42/scores?slug=rugged-rumble'))
      .toBeLessThan(paths.indexOf('/api/workouts/42/calculate?slug=rugged-rumble'))
  })

  it('overwrites a placing and reads the workout back', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'override heat 1' }))
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith(
      '/api/workouts/42/scores?slug=rugged-rumble',
      { slug: 'rugged-rumble', athleteId: 1, points: 5 },
    ))
  })

  it('reports a failed write rather than a heat that saved', async () => {
    await open()
    apiPost.mockRejectedValue(new HttpError(500, 'Database is away'))
    fireEvent.click(screen.getByRole('button', { name: 'Save All Scores' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error: Database is away')
  })

  // One outcome at a time: a failure that arrives after a success replaces it,
  // rather than sitting under a line still saying the save worked.
  it('does not say a save worked beside the failure that followed it', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Save All Scores' }))
    await screen.findByText('All scores saved.')
    apiPost.mockRejectedValue(new HttpError(500, 'Database is away'))
    fireEvent.click(screen.getByRole('button', { name: 'Save All Scores' }))
    await screen.findByRole('alert')
    expect(screen.queryByText('All scores saved.')).not.toBeInTheDocument()
  })
})

describe('the judges', () => {
  it('hands every volunteer to the card and names the one in each lane', async () => {
    await open()
    const heat1 = screen.getByRole('region', { name: 'Heat 1' })
    expect(within(heat1).getByText('offers Jo,Kit')).toBeInTheDocument()
    expect(within(heat1).getByText('lane 1 Jo')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Heat 2' })).getByText('lane 1 unjudged'))
      .toBeInTheDocument()
  })

  it('puts a judge in the lane the card names', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'judge heat 2' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/judge-assignments?slug=rugged-rumble',
      { volunteerId: 9, heatNumber: 2, lane: 1 },
    ))
  })

  it('auto-assigns with the competitions consecutive-heat limit', async () => {
    await open({}, [])
    fireEvent.click(screen.getByRole('button', { name: 'Auto-Assign Judges' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/judge-assignments/generate?slug=rugged-rumble',
      { maxConsecutive: 4 },
    ))
  })

  it('asks before replacing judges that are already assigned', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Auto-Assign Judges' }))
    expect(apiPost).not.toHaveBeenCalled()
    await confirmWith('Auto-assign judges')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      expect.stringContaining('/judge-assignments/generate'), { maxConsecutive: 4 },
    ))
  })

  it('cannot auto-assign a competition with no judges', async () => {
    await open({}, [], [{ id: 2, name: 'Kit', roleId: null }])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Auto-Assign Judges' })).toBeDisabled())
  })

  it('offers to clear judges only when there are some', async () => {
    await open({}, [])
    expect(screen.queryByRole('button', { name: 'Clear Judges' })).not.toBeInTheDocument()
  })

  it('clears every judge once the warning is answered', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Clear Judges' }))
    await confirmWith('Clear judges')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith(
      '/api/workouts/42/judge-assignments?slug=rugged-rumble',
    ))
  })

  // A judge refusal outlives the click that caused it — the lane it was about
  // is still on screen — so it is the one message the page lets you put away.
  it('shows a refused judge change until it is dismissed', async () => {
    await open()
    apiPost.mockRejectedValue(new HttpError(409, 'Jo is already judging'))
    fireEvent.click(screen.getByRole('button', { name: 'judge heat 2' }))
    expect(await screen.findByText('Jo is already judging')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss judge error' }))
    expect(screen.queryByText('Jo is already judging')).not.toBeInTheDocument()
  })
})

describe('the workouts own leaderboard', () => {
  it('appears once the workout is completed and scored', async () => {
    await open({ status: 'completed' })
    expect(await screen.findByRole('table', { name: /Leaderboard for WOD 3/ })).toBeInTheDocument()
  })

  it('stays away while the workout is still running', async () => {
    await open({ status: 'active' })
    expect(screen.queryByRole('table', { name: /Leaderboard for WOD 3/ })).not.toBeInTheDocument()
  })
})
