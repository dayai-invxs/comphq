import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { currentPath, renderRoutes } from '@/test/harness'
import { LiveBadge } from '@/components/LiveBadge/LiveBadge'
import { OperatorShell } from './OperatorShell'

function mount(props: Partial<Parameters<typeof OperatorShell>[0]> = {}) {
  return renderRoutes(
    <Route
      path="/rugged/judges"
      element={
        <OperatorShell title="Workout 3 · Helen" {...props}>
          <p>Lane 1 — Alice Adams</p>
        </OperatorShell>
      }
    />,
    ['/rugged/judges'],
  )
}

describe('OperatorShell', () => {
  it('names what is being worked on as the page heading', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Workout 3 · Helen', level: 1 })).toBeTruthy()
  })

  // A station is not browsing. v1 put the full seven-link public nav on these
  // screens, which is six ways to lose the job in hand.
  it('offers no navigation', () => {
    mount()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('carries the moment in its context bar', () => {
    mount({ context: <LiveBadge>Heat 3</LiveBadge> })
    expect(screen.getByRole('status').textContent).toBe('Heat 3')
  })

  it('gives one way back when there is one', () => {
    mount({ back: '/rugged' })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(currentPath()).toBe('/rugged')
  })

  it('has no back control when there is nowhere to go', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('docks the one primary action', () => {
    mount({ action: <button>Save heat</button> })
    expect(screen.getByRole('button', { name: 'Save heat' })).toBeTruthy()
  })

  it('renders the work in the main region', () => {
    mount()
    expect(screen.getByText('Lane 1 — Alice Adams').closest('main')).not.toBeNull()
  })
})
