import { Route } from 'react-router'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { CompetitionBrand } from './CompetitionBrand'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

function mount(children = <CompetitionBrand />) {
  return renderRoutes(<Route path="/" element={children} />)
}

const lockup = () => screen.getByRole('img', { name: 'CompHQ' })

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue({ url: null })
})

describe('CompetitionBrand', () => {
  it('draws the logo the competition uploaded', async () => {
    apiGet.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
    mount()
    const logo = await screen.findByRole('img', { name: 'Competition logo' })
    expect(logo).toHaveAttribute('src', 'https://cdn.example/logo.png')
  })

  // A bar with a hole in it while a request is in flight is worse than a bar
  // with the wrong mark in it, and the CompHQ lockup is not the wrong mark.
  it('carries the CompHQ lockup until the read answers', () => {
    apiGet.mockImplementation(() => new Promise(() => {}))
    mount()
    expect(lockup()).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Competition logo' })).not.toBeInTheDocument()
  })

  it('keeps the lockup when the competition has uploaded nothing', async () => {
    mount()
    await screen.findByRole('img', { name: 'CompHQ' })
    expect(screen.queryByRole('img', { name: 'Competition logo' })).not.toBeInTheDocument()
  })

  it('keeps the lockup when the read fails outright', async () => {
    apiGet.mockRejectedValue(new Error('logo is down'))
    mount()
    await screen.findByRole('img', { name: 'CompHQ' })
    expect(screen.queryByRole('img', { name: 'Competition logo' })).not.toBeInTheDocument()
  })

  // The mark in the corner is the way home on every site people know, so it
  // is one here too — whichever mark the bar happens to carry.
  it('links home when it carries the lockup', () => {
    apiGet.mockImplementation(() => new Promise(() => {}))
    mount()
    const home = screen.getByRole('link', { name: 'CompHQ home' })
    expect(home).toHaveAttribute('href', '/')
    expect(home).toContainElement(lockup())
  })

  // The admin bars carry the same lockup but their "home" is the admin index,
  // so the destination is a prop rather than a second component.
  it('links where an admin bar points it', () => {
    apiGet.mockImplementation(() => new Promise(() => {}))
    mount(<CompetitionBrand href="/admin" />)
    expect(screen.getByRole('link', { name: 'CompHQ home' })).toHaveAttribute('href', '/admin')
  })

  it('links home when it carries an uploaded logo', async () => {
    apiGet.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
    mount()
    const logo = await screen.findByRole('img', { name: 'Competition logo' })
    const home = screen.getByRole('link', { name: 'CompHQ home' })
    expect(home).toHaveAttribute('href', '/')
    expect(home).toContainElement(logo)
  })

  // v1 asked from an effect inside its nav, so every public page fetched it
  // again. It is one shared query now, whoever draws it.
  it('asks for the logo once however many bars draw it', async () => {
    mount(<><CompetitionBrand /><CompetitionBrand /></>)
    await screen.findAllByRole('img', { name: 'CompHQ' })
    expect(apiGet.mock.calls.filter((c) => c[0] === '/api/logo')).toHaveLength(1)
  })
})
