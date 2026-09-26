import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route } from 'react-router'
import { renderRoutes } from '@/test/harness'
import { PublicApp } from './PublicApp'

describe('PublicApp', () => {
  it('renders the matched page inside the scrolling body', async () => {
    renderRoutes(
      <Route path="/" element={<PublicApp />}>
        <Route index element={<h1>Competitions</h1>} />
      </Route>,
      ['/'],
    )
    const heading = await screen.findByRole('heading', { name: 'Competitions' })
    expect(heading.closest('main')).not.toBeNull()
  })

  // No gate, no fetch: a public page is public. v1's root layout asked nothing
  // of the visitor, and neither does this.
  it('adds no navigation of its own', () => {
    renderRoutes(
      <Route path="/" element={<PublicApp />}>
        <Route index element={<p>page</p>} />
      </Route>,
      ['/'],
    )
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
