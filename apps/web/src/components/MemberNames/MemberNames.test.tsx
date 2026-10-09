import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberNames } from './MemberNames'

describe('MemberNames', () => {
  it('lists a team\'s members on one line', () => {
    render(<MemberNames members={['Kami Irlmeier', 'Lyra Lebron-Brown']} />)
    expect(screen.getByText('Kami Irlmeier · Lyra Lebron-Brown')).toBeTruthy()
  })

  it('draws nothing for an individual or a team with nobody listed', () => {
    const { container } = render(<><MemberNames members={[]} /><MemberNames /></>)
    expect(container.textContent).toBe('')
  })
})
