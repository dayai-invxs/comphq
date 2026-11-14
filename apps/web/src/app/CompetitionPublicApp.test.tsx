import { Route } from 'react-router'
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { CompetitionPublicApp } from './CompetitionPublicApp'

const { apiGet, useSession } = vi.hoisted(() => ({ apiGet: vi.fn(), useSession: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/session', () => ({ useSession }))

function mount(at = '/rugged') {
  return renderRoutes(
    <Route path="/:slug" element={<CompetitionPublicApp />}>
      <Route index element={<h1>Schedule</h1>} />
    </Route>,
    [at],
  )
}

const tabBar = () => screen.getByRole('button', { name: 'More' }).closest('nav')!

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
  useSession.mockReturnValue({ user: null, loading: false })
})

describe('CompetitionPublicApp', () => {
  it('draws the matched screen inside the public frame', async () => {
    mount()
    const heading = await screen.findByRole('heading', { name: 'Schedule' })
    expect(heading.closest('main')).not.toBeNull()
  })

  // The whole job of this layout: the slug in the address is the slug every
  // destination points at.
  it('points every destination at the competition in the address', () => {
    mount()
    expect(within(tabBar()).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/rugged', '/rugged/leaderboard', '/rugged/workouts', '/rugged/athlete-overview',
    ])
  })

  it('follows the address to another competition', () => {
    mount('/winter')
    expect(within(tabBar()).getByRole('link', { name: 'Leaderboard' }))
      .toHaveAttribute('href', '/winter/leaderboard')
  })

  it('names the bar with the competition’s own logo', async () => {
    mount()
    expect(await screen.findByRole('img', { name: 'Competition logo' })).toBeInTheDocument()
  })

  // Signed in or not is the session's answer, read here and handed down.
  it('folds the staff run for a visitor and opens it for someone signed in', () => {
    const { unmount } = mount()
    expect(screen.getAllByRole('button', { name: 'Staff' })[0]).toHaveAttribute('aria-expanded', 'false')
    unmount()
    useSession.mockReturnValue({ user: { id: 'u1' }, loading: false })
    mount()
    expect(screen.queryByRole('button', { name: 'Staff' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'TV Display' }).length).toBeGreaterThan(0)
  })
})
