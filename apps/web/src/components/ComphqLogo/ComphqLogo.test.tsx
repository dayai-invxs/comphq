import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComphqLogo } from './ComphqLogo'

describe('ComphqLogo', () => {
  it('names itself CompHQ by default', () => {
    render(<ComphqLogo />)
    expect(screen.getByRole('img', { name: 'CompHQ' })).toBeInTheDocument()
  })

  it('hides from assistive tech when the label is empty', () => {
    const { container } = render(<ComphqLogo label="" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  // Aspect ratio comes from the viewBox, so each variant is checked by it.
  it.each([
    ['mark', '0 0 93.5 81'],
    ['lockup', '0 0 434.9 81'],
    ['stacked', '0 0 266.27 160.22'],
  ] as const)('draws the %s variant on its own canvas', (variant, viewBox) => {
    render(<ComphqLogo variant={variant} />)
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', viewBox)
  })

  it('draws the wordmark only in the lockup and stacked variants', () => {
    const { container, rerender } = render(<ComphqLogo variant="mark" />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
    rerender(<ComphqLogo variant="lockup" />)
    expect(container.querySelectorAll('path')).toHaveLength(4)
    rerender(<ComphqLogo variant="stacked" />)
    expect(container.querySelectorAll('path')).toHaveLength(4)
  })
})
