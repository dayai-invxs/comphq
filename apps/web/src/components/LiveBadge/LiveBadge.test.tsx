import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveBadge } from './LiveBadge'

describe('LiveBadge', () => {
  it('reports what is live as a status', () => {
    render(<LiveBadge>Heat 3</LiveBadge>)
    expect(screen.getByRole('status').textContent).toBe('Heat 3')
  })

  it('defaults to the word Live', () => {
    render(<LiveBadge />)
    expect(screen.getByRole('status').textContent).toBe('Live')
  })

  // The dot is the only thing on screen, so the word has to survive as a name.
  it('keeps the word in the accessible name when only the dot is drawn', () => {
    render(<LiveBadge compact>Heat 3</LiveBadge>)
    const badge = screen.getByRole('status', { name: 'Heat 3' })
    expect(badge.textContent).toBe('')
  })
})
