import { Route } from 'react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { ForgotPasswordPage } from './ForgotPasswordPage'

const { resetPasswordForEmail } = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { resetPasswordForEmail } }) }))

function mount() {
  return renderRoutes(<Route path="/forgot-password" element={<ForgotPasswordPage />} />, ['/forgot-password'])
}

function ask(email = 'boss@comphq.test') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  resetPasswordForEmail.mockResolvedValue({ error: null })
})

describe('ForgotPasswordPage', () => {
  // The link has to come back to this app, so the origin is read at send time
  // rather than configured — the same build serves preview and production.
  it('sends the link back to this origin', async () => {
    mount()
    ask()
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('boss@comphq.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    }))
  })

  it('confirms without confirming the account exists', async () => {
    mount()
    ask()
    expect(await screen.findByRole('status')).toHaveTextContent(/Check your inbox/)
    expect(screen.getByText('boss@comphq.test')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send Reset Link' })).not.toBeInTheDocument()
  })

  it('reports what the auth server said when the send fails', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'For security purposes, wait 60 seconds' } })
    mount()
    ask()
    expect(await screen.findByText('For security purposes, wait 60 seconds')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled()
  })

  // MDS 6.1.1: a loading button stays focusable, so it is locked by
  // aria-disabled and a swallowed click rather than the disabled attribute.
  it('locks the button while the request is in flight', async () => {
    let release: (value: { error: null }) => void = () => {}
    resetPasswordForEmail.mockReturnValue(new Promise((resolve) => { release = resolve }))
    mount()
    ask()
    const button = screen.getByRole('button', { name: 'Send Reset Link' })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
    release({ error: null })
    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument()
  })

  it('offers the way back to sign in from both states', async () => {
    mount()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
    ask()
    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login')
  })
})
