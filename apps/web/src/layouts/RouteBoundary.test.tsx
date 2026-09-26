import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RouteBoundary } from './RouteBoundary'

function Boom({ fail }: { fail: boolean }): React.ReactElement {
  if (fail) throw new Error('leaderboard blew up')
  return <p>the board</p>
}

describe('RouteBoundary', () => {
  // React logs a caught render error itself, and so does this on purpose —
  // the failure is reported, never swallowed.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('renders the screen when nothing throws', () => {
    render(<RouteBoundary><Boom fail={false} /></RouteBoundary>)
    expect(screen.getByText('the board')).toBeTruthy()
  })

  it('reports the failure rather than hiding it', () => {
    render(<RouteBoundary><Boom fail /></RouteBoundary>)
    expect(screen.getByText('This screen failed to load')).toBeTruthy()
    expect(screen.getByText('leaderboard blew up')).toBeTruthy()
    expect(console.error).toHaveBeenCalled()
  })

  // The error is held until someone asks again — a boundary that cleared
  // itself would loop straight back into the throw.
  it('holds the failure until a retry is asked for', () => {
    const onReset = vi.fn()
    const { rerender } = render(
      <RouteBoundary onReset={onReset}><Boom fail /></RouteBoundary>,
    )
    rerender(<RouteBoundary onReset={onReset}><Boom fail={false} /></RouteBoundary>)
    expect(screen.queryByText('the board')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onReset).toHaveBeenCalled()
    expect(screen.getByText('the board')).toBeTruthy()
  })
})
