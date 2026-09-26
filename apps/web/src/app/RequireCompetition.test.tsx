import { Route } from 'react-router'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { RequireCompetition } from './RequireCompetition'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

function mount(at: string) {
  return renderRoutes(
    <Route path=":slug" element={<RequireCompetition><p>the page</p></RequireCompetition>} />,
    [at],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue([{ id: 1, name: 'Summer Throwdown', slug: 'summer' }])
})

describe('RequireCompetition', () => {
  it('shows the page when the slug names a competition', async () => {
    mount('/summer')
    expect(await screen.findByText('the page')).toBeInTheDocument()
  })

  it('answers an unknown slug with a 404, as v1 did', async () => {
    mount('/nope')
    expect(await screen.findByText('This page could not be found.')).toBeInTheDocument()
    expect(screen.queryByText('the page')).not.toBeInTheDocument()
  })

  it('says nothing about the page until it knows', () => {
    mount('/summer')
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByText('This page could not be found.')).not.toBeInTheDocument()
  })

  // v1 resolved the slug on the server, so an unreachable database was a 500
  // rather than a 404. A SPA has one screen for "not this page", and showing
  // the page against a list that never arrived is the worse of the two.
  it('does not show the page when the list cannot be read', async () => {
    apiGet.mockRejectedValue(new Error('offline'))
    mount('/summer')
    expect(await screen.findByText('This page could not be found.')).toBeInTheDocument()
  })
})
