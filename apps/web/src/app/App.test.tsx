import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The stack under test is the real one — query cache, session, data router.
// Only the network boundary is faked, and only at the client, so
// SessionProvider runs the same code it runs in a browser.
const auth = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth }),
  getSupabaseEnv: () => ({ url: 'https://project.supabase.co', anonKey: 'anon-key' }),
}))

// The router reads the address bar when the module is first evaluated, so the
// location has to be set before the import, not before the render.
async function boot(path: string) {
  window.history.replaceState({}, '', path)
  vi.resetModules()
  const { App } = await import('./App')
  render(<App />)
}

beforeEach(() => {
  auth.getUser.mockClear()
})

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('App', () => {
  it('serves a public route without asking anything of the visitor', async () => {
    await boot('/login')
    expect(await screen.findByRole('heading', { name: 'Admin Login' })).toBeInTheDocument()
  })

  // Every layer has to be wired for this to land: the session resolves signed
  // out, the admin gate reads it, and the router carries out the redirect.
  it('sends a signed-out visitor from /admin to the login page', async () => {
    await boot('/admin')
    expect(await screen.findByRole('heading', { name: 'Admin Login' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(window.location.search).toBe('?callbackUrl=%2Fadmin')
  })
})
