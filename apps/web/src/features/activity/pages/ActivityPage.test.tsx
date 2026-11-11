import { Route } from 'react-router'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { ActivityPage } from './ActivityPage'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

const DATA = {
  workouts: [{ id: 3, number: 1, name: 'Fran', scoreType: 'reps' }],
  athletes: [{ id: 4, name: 'Ada Ant' }, { id: 5, name: 'Bob Brown' }],
  entries: [
    { id: 2, at: '2026-11-11T15:01:00Z', who: 'sam@example.test', action: 'POST /workouts/:id/scores', resourceId: '3', diff: { params: { id: '3' }, body: { athleteId: 5, rawScore: 110 } } },
    { id: 1, at: '2026-11-11T15:00:00Z', who: 'kim@example.test', action: 'POST /athletes/:id/withdraw', resourceId: '4', diff: { params: { id: '4' } } },
  ],
}

const mount = () => renderRoutes(<Route path=":slug" element={<ActivityPage />} />, ['/summer'])

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue(DATA)
})

it('lists each change in words, with who made it', async () => {
  mount()
  expect(await screen.findByText("Saved Bob Brown's score in Event 1 - Fran: 110")).toBeInTheDocument()
  expect(screen.getByText('Withdrew Ada Ant')).toBeInTheDocument()
  expect(screen.getByText('kim@example.test')).toBeInTheDocument()
  expect(apiGet).toHaveBeenCalledWith('/api/activity?slug=summer')
})

it('finds the changes that mention a name', async () => {
  mount()
  await screen.findByText('Withdrew Ada Ant')
  fireEvent.change(screen.getByLabelText('Search activity'), { target: { value: 'bob' } })
  expect(screen.getByText("Saved Bob Brown's score in Event 1 - Fran: 110")).toBeInTheDocument()
  expect(screen.queryByText('Withdrew Ada Ant')).not.toBeInTheDocument()
})

it('says when nothing has changed yet', async () => {
  apiGet.mockResolvedValue({ ...DATA, entries: [] })
  mount()
  expect(await screen.findByText('Nothing yet')).toBeInTheDocument()
})

it('says the read failed rather than showing an empty trail', async () => {
  apiGet.mockRejectedValue(new Error('Competition admin access required'))
  mount()
  expect(await screen.findByText('Could not load the activity')).toBeInTheDocument()
})
