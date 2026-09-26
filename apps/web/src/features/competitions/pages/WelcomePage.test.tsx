import { Route } from 'react-router'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { WelcomePage } from './WelcomePage'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

const COMPETITIONS = [
  { id: 1, name: 'Summer Throwdown', slug: 'summer' },
  { id: 2, name: 'Winter Open', slug: 'winter-open' },
]

function mount() {
  return renderRoutes(<Route path="/" element={<WelcomePage />} />, ['/'])
}

function search(term: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search competitions' }), { target: { value: term } })
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue(COMPETITIONS)
})

describe('WelcomePage', () => {
  it('lists every competition as a link to its public page', async () => {
    mount()
    expect(await screen.findByRole('link', { name: /Summer Throwdown/ })).toHaveAttribute('href', '/summer')
    expect(screen.getByRole('link', { name: /Winter Open/ })).toHaveAttribute('href', '/winter-open')
    expect(apiGet).toHaveBeenCalledWith('/api/competitions')
  })

  it('shows the public address each one answers to', async () => {
    mount()
    expect(await screen.findByText('comphq.pro/summer')).toBeInTheDocument()
  })

  it('filters on name, case-insensitively', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    search('summer thr')
    expect(screen.getByRole('link', { name: /Summer Throwdown/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Winter Open/ })).not.toBeInTheDocument()
  })

  // The slug is what someone reads off a QR code or a printed sheet, so it is
  // searchable in its own right.
  it('filters on slug too', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    search('winter-o')
    expect(screen.getByRole('link', { name: /Winter Open/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Summer Throwdown/ })).not.toBeInTheDocument()
  })

  it('says when a search matched nothing', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    search('nothing here')
    expect(screen.getByText('No competition by that name')).toBeInTheDocument()
  })

  it('offers a way back to the whole list from a search that matched nothing', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    search('nothing here')
    fireEvent.click(screen.getByRole('button', { name: 'Show them all' }))
    expect(screen.getByRole('link', { name: /Summer Throwdown/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Winter Open/ })).toBeInTheDocument()
  })

  it('offers no search box when there is nothing to search', async () => {
    apiGet.mockResolvedValue([])
    mount()
    expect(await screen.findByText('No competitions yet')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  // v1 started from an empty array, so an install with competitions in it still
  // said "No competitions yet." until the fetch landed.
  it('waits for the answer rather than claiming there are none', () => {
    apiGet.mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.queryByText('No competitions yet')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading competitions' })).toBeInTheDocument()
  })

  // A failed read is the same lie by another route.
  it('says the read failed rather than claiming there are none', async () => {
    apiGet.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('Could not load the competitions')).toBeInTheDocument()
    expect(screen.queryByText('No competitions yet')).not.toBeInTheDocument()
  })
})
