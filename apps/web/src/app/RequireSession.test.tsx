import { Route } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { RequireSession } from './RequireSession'

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('@/lib/session', () => ({ useSession }))

function mount(path = '/summer/control') {
  return renderRoutes(
    <Route path=":slug/control" element={<RequireSession><p>The control screen</p></RequireSession>} />,
    [path],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useSession.mockReturnValue({ user: { id: 'u1' }, loading: false, signOut: vi.fn() })
})

describe('RequireSession', () => {
  it('shows the screen to someone signed in', () => {
    mount()
    expect(screen.getByText('The control screen')).toBeInTheDocument()
  })

  it('sends someone signed out to the login screen, carrying the way back', async () => {
    useSession.mockReturnValue({ user: null, loading: false, signOut: vi.fn() })
    mount()
    await waitFor(() =>
      expect(currentPath()).toBe(`/login?callbackUrl=${encodeURIComponent('/summer/control')}`))
  })

  // Redirecting while the first answer is still in flight sends a signed-in
  // visitor to /login on every reload.
  it('waits for the answer before deciding', () => {
    useSession.mockReturnValue({ user: null, loading: true, signOut: vi.fn() })
    mount()
    expect(currentPath()).toBe('/summer/control')
    expect(screen.queryByText('The control screen')).not.toBeInTheDocument()
  })

  it('does not draw the screen on the way out', () => {
    useSession.mockReturnValue({ user: null, loading: false, signOut: vi.fn() })
    mount()
    expect(screen.queryByText('The control screen')).not.toBeInTheDocument()
  })
})
