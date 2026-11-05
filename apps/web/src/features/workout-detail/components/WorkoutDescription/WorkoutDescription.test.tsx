import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkoutDescription } from './WorkoutDescription'

// jsdom lays nothing out, so what the browser would measure is stated here.
function layout(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight)
}

afterEach(() => vi.restoreAllMocks())

describe('WorkoutDescription', () => {
  it('opens clamped and offers the rest when the text runs past three lines', () => {
    layout(200, 60)
    render(<WorkoutDescription text="A long description" />)
    expect(screen.getByText('A long description').className).toMatch(/clamped/)
    expect(screen.getByRole('button', { name: 'See more' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands and closes again, keeping the button while open', () => {
    layout(200, 60)
    render(<WorkoutDescription text="A long description" />)
    fireEvent.click(screen.getByRole('button', { name: 'See more' }))
    expect(screen.getByText('A long description').className).not.toMatch(/clamped/)

    // Open, the text fits its box, and that must not take the button away.
    layout(200, 200)
    const less = screen.getByRole('button', { name: 'See less' })
    expect(less).toHaveAttribute('aria-expanded', 'true')

    layout(200, 60)
    fireEvent.click(less)
    expect(screen.getByText('A long description').className).toMatch(/clamped/)
    expect(screen.getByRole('button', { name: 'See more' })).toBeInTheDocument()
  })

  it('offers nothing when the text already fits', () => {
    layout(60, 60)
    render(<WorkoutDescription text="Short" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
