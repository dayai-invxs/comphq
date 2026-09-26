import { Route } from 'react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { LoginPage } from './LoginPage'

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { signInWithPassword } }) }))

function mount(entry = '/login') {
  return renderRoutes(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<div>elsewhere</div>} />
    </>,
    [entry],
  )
}

function fillIn(email = 'boss@comphq.test', password = 'correct horse battery') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  signInWithPassword.mockResolvedValue({ error: null })
})

describe('LoginPage', () => {
  it('signs in with what was typed and lands on the callback URL', async () => {
    mount('/login?callbackUrl=%2Fgolden%2Fadmin')
    fillIn()
    await waitFor(() => expect(currentPath()).toBe('/golden/admin'))
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'boss@comphq.test',
      password: 'correct horse battery',
    })
  })

  it('lands on /admin when no callback was asked for', async () => {
    mount()
    fillIn()
    await waitFor(() => expect(currentPath()).toBe('/admin'))
  })

  // An open redirect: a link to /login?callbackUrl=https://evil.example would
  // otherwise send a freshly signed-in admin off-site.
  it('refuses a callback URL that is not same-origin', async () => {
    mount('/login?callbackUrl=https%3A%2F%2Fevil.example%2Fsteal')
    fillIn()
    await waitFor(() => expect(currentPath()).toBe('/admin'))
  })

  it('reports a rejected sign-in without saying which half was wrong', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    mount()
    fillIn()
    // Announced, not merely coloured: a refusal a reader cannot see is a
    // refusal they never learn about.
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(currentPath()).toBe('/login')
  })

  // MDS 6.1.1: a loading button stays focusable, so it is locked by
  // aria-disabled and a swallowed click rather than the disabled attribute.
  it('locks the button while the request is in flight', async () => {
    let release: (value: { error: null }) => void = () => {}
    signInWithPassword.mockReturnValue(new Promise((resolve) => { release = resolve }))
    mount()
    fillIn()
    const button = await screen.findByRole('button', { name: 'Sign In' })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(signInWithPassword).toHaveBeenCalledTimes(1)
    release({ error: null })
    await waitFor(() => expect(currentPath()).toBe('/admin'))
  })

  it('offers the way out for a forgotten password', () => {
    mount()
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })
})
