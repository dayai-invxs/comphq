import { Route } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { AdminApp } from './AdminApp'

const { apiGet, useSession, signOut } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useSession: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/session', () => ({ useSession }))

const USER = { id: 'u1', email: 'boss@comphq.test' }

function serve(routes: Record<string, unknown>) {
  apiGet.mockImplementation((path: string) => {
    if (path in routes) return Promise.resolve(routes[path])
    return Promise.reject(new Error(`no fixture for ${path}`))
  })
}

function mount() {
  return renderRoutes(
    <Route path="/admin" element={<AdminApp />}>
      <Route index element={<div>site dashboard</div>} />
    </Route>,
    ['/admin'],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSession.mockReturnValue({ user: USER, loading: false, signOut })
  serve({ '/api/me': { id: 'u1', email: USER.email, isSuper: true }, '/api/competitions/mine': [] })
})

describe('AdminApp', () => {
  it('renders the dashboard for a super admin', async () => {
    mount()
    expect(await screen.findByText('site dashboard')).toBeInTheDocument()
  })

  it('waits rather than deciding while the session is still loading', () => {
    useSession.mockReturnValue({ user: null, loading: true, signOut })
    mount()
    expect(currentPath()).toBe('/admin')
    expect(apiGet).not.toHaveBeenCalled()
  })

  // v1 sent the literal /admin as the callback, even from /admin/users.
  it('sends a signed-out visitor to login with /admin as the callback', async () => {
    useSession.mockReturnValue({ user: null, loading: false, signOut })
    mount()
    await waitFor(() => expect(currentPath()).toBe(`/login?callbackUrl=${encodeURIComponent('/admin')}`))
  })

  // v1 read the target out of the public list of every competition, so a
  // member of one competition was sent to a stranger's and told they had no
  // access to it (defect 17).
  it('sends a non-super to a competition they actually administer', async () => {
    serve({
      '/api/me': { id: 'u1', email: USER.email, isSuper: false },
      '/api/competitions/mine': [{ id: 3, name: 'Mine', slug: 'mine', role: 'admin' }],
    })
    mount()
    await waitFor(() => expect(currentPath()).toBe('/mine/admin'))
    expect(apiGet).not.toHaveBeenCalledWith('/api/competitions')
  })

  it('tells a non-super with no competitions to ask for access', async () => {
    serve({ '/api/me': { id: 'u1', email: USER.email, isSuper: false }, '/api/competitions/mine': [] })
    mount()
    expect(await screen.findByRole('heading', { name: /access required/i })).toBeInTheDocument()
    expect(screen.queryByText('site dashboard')).not.toBeInTheDocument()
  })

  // v1 read isSuper off a 200 body only; any other outcome fell through to the
  // non-super branch. But a failed read is not an answer: "Access required"
  // over a network error tells a real super-admin they were demoted.
  it('reports an unreadable /api/me instead of calling it not super', async () => {
    serve({ '/api/competitions/mine': [] })
    mount()
    expect(await screen.findByRole('heading', { name: /could not check access/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /access required/i })).not.toBeInTheDocument()
  })

  it('retries a failed access check and lets the super through', async () => {
    serve({ '/api/competitions/mine': [] })
    mount()
    await screen.findByRole('heading', { name: /could not check access/i })
    serve({ '/api/me': { id: 'u1', email: USER.email, isSuper: true }, '/api/competitions/mine': [] })
    screen.getByRole('button', { name: /try again/i }).click()
    expect(await screen.findByText('site dashboard')).toBeInTheDocument()
  })

  it('signs out and returns to login', async () => {
    serve({ '/api/me': { id: 'u1', email: USER.email, isSuper: false }, '/api/competitions/mine': [] })
    mount()
    const button = await screen.findByRole('button', { name: /sign out/i })
    button.click()
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(currentPath()).toBe('/login'))
  })
})
