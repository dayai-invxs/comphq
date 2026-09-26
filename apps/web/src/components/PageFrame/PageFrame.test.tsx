import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageFrame } from './PageFrame'

describe('PageFrame', () => {
  it('makes the title the page heading', () => {
    render(<PageFrame title="Leaderboard"><p>rows</p></PageFrame>)
    expect(screen.getByRole('heading', { name: 'Leaderboard', level: 1 })).toBeTruthy()
  })

  // Whatever a screen puts around its title, the page still has exactly one h1.
  it('leaves one page heading however many words the head carries', () => {
    render(
      <PageFrame
        title="Workout 3"
        eyebrow="Rugged Rumble"
        description="Helen · Main floor"
        actions={<button>Edit</button>}
      >
        <p>content</p>
      </PageFrame>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Rugged Rumble')).toBeTruthy()
    expect(screen.getByText('Helen · Main floor')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('renders its content', () => {
    render(<PageFrame title="People"><p>the roster</p></PageFrame>)
    expect(screen.getByText('the roster')).toBeTruthy()
  })
})
