import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { CcChange, CcPreview } from '@/api/competitionCorner'
import { HttpError } from '@/lib/http'
import { CompetitionCornerSection } from './CompetitionCornerSection'

const onPreview = vi.fn()
const onApply = vi.fn()

const change = (key: string, over: Partial<CcChange> = {}): CcChange => ({
  key, entity: 'division', kind: 'add', id: null, label: key, fields: [], warnings: [], requires: [], ...over,
})

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const EVENT = { id: 19948, name: 'Spring Throwdown', divisions: [{}, {}], workouts: [{}], heats: [{}, {}, {}] }
const REQUEST = { tz: TZ, mergePartB: true, event: EVENT }

const PREVIEW: CcPreview = {
  event: { id: 19948, name: 'Spring Throwdown' },
  version: 'v1',
  request: REQUEST,
  changes: [
    change('division:1', { label: 'Rx' }),
    change('division:2', { label: 'Scaled', kind: 'update', id: 4, fields: [{ field: 'name', before: 'scaled', after: 'Scaled' }] }),
    change('division:9', { label: 'Old', kind: 'remove', id: 3 }),
    change('workout:10', { entity: 'workout', label: 'WOD 1', needsScoreType: true, warnings: ['Score type "Other" has no match here. Pick one.'] }),
    change('athlete:100', { entity: 'athlete', label: 'Ann', requires: ['division:1'] }),
  ],
}

function draw() {
  return render(<CompetitionCornerSection onPreview={onPreview} onApply={onApply} />)
}

async function preview() {
  fireEvent.change(screen.getByLabelText('Event link'), { target: { value: 'competitioncorner.net/events/19948' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  await screen.findByText(/Spring Throwdown/)
}

const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) }) as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  onPreview.mockResolvedValue(PREVIEW)
  onApply.mockResolvedValue({ applied: 3 })
})

it('previews the event in the browser time zone, merging Part B by default', async () => {
  draw()
  await preview()
  expect(onPreview).toHaveBeenCalledWith({
    url: 'competitioncorner.net/events/19948',
    tz: TZ,
    mergePartB: true,
  })
})

// Reading three Competition Corner endpoints plus each workout page takes a moment.
it('says what it is doing while it reads the event', async () => {
  let finish!: (p: CcPreview) => void
  onPreview.mockReturnValue(new Promise((r) => { finish = r }))
  draw()
  fireEvent.change(screen.getByLabelText('Event link'), { target: { value: '19948' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(screen.getByRole('status')).toHaveTextContent('Reading the event from Competition Corner…')
  finish(PREVIEW)
  await waitFor(() => expect(screen.queryByText('Reading the event from Competition Corner…')).not.toBeInTheDocument())
})

it('says what the event lists', async () => {
  draw()
  await preview()
  expect(screen.getByText('Competition Corner lists 2 divisions, 1 workout and 3 heats.')).toBeInTheDocument()
})

// An event announced before its schedule: only its divisions can come in yet.
it('explains why only divisions can be imported before the schedule is out', async () => {
  onPreview.mockResolvedValue({
    ...PREVIEW,
    changes: [change('division:1', { label: 'Scramble Team' })],
    request: { ...REQUEST, event: { ...EVENT, divisions: [{}], workouts: [], heats: [] } },
  })
  draw()
  await preview()
  expect(screen.getByText(/no workouts or heat sheets published yet, so only divisions can be imported/)).toBeInTheDocument()
  expect(box('Scramble Team').checked).toBe(true)
})

it('lists each change by kind, with what it changes and why to look', async () => {
  draw()
  await preview()
  const divisions = within(screen.getByRole('group', { name: /Divisions/ }))
  expect(divisions.getByText('name: scaled → Scaled')).toBeInTheDocument()
  expect(screen.getByText('Score type "Other" has no match here. Pick one.')).toBeInTheDocument()
})

// A removal deletes rows the admin may have built on.
it('keeps every change but removals checked to start', async () => {
  draw()
  await preview()
  expect(box('Rx').checked).toBe(true)
  expect(box('Scaled').checked).toBe(true)
  expect(box('Old').checked).toBe(false)
})

it('unchecks what depends on a change the admin drops', async () => {
  draw()
  await preview()
  fireEvent.click(box('Rx'))
  expect(box('Ann').checked).toBe(false)
})

it('asks for a score type the source could not give, and sends it', async () => {
  draw()
  await preview()
  fireEvent.change(screen.getByLabelText('Score type for WOD 1'), { target: { value: 'weight' } })
  fireEvent.click(screen.getByRole('button', { name: /Apply 4 changes/ }))
  // Apply posts the event the admin reviewed, not a fresh read.
  await waitFor(() => expect(onApply).toHaveBeenCalledWith({
    ...REQUEST,
    version: 'v1',
    accepted: ['division:1', 'division:2', 'workout:10', 'athlete:100'],
    scoreTypes: { 'workout:10': 'weight' },
  }))
  expect(await screen.findByText('Applied 3 changes from Spring Throwdown.')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

it('says so when the competition already matches the event', async () => {
  onPreview.mockResolvedValue({ ...PREVIEW, changes: [] })
  draw()
  await preview()
  expect(screen.getByText('Already matches Spring Throwdown.')).toBeInTheDocument()
})

it('shows each problem the server found with the selection', async () => {
  onApply.mockRejectedValue(new HttpError(400, JSON.stringify({ errors: ['Pick a score type for WOD 1.'] })))
  draw()
  await preview()
  fireEvent.click(screen.getByRole('button', { name: /Apply 4 changes/ }))
  expect(await screen.findByText('Pick a score type for WOD 1.')).toBeInTheDocument()
})

it('shows why a preview failed', async () => {
  onPreview.mockRejectedValue(new Error("Competition Corner answered 403 when reading the event's heat sheets. Try again in a minute."))
  draw()
  fireEvent.change(screen.getByLabelText('Event link'), { target: { value: '19948' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("answered 403 when reading the event's heat sheets")
})

it('reads the router error body, not raw JSON', async () => {
  onPreview.mockRejectedValue(new HttpError(500, JSON.stringify({ error: 'Database is busy' })))
  draw()
  fireEvent.change(screen.getByLabelText('Event link'), { target: { value: '19948' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByText('Database is busy')).toBeInTheDocument()
})
