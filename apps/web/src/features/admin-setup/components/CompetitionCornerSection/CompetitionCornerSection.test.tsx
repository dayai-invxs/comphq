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

const PREVIEW: CcPreview = {
  event: { id: 19948, name: 'Spring Throwdown' },
  version: 'v1',
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
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    mergePartB: true,
  })
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
  await waitFor(() => expect(onApply).toHaveBeenCalledWith({
    url: 'competitioncorner.net/events/19948',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    mergePartB: true,
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
  onPreview.mockRejectedValue(new HttpError(400, 'Paste a Competition Corner event link.'))
  draw()
  fireEvent.change(screen.getByLabelText('Event link'), { target: { value: 'nope' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
  expect(await screen.findByText('Paste a Competition Corner event link.')).toBeInTheDocument()
})
