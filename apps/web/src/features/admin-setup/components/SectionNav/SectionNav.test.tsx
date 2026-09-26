import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SectionNav } from './SectionNav'
import type { SectionLink } from './SectionNav'

// The list that reaches setup's six regions without scrolling through them.

const LINKS: SectionLink[] = [
  { id: 'setup-settings', label: 'Settings' },
  { id: 'setup-logo', label: 'Logo' },
  { id: 'setup-divisions', label: 'Divisions' },
]

const nav = () => within(screen.getByRole('navigation', { name: 'Setup sections' }))

it('names itself, so it is not one of several unnamed navigations', () => {
  render(<SectionNav links={LINKS} />)
  expect(screen.getByRole('navigation', { name: 'Setup sections' })).toBeInTheDocument()
})

it('lists every region it was given, in the order it was given them', () => {
  render(<SectionNav links={LINKS} />)
  expect(nav().getAllByRole('link').map((a) => a.textContent))
    .toEqual(['Settings', 'Logo', 'Divisions'])
})

// Fragments rather than a scroll listener: the browser already knows how to
// reach one, and the address survives being copied or opened in a new tab.
it('points at the region ids on the page it sits on', () => {
  render(<SectionNav links={LINKS} />)
  expect(nav().getByRole('link', { name: 'Divisions' })).toHaveAttribute('href', '#setup-divisions')
})

it('draws nothing at all when there is nothing to reach', () => {
  render(<SectionNav links={[]} />)
  expect(nav().queryAllByRole('link')).toHaveLength(0)
})

it('takes a class from the page, so the page decides where it sits', () => {
  render(<SectionNav links={LINKS} className="from-the-page" />)
  expect(screen.getByRole('navigation', { name: 'Setup sections' })).toHaveClass('from-the-page')
})
