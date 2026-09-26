import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider, useSession } from './session'

const { getUser, signOut, onAuthStateChange, unsubscribe } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({ auth: { getUser, signOut, onAuthStateChange } }),
}))

const USER = { id: 'u1', email: 'judge@comphq.test' }

let emit: (event: string, session: { user: typeof USER } | null) => void

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: null }, error: null })
  signOut.mockResolvedValue({ error: null })
  onAuthStateChange.mockImplementation((cb: typeof emit) => {
    emit = cb
    return { data: { subscription: { unsubscribe } } }
  })
})

function Probe() {
  const { user, loading } = useSession()
  return <div data-testid="probe">{loading ? 'loading' : (user?.email ?? 'signed out')}</div>
}

function renderProbe() {
  return render(<SessionProvider><Probe /></SessionProvider>)
}

describe('SessionProvider', () => {
  it('starts loading, so a gate does not redirect before the answer arrives', () => {
    renderProbe()
    expect(screen.getByTestId('probe')).toHaveTextContent('loading')
  })

  // getUser, not getSession: it validates the token against the auth server,
  // which is what v1's layouts gated on.
  it('publishes the signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: USER }, error: null })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('judge@comphq.test'))
    expect(getUser).toHaveBeenCalled()
  })

  it('settles on signed out when there is no session', async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed out'))
  })

  // A refresh failure or a sign-out in another tab arrives this way, and v1's
  // competition-admin layout gated on exactly that.
  it('follows auth state changes after the first load', async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed out'))
    emit('SIGNED_IN', { user: USER })
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('judge@comphq.test'))
    emit('SIGNED_OUT', null)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed out'))
  })

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderProbe()
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled())
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('signs out through the client', async () => {
    function Out() {
      const { signOut: out } = useSession()
      return <button onClick={() => void out()}>out</button>
    }
    render(<SessionProvider><Out /></SessionProvider>)
    screen.getByRole('button').click()
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })
})

describe('useSession', () => {
  it('names the missing provider rather than reading null', () => {
    expect(() => render(<Probe />)).toThrow(/SessionProvider/)
  })
})
