import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { renderRoutes } from '@/test/harness'
import { AdminShell } from './AdminShell'
import type { NavGroup } from './nav'

const groups: NavGroup[] = [
  {
    label: 'Run',
    items: [
      { to: '/rugged/admin', label: 'Dashboard', icon: 'dashboard' },
      { to: '/rugged/admin/workouts', label: 'Workouts', icon: 'workouts' },
    ],
  },
  {
    label: 'People',
    items: [{ to: '/rugged/admin/people', label: 'People', icon: 'people' }],
  },
]

function mount(at = '/rugged/admin', onSignOut = vi.fn()) {
  renderRoutes(
    <Route
      path="/rugged/admin/*"
      element={
        <AdminShell
          title="comphq"
          groups={groups}
          extras={[{ to: '/rugged', label: 'Schedule', icon: 'schedule' }]}
          onSignOut={onSignOut}
        >
          <h1>Dashboard</h1>
        </AdminShell>
      }
    />,
    [at],
  )
  return onSignOut
}

describe('AdminShell', () => {
  // The point of the grouping: eight rows named after tables is a list to
  // search, three named runs is a place to look.
  it('groups the rail by what the person is doing', () => {
    mount()
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    const run = within(nav).getByRole('group', { name: 'Run' })
    expect(within(run).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Dashboard', 'Workouts',
    ])
    expect(within(nav).getByRole('group', { name: 'People' })).toBeTruthy()
  })

  it('keeps the way out of the admin tree separate from the work in it', () => {
    mount()
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    const out = within(nav).getByRole('group', { name: 'Public' })
    expect(within(out).getByRole('link', { name: 'Schedule' })).toBeTruthy()
  })

  it('marks the destination the reader is on', () => {
    mount('/rugged/admin/workouts')
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    expect(within(nav).getByRole('link', { name: 'Workouts' }).getAttribute('aria-current')).toBe('page')
  })

  it('signs out from the rail', () => {
    const onSignOut = mount()
    const nav = screen.getByRole('navigation', { name: 'Admin' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalled()
  })

  it('renders the screen in the main region', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Dashboard' }).closest('main')).not.toBeNull()
  })

  it('leads with a skip link into the content', () => {
    mount()
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main')
  })
})
