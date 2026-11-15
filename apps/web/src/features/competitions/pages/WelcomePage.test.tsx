import { Route } from 'react-router'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { isPastCompetition, WelcomePage } from './WelcomePage'

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

// Only competitions still to come (or under way today) show by default; the
// search reads the same list. "Show past competitions" brings the rest back.
describe('past competitions', () => {
  const DAY = 24 * 60 * 60 * 1000
  const LIST = [
    { id: 1, name: 'Summer Throwdown', slug: 'summer', lastStartMs: Date.now() + 30 * DAY },
    { id: 2, name: 'Winter Open', slug: 'winter-open', lastStartMs: Date.now() - 60 * DAY },
    { id: 3, name: 'Spring Fling', slug: 'spring', lastStartMs: null },
  ]
  beforeEach(() => { apiGet.mockResolvedValue(LIST) })

  it('hides a competition whose workouts all started before today', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    expect(screen.getByRole('link', { name: /Spring Fling/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Winter Open/ })).not.toBeInTheDocument()
  })

  it('shows them all with the switch on', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    fireEvent.click(screen.getByRole('switch', { name: 'Show past competitions' }))
    expect(screen.getByRole('link', { name: /Winter Open/ })).toBeInTheDocument()
  })

  it('leaves past ones out of a search, and says one matched', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    search('winter')
    expect(screen.getByText('No upcoming competition by that name')).toBeInTheDocument()
    expect(screen.getByText('A past competition matches.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show past competitions' }))
    expect(screen.getByRole('link', { name: /Winter Open/ })).toBeInTheDocument()
  })

  it('finds a past one by search with the switch on', async () => {
    mount()
    await screen.findByRole('link', { name: /Summer Throwdown/ })
    fireEvent.click(screen.getByRole('switch', { name: 'Show past competitions' }))
    search('winter')
    expect(screen.getByRole('link', { name: /Winter Open/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Summer Throwdown/ })).not.toBeInTheDocument()
  })

  it('says when every competition is past', async () => {
    apiGet.mockResolvedValue([LIST[1]])
    mount()
    expect(await screen.findByText('No upcoming competitions')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show past competitions' }))
    expect(screen.getByRole('link', { name: /Winter Open/ })).toBeInTheDocument()
  })
})

describe('isPastCompetition', () => {
  const now = new Date(2026, 10, 14, 18, 0)
  const c = (lastStartMs: number | null) => ({ id: 1, name: 'A', slug: 'a', lastStartMs })

  it('keeps one listed through the day of its last workout', () => {
    expect(isPastCompetition(c(new Date(2026, 10, 14, 8, 0).getTime()), now)).toBe(false)
  })

  it('counts one as past from the day after', () => {
    expect(isPastCompetition(c(new Date(2026, 10, 13, 23, 0).getTime()), now)).toBe(true)
  })

  it('treats one with no start times as upcoming', () => {
    expect(isPastCompetition(c(null), now)).toBe(false)
  })
})
