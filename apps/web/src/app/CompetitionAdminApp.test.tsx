import { Route } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { CompetitionAdminApp } from './CompetitionAdminApp'

const { apiGet, useSession, signOut } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useSession: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/session', () => ({ useSession }))

const USER = { id: 'u1', email: 'scorer@comphq.test' }
const MINE = [{ id: 1, name: 'Summer Throwdown', slug: 'summer', role: 'admin' }]

function serve(routes: Record<string, unknown>) {
  apiGet.mockImplementation((path: string) =>
    path in routes ? Promise.resolve(routes[path]) : Promise.reject(new Error(`no fixture for ${path}`)))
}

function mount(entry = '/summer/admin') {
  return renderRoutes(
    <Route path="/:slug/admin" element={<CompetitionAdminApp />}>
      <Route index element={<div>comp dashboard</div>} />
      <Route path="people" element={<div>people</div>} />
    </Route>,
    [entry],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSession.mockReturnValue({ user: USER, loading: false, signOut })
  serve({
    '/api/me': { id: 'u1', email: USER.email, isSuper: false },
    '/api/competitions/mine': MINE,
    '/api/logo': { url: null },
  })
})

describe('CompetitionAdminApp', () => {
  it('renders the competition for one of its admins', async () => {
    mount()
    expect(await screen.findByText('comp dashboard')).toBeInTheDocument()
  })

  it('lets a super admin in without a membership row', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: true },
      '/api/competitions/mine': [],
      '/api/logo': { url: null },
    })
    mount()
    expect(await screen.findByText('comp dashboard')).toBeInTheDocument()
  })

  // v1 sent the route the visitor was actually on, unlike the site shell.
  it('sends a signed-out visitor to login with the current path as the callback', async () => {
    useSession.mockReturnValue({ user: null, loading: false, signOut })
    mount('/summer/admin/people')
    await waitFor(() =>
      expect(currentPath()).toBe(`/login?callbackUrl=${encodeURIComponent('/summer/admin/people')}`))
  })

  // A failed read is not an answer: showing "No access" over a network error
  // tells a legitimate admin they lost their competition. This is how every
  // API failure surfaced before the functions origin was reachable.
  it('reports a failed access check instead of calling it no access', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/logo': { url: null },
    })
    mount()
    expect(await screen.findByRole('heading', { name: /could not check access/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /no access/i })).not.toBeInTheDocument()
  })

  it('retries a failed access check and lets the admin through', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/logo': { url: null },
    })
    mount()
    await screen.findByRole('heading', { name: /could not check access/i })
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/competitions/mine': MINE,
      '/api/logo': { url: null },
    })
    screen.getByRole('button', { name: /try again/i }).click()
    expect(await screen.findByText('comp dashboard')).toBeInTheDocument()
  })

  it('names the competition a signed-in stranger has no access to', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/competitions/mine': [{ id: 2, name: 'Other', slug: 'other', role: 'admin' }],
      '/api/logo': { url: null },
    })
    mount()
    expect(await screen.findByRole('heading', { name: /no access to this competition/i })).toBeInTheDocument()
    expect(screen.getByText('summer')).toBeInTheDocument()
  })

  // role='user' members administer the competition in v1 (defect 3) but do not
  // get the Users link, which is the one screen gated on role='admin'.
  it('hides Users from a role=user member and shows it to an admin', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/competitions/mine': [{ ...MINE[0], role: 'user' }],
      '/api/logo': { url: null },
    })
    mount()
    await screen.findByText('comp dashboard')
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument()
  })

  it('shows Users to a role=admin member', async () => {
    mount()
    await screen.findByText('comp dashboard')
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  // A super admin administers every competition, so the shell they are
  // standing in is not the only one they run. Without a labelled way out, the
  // site dashboard is reachable only by knowing the URL or guessing that the
  // logo is a link.
  it('offers a super admin the site screens', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: true },
      '/api/competitions/mine': [],
      '/api/logo': { url: null },
    })
    mount()
    await screen.findByText('comp dashboard')
    expect(screen.getByRole('link', { name: 'Competitions' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Manage Users' })).toHaveAttribute('href', '/admin/users')
  })

  it('keeps the site screens from a competition admin who is not super', async () => {
    mount()
    await screen.findByText('comp dashboard')
    expect(screen.queryByRole('link', { name: 'Competitions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage Users' })).not.toBeInTheDocument()
  })

  it('points the nav at this competition', async () => {
    mount()
    await screen.findByText('comp dashboard')
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/summer/admin/people')
    expect(screen.getByRole('link', { name: 'Judges' })).toHaveAttribute('href', '/summer/judges')
  })

  it('shows the uploaded logo when there is one', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/competitions/mine': MINE,
      '/api/logo': { url: 'https://cdn.example/logo.png' },
    })
    mount()
    expect(await screen.findByAltText(/competition logo/i)).toHaveAttribute('src', 'https://cdn.example/logo.png')
  })

  it('signs out and returns to login', async () => {
    mount()
    await screen.findByText('comp dashboard')
    screen.getByRole('button', { name: /sign out/i }).click()
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(currentPath()).toBe('/login'))
  })
})
