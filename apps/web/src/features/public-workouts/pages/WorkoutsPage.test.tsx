import { Route } from 'react-router'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { WorkoutsPage } from './WorkoutsPage'
import { WorkoutPage } from './WorkoutPage'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

const WORKOUTS = [
  { id: 11, number: 1, name: 'Fran', description: '21-15-9\nThrusters 95/65\nPull-ups', status: 'completed' },
  { id: 12, number: 2, name: 'Grace', description: null, status: 'active' },
]

function mount(at: string) {
  return renderRoutes(
    <>
      <Route path=":slug/workouts" element={<WorkoutsPage />} />
      <Route path=":slug/workouts/:workoutId" element={<WorkoutPage />} />
    </>,
    [at],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue(WORKOUTS)
})

describe('the workout list', () => {
  it('reads the public list and shows each workout by name', async () => {
    mount('/summer/workouts')
    const list = await screen.findByRole('list', { name: 'Workouts' })
    expect(within(list).getByText('Event 1 - Fran')).toBeInTheDocument()
    expect(within(list).getByText('Event 2 - Grace')).toBeInTheDocument()
    expect(within(list).queryByText('Workout 2')).not.toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('/api/schedule/workouts?slug=summer')
  })

  it('opens a workout on its full description', async () => {
    mount('/summer/workouts')
    fireEvent.click(await screen.findByRole('link', { name: /Fran/ }))
    expect(currentPath()).toBe('/summer/workouts/11')
    expect(await screen.findByRole('heading', { level: 1, name: 'Fran' })).toBeInTheDocument()
    expect(screen.getByText(/Thrusters 95\/65/)).toHaveTextContent('21-15-9 Thrusters 95/65 Pull-ups')
  })

  it('says so when nothing is announced yet', async () => {
    apiGet.mockResolvedValue([])
    mount('/summer/workouts')
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument()
  })
})

describe('one workout', () => {
  it('says when a workout has no description', async () => {
    mount('/summer/workouts/12')
    expect(await screen.findByText('Event 2')).toBeInTheDocument()
    expect(await screen.findByText('No description yet.')).toBeInTheDocument()
  })

  it('answers a workout that is not on the list, with a way back', async () => {
    mount('/summer/workouts/99')
    expect(await screen.findByText('No such workout')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'All workouts' }))
    expect(currentPath()).toBe('/summer/workouts')
  })
})
