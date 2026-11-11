import { describe as group, expect, it } from 'vitest'
import type { ActivityEntry } from '@/api/activity'
import { describe } from './describe'

const names = {
  workouts: [{ id: 3, number: 1, name: 'Fran', scoreType: 'time' }],
  athletes: [{ id: 4, name: 'Ada Ant' }],
}
const entry = (action: string, diff: ActivityEntry['diff']): ActivityEntry =>
  ({ id: 1, at: '2026-11-11T15:00:00Z', who: 'sam@example.test', action, resourceId: null, diff })

group('describing a change', () => {
  it('names the athlete, the workout and the score saved', () => {
    expect(describe(entry('POST /workouts/:id/scores', { params: { id: '3' }, body: { athleteId: 4, rawScore: 181_000 } }), names))
      .toBe("Saved Ada Ant's score in Event 1 - Fran: 3:01.00")
  })

  it('says when a time was capped', () => {
    expect(describe(entry('POST /workouts/:id/scores', { params: { id: '3' }, body: { athleteId: 4, rawScore: 20_005, capped: true } }), names))
      .toMatch(/^Saved Ada Ant's score in Event 1 - Fran: CAP 2r \+ 5$/)
  })

  it('keeps the id of something deleted since', () => {
    expect(describe(entry('POST /workouts/:id/scores', { params: { id: '9' }, body: { athleteId: 77, rawScore: 1 } }), names))
      .toBe("Saved athlete #77's score in workout #9")
  })

  it('tells activating a workout apart from editing it', () => {
    expect(describe(entry('PUT /workouts/:id', { params: { id: '3' }, body: { status: 'active' } }), names)).toBe('Activated Event 1 - Fran')
    expect(describe(entry('PUT /workouts/:id', { params: { id: '3' }, body: { status: 'draft' } }), names)).toBe('Deactivated Event 1 - Fran')
    expect(describe(entry('PUT /workouts/:id', { params: { id: '3' }, body: { name: 'Fran 2' } }), names)).toBe('Edited Event 1 - Fran')
  })

  it('names the heat', () => {
    expect(describe(entry('POST /workouts/:id/heats/:heatNum/complete', { params: { id: '3', heatNum: '2' } }), names))
      .toBe('Completed heat 2 of Event 1 - Fran')
  })

  it('names a withdrawn athlete', () => {
    expect(describe(entry('POST /athletes/:id/withdraw', { params: { id: '4' } }), names)).toBe('Withdrew Ada Ant')
  })

  it('lists the settings changed', () => {
    expect(describe(entry('PATCH /settings', { body: { slug: 'summer', showBib: false } }), names)).toBe('Changed settings: showBib')
  })

  // A route added later still shows, as its route.
  it('falls back to the route for a change it does not know', () => {
    expect(describe(entry('POST /something/new', null), names)).toBe('POST /something/new')
  })
})
