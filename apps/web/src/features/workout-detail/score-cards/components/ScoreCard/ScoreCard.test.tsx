import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { parseScoreCard, type ScoreCardSpec } from '@/lib/scoreCard'
import { blankCards, laneCards } from '../../cards'
import { testWorkout } from '../../testWorkout'
import { ScoreCard } from './ScoreCard'

const fixtures = import.meta.glob<{ default: unknown }>('../../__fixtures__/*.json', { eager: true })
const spec = (name: string) => {
  const r = parseScoreCard(fixtures[`../../__fixtures__/${name}.json`].default)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.spec as ScoreCardSpec
}
const opts = { slug: 'rugged-in-house-2026', origin: 'https://www.comphq.pro', showBib: true }
const team = [{ id: 11, name: 'Ana', gender: 'female' }, { id: 12, name: 'Ben', gender: 'male' }, { id: 13, name: 'Cy', gender: 'male' }]

describe('ScoreCard', () => {
  it.each(Object.keys(fixtures).map((k) => k.replace(/.*\/|\.json$/g, '')))('draws %s, lane and blank', (name) => {
    const s = spec(name)
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team }])
    for (const card of [laneCards(w, s, opts)[0], ...s.versions.map((_, i) => blankCards(w, s, { ...opts, count: 1, version: i })[0])]) {
      const { unmount } = render(<ScoreCard card={card} workout={w} spec={s} competitionName="Rugged In House 2026" />)
      expect(screen.getByText('Event 2 · Rainbow Road Rewind')).toBeTruthy()
      unmount()
    }
  })

  it('draws a plain card for a workout with no structure', () => {
    const w = testWorkout([{ heat: 3, lane: 4, athleteId: 1, name: 'Mario', bib: '101', gender: 'male' }], { scoreType: 'rounds_reps' })
    render(<ScoreCard card={laneCards(w, null, opts)[0]} workout={w} spec={null} competitionName="Rugged" />)
    expect(screen.getByText('Mario')).toBeTruthy()
    expect(screen.getByText('101')).toBeTruthy()
    expect(screen.getByText('Rounds')).toBeTruthy()
    expect(screen.getByText('Athlete signature')).toBeTruthy()
  })

  it('has no bib box when the competition doesn’t use bibs', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 1, name: 'Mario', bib: '101' }])
    render(<ScoreCard card={laneCards(w, null, { ...opts, showBib: false })[0]} workout={w} spec={null} competitionName="Rugged" />)
    expect(screen.queryByText('Bib')).toBeNull()
  })

  it('signs a team card by its captain and asks each member’s level', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team }])
    const s = spec('rugged-2-rainbow-road-rewind')
    render(<ScoreCard card={laneCards(w, s, opts)[0]} workout={w} spec={s} competitionName="Rugged" />)
    expect(screen.getByText('Team captain signature')).toBeTruthy()
    expect(screen.getByText('Mark each level')).toBeTruthy()
    expect(screen.getAllByText('TB')).toHaveLength(9)
  })

  it('says it can’t print while a rep value is unanswered', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 1, name: 'Mario' }])
    const s = spec('gladiator-4-coliseum')
    render(<ScoreCard card={laneCards(w, s, opts)[0]} workout={w} spec={s} competitionName="Rugged" />)
    expect(screen.getByText(/Can’t print yet: run needs a rep value/)).toBeTruthy()
  })

  it('gives each level its own block on a Blue Shell card, with the INT athlete’s singles counted as done', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 5, name: 'Koopa Troop', members: team, round: 1 }], { knockout: true })
    const s = spec('rugged-4-blue-shell-knockout')
    expect(s.versions.map((v) => v.label)).toEqual([
      'Round 1 · INT on double-unders', 'Round 1 · INT on single-unders', 'Round 2 · INT on double-unders', 'Round 2 · INT on single-unders',
    ])
    render(<ScoreCard card={laneCards(w, s, { ...opts, version: 1 })[0]} workout={w} spec={s} competitionName="Rugged" />)
    const text = document.body.textContent ?? ''
    expect(['RX athlete', 'INT athlete', 'SC athlete'].map((l) => screen.getByText(l))).toHaveLength(3)
    expect(text.match(/50 Double-Under/g)).toHaveLength(1)
    expect(text.match(/100 Single-Under/g)).toHaveLength(1)
    expect(text.match(/50 Single-Under/g)).toHaveLength(1)
    expect(screen.getByText('KBs 35/26 lb')).toBeTruthy()
    expect(screen.getAllByText('Tag order')).toHaveLength(3)
    expect(screen.getByText('Round 1 time')).toBeTruthy()
    expect(screen.getByText(/Capped: finished athletes’ reps/)).toBeTruthy()
    expect(text).not.toMatch(/twice/)
  })

  it('never prints the workout description', () => {
    const w = testWorkout([{ heat: 1, lane: 1, athleteId: 1, name: 'Mario' }], { description: 'SECRET FULL DESCRIPTION' })
    render(<ScoreCard card={laneCards(w, null, opts)[0]} workout={w} spec={null} competitionName="Rugged" />)
    expect(screen.queryByText(/SECRET FULL DESCRIPTION/)).toBeNull()
  })
})
