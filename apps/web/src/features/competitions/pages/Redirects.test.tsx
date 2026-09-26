import { Route } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentPath, renderRoutes } from '@/test/harness'
import { FirstCompetitionRedirect, SlugRedirect } from './Redirects'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

const COMPETITIONS = [
  { id: 1, name: 'Summer Throwdown', slug: 'summer' },
  { id: 2, name: 'Winter Open', slug: 'winter-open' },
]

function mount(entry: string) {
  return renderRoutes(
    <>
      <Route path="/ops" element={<FirstCompetitionRedirect page="athlete-overview" />} />
      <Route path="/control" element={<FirstCompetitionRedirect page="control" />} />
      <Route path="/:slug/ops" element={<SlugRedirect page="athlete-overview" />} />
      <Route path="*" element={<div>elsewhere</div>} />
    </>,
    [entry],
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue(COMPETITIONS)
})

describe('FirstCompetitionRedirect', () => {
  it('sends /ops to the first competition’s athlete overview', async () => {
    mount('/ops')
    await waitFor(() => expect(currentPath()).toBe('/summer/athlete-overview'))
  })

  it('sends /control to the first competition’s control screen', async () => {
    mount('/control')
    await waitFor(() => expect(currentPath()).toBe('/summer/control'))
  })

  it('falls back to the picker when there is no competition to pick', async () => {
    apiGet.mockResolvedValue([])
    mount('/ops')
    await waitFor(() => expect(currentPath()).toBe('/'))
  })

  // v1 swallowed the query error and redirected to '/' — the operator gets the
  // picker rather than a stack trace.
  it('falls back to the picker when the list cannot be read', async () => {
    apiGet.mockRejectedValue(new Error('500'))
    mount('/ops')
    await waitFor(() => expect(currentPath()).toBe('/'))
  })

  it('waits for the list before deciding where to go', () => {
    apiGet.mockReturnValue(new Promise(() => {}))
    mount('/ops')
    expect(currentPath()).toBe('/ops')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('SlugRedirect', () => {
  // v1 moved /[slug]/ops to /[slug]/athlete-overview and kept the old URL
  // answering, because it is printed on paper somewhere.
  it('keeps the competition and changes the page, without a round trip', async () => {
    mount('/winter-open/ops')
    await waitFor(() => expect(currentPath()).toBe('/winter-open/athlete-overview'))
    expect(apiGet).not.toHaveBeenCalled()
  })
})
