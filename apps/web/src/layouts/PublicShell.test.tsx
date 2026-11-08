import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { currentPath, renderRoutes } from '@/test/harness'
import { PublicShell } from './PublicShell'

function mount(at = '/rugged') {
  return renderRoutes(
    <Route path="/:slug" element={<PublicShell slug="rugged" brand="Rugged Rumble" />}>
      <Route index element={<h1>Competition Schedule</h1>} />
      <Route path="leaderboard" element={<h1>Leaderboard</h1>} />
      <Route path="workouts/:workoutId" element={<h1>Fran</h1>} />
    </Route>,
    [at],
  )
}

// The bar and the rail are the same destinations drawn twice, and CSS shows
// exactly one of them. jsdom applies no CSS, so both are here — each is found
// by what only it contains.
const tabBar = () => screen.getByRole('button', { name: 'More' }).closest('nav')!
const rail = () =>
  screen.getAllByRole('navigation', { name: 'Competition' }).find((n) => n !== tabBar())!

describe('PublicShell', () => {
  it('renders the matched screen in the main region', async () => {
    mount()
    const heading = await screen.findByRole('heading', { name: 'Competition Schedule' })
    expect(heading.closest('main')).not.toBeNull()
  })

  // The split that matters: a spectator's screens are one tap away, the crew's
  // are one step further in.
  it('gives the phone bar the four spectator destinations and nothing else', () => {
    mount()
    const bar = tabBar()
    expect(within(bar).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Schedule', 'Leaderboard', 'Workouts', 'Athletes/Teams',
    ])
    expect(within(bar).queryByRole('link', { name: 'Judges' })).toBeNull()
  })

  // A wide screen has the room to show them, but not to mix them in.
  it('keeps the staff screens in their own run on the rail', () => {
    mount()
    const staff = within(rail()).getByRole('group', { name: 'Staff' })
    expect(within(staff).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Judges', 'Equipment', 'Control', 'Admin',
    ])
  })

  it('reaches the staff screens from the phone bar through More', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const sheet = await screen.findByRole('dialog', { name: 'More' })
    for (const label of ['Judges', 'Equipment', 'Control', 'Admin']) {
      expect(within(sheet).getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('navigates to a staff screen and closes behind itself', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const sheet = await screen.findByRole('dialog', { name: 'More' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Judges' }))
    expect(currentPath()).toBe('/rugged/judges')
  })

  it('marks the destination the reader is on', async () => {
    mount('/rugged/leaderboard')
    const current = await screen.findAllByRole('link', { name: 'Leaderboard' })
    expect(current.every((l) => l.getAttribute('aria-current') === 'page')).toBe(true)
  })

  // One workout is still Workouts; and it is not Schedule, though every page
  // is under the schedule's address.
  it('keeps Workouts marked on a single workout', async () => {
    mount('/rugged/workouts/11')
    const current = await screen.findAllByRole('link', { name: 'Workouts' })
    expect(current.every((l) => l.getAttribute('aria-current') === 'page')).toBe(true)
    const schedule = screen.getAllByRole('link', { name: 'Schedule' })
    expect(schedule.some((l) => l.getAttribute('aria-current') === 'page')).toBe(false)
  })

  // Ahead of the navigation, on every page.
  it('leads with a skip link into the content', () => {
    mount()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip.getAttribute('href')).toBe('#main')
    expect(document.querySelector('main')?.id).toBe('main')
  })
})
