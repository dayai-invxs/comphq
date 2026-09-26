import { Route } from 'react-router'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { ResetPasswordPage } from './ResetPasswordPage'

const { exchangeCodeForSession, getUser, updateUser } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { exchangeCodeForSession, getUser, updateUser } }),
}))

function mount(entry = '/reset-password') {
  return renderRoutes(
    <>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<div>elsewhere</div>} />
    </>,
    [entry],
  )
}

function submit(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirm } })
  fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }))
}

const GOOD = 'a-long-enough-password'

beforeEach(() => {
  vi.clearAllMocks()
  exchangeCodeForSession.mockResolvedValue({ error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  updateUser.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResetPasswordPage', () => {
  it('exchanges the PKCE code for a session and drops it from the URL', async () => {
    mount('/reset-password?code=one-time-code')
    await waitFor(() => expect(exchangeCodeForSession).toHaveBeenCalledWith('one-time-code'))
    // A refresh would otherwise re-attempt an exchange the server has spent.
    await waitFor(() => expect(currentPath()).toBe('/reset-password'))
    expect(getUser).not.toHaveBeenCalled()
  })

  // /auth/callback exchanges the code itself and lands here with a session.
  it('accepts an already-exchanged session when there is no code', async () => {
    mount()
    await waitFor(() => expect(getUser).toHaveBeenCalled())
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Set New Password' })).toBeEnabled()
  })

  // Until the link is verified the button sits disabled; the page says why,
  // rather than looking broken for the length of the round trip.
  it('says it is checking the link, until it has', async () => {
    let release!: () => void
    getUser.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ data: { user: { id: 'u1' } }, error: null })
    }))
    mount()
    expect(screen.getByRole('status')).toHaveTextContent('Checking the reset link…')
    act(() => release())
    await waitFor(() => expect(screen.queryByText('Checking the reset link…')).not.toBeInTheDocument())
  })

  it('says so when the link is spent', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid flow state' } })
    mount('/reset-password?code=spent')
    expect(await screen.findByText('Reset link is invalid or expired.')).toBeInTheDocument()
  })

  it('says so when there is no session to change a password on', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    mount()
    expect(await screen.findByText('Reset link is invalid or expired.')).toBeInTheDocument()
  })

  it('refuses a password under 12 characters without asking the server', async () => {
    mount()
    await screen.findByLabelText('New Password')
    submit('short')
    expect(await screen.findByText('Password must be at least 12 characters')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses two passwords that do not match', async () => {
    mount()
    await screen.findByLabelText('New Password')
    submit(GOOD, `${GOOD}-typo`)
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('reports what the auth server said and leaves the form usable', async () => {
    updateUser.mockResolvedValue({ error: { message: 'New password should be different' } })
    mount()
    await screen.findByLabelText('New Password')
    submit(GOOD)
    expect(await screen.findByText('New password should be different')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set New Password' })).toBeEnabled()
  })

  it('saves the password and sends the user on to /admin', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    await vi.waitFor(() => expect(screen.getByLabelText('New Password')).toBeInTheDocument())
    submit(GOOD)
    await vi.waitFor(() => expect(screen.getByText('Password updated. Redirecting…')).toBeInTheDocument())
    expect(updateUser).toHaveBeenCalledWith({ password: GOOD })
    expect(currentPath()).toBe('/reset-password')
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(currentPath()).toBe('/admin')
  })
})
