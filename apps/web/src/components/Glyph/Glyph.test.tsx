import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Glyph } from './Glyph'

describe('Glyph', () => {
  it('names itself when the label is the only word the control has', () => {
    render(<Glyph name="schedule" label="Schedule" />)
    expect(screen.getByRole('img', { name: 'Schedule' })).toBeTruthy()
  })

  // A glyph beside its own word would otherwise be read twice.
  it('hides itself from the reader when it is decoration', () => {
    const { container } = render(<Glyph name="schedule" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws a different path per name', () => {
    const { container: a } = render(<Glyph name="schedule" />)
    const { container: b } = render(<Glyph name="leaderboard" />)
    expect(a.querySelector('path')?.getAttribute('d')).not.toBe(b.querySelector('path')?.getAttribute('d'))
  })
})
