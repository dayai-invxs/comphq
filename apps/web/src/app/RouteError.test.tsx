import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RouteError } from './RouteError'

// The boundary exists for a gym projector nobody is standing next to: a
// render throw must land on a screen that says so and offers the one action
// that helps, never a white page.

function boot(routes: Parameters<typeof createMemoryRouter>[0], path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
}

describe('RouteError', () => {
  it('catches a render throw and offers a reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bomb = () => { throw new Error('boom') }
    boot([{ path: '/', element: <Bomb />, errorElement: <RouteError /> }], '/')
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    vi.mocked(console.error).mockRestore()
  })

  it('names a missing page rather than calling it an error', () => {
    boot([{ path: '/', element: <p>home</p>, errorElement: <RouteError /> }], '/no-such-page')
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    // Nothing broke, so nothing to reload.
    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument()
  })
})
