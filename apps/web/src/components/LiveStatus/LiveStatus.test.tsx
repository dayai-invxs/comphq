import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus', () => {
  it('says the screen is live', () => {
    render(<LiveStatus updatedAt={null} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('says when the last answer landed', () => {
    const at = new Date('2026-08-26T09:00:00.000Z')
    render(<LiveStatus updatedAt={at} />)
    expect(screen.getByText(`Updated ${at.toLocaleTimeString()}`)).toBeInTheDocument()
  })

  // Nothing has arrived yet, so there is no time to name.
  it('says nothing about an update before the first one', () => {
    render(<LiveStatus updatedAt={null} />)
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })

  // The dot is the same fact the word beside it carries.
  it('keeps the dot out of the reading', () => {
    const { container } = render(<LiveStatus updatedAt={null} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})
