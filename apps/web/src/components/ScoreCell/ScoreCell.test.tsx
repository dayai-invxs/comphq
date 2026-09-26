import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkoutScore } from '@/api/liveReads'
import { ScoreCell } from './ScoreCell'

const score = (points: number, over: Partial<NonNullable<WorkoutScore>> = {}): WorkoutScore => ({
  points,
  display: `${points}:00`,
  tiebreakDisplay: null,
  ...over,
})

describe('ScoreCell', () => {
  it('reads DNS when the athlete did not score the workout', () => {
    render(<ScoreCell score={null} />)
    expect(screen.getByText('DNS')).toBeInTheDocument()
  })

  it('shows the placing, the raw score and Part B beside it', () => {
    render(<ScoreCell score={score(3, { display: '3:21', partBPoints: 5 })} />)
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText(/3:21/)).toBeInTheDocument()
    expect(screen.getByText(/B#5/)).toBeInTheDocument()
  })

  it('shows the tiebreak on its own line when there is one', () => {
    render(<ScoreCell score={score(1, { tiebreakDisplay: '0:44' })} />)
    expect(screen.getByText('TB 0:44')).toBeInTheDocument()
  })

  it('is plain text with no editor attached', () => {
    render(<ScoreCell score={score(3)} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // Every placing button in a row reads `#2` on its face, so the name has to
  // say which workout it edits — and still carry the visible text.
  it('names the editor with the placing and what it edits', () => {
    render(<ScoreCell score={score(2)} onEditPoints={vi.fn()} editLabel="edit WOD 3 points for Ada" />)
    expect(screen.getByRole('button', { name: '#2 — edit WOD 3 points for Ada' })).toBeInTheDocument()
  })

  // The admin board edits points in place; the public board must not offer it.
  it('offers the placing as a button when an editor is attached', () => {
    const onEditPoints = vi.fn()
    render(<ScoreCell score={score(3)} onEditPoints={onEditPoints} />)
    fireEvent.click(screen.getByRole('button', { name: /#3/ }))
    expect(onEditPoints).toHaveBeenCalledOnce()
  })
})
