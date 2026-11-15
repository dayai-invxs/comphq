import { describe, it, expect } from 'vitest'
import { setAuthUser } from '@/test/setup'
import { GET } from './route'
import { RX, SCALED, athleteRow, queueExport, scoreRow, workoutRow } from './fixtures'

const req = (url = 'http://test/api/export?slug=default') => new Request(url)

/** The lines of one titled section, up to the blank line before the next. */
function sectionOf(body: string, title: string): string[] {
  const lines = body.split('\n')
  const at = lines.findIndex((l) => l === title || l === `"${title}"`)
  if (at < 0) throw new Error(`no section ${title}`)
  const end = lines.indexOf('', at)
  return lines.slice(at + 1, end < 0 ? undefined : end)
}

describe('GET /api/export', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 404 when slug is missing', async () => {
    const res = await GET(new Request('http://test/api/export'))
    expect(res.status).toBe(404)
  })

  it('returns CSV with the expected content-type and filename header', async () => {
    queueExport({
      workouts: [workoutRow({})],
      divisions: [RX],
      athletes: [athleteRow(1, 'Alice', 1, { bibNumber: '7' })],
      assignments: [{ id: 1, workoutId: 10, athleteId: 1, heatNumber: 1, lane: 1, rawScore: null, tiebreakRawScore: null, partBRawScore: null, teamMemberId: null, round: null, capped: false, advanced: null, consolation: false }],
      scores: [scoreRow(1, 10, 1)],
    })

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="default-export-\d{4}-\d{2}-\d{2}\.csv"/)

    const body = await res.text()
    for (const title of ['STANDINGS — Rx', 'WORKOUTS', 'SCORES — Event 1 - WOD 1', 'HEATS — Event 1 - WOD 1', 'ATHLETES/TEAMS']) {
      expect(body).toContain(title)
    }
    expect(body).toMatch(/Alice/)
  })

  // The old export ranked every division in one list: an Rx athlete and a
  // Scaled athlete could not both be first.
  it('ranks each division on its own', async () => {
    queueExport({
      workouts: [workoutRow({})],
      divisions: [RX, SCALED],
      athletes: [athleteRow(1, 'Alice', 1), athleteRow(2, 'Bob', 1), athleteRow(3, 'Cara', 2)],
      scores: [scoreRow(1, 10, 1), scoreRow(2, 10, 2), scoreRow(3, 10, 1)],
    })
    const body = await (await GET(req())).text()
    const rx = sectionOf(body, 'STANDINGS — Rx')
    expect(rx[1]).toMatch(/^1,Alice,/)
    expect(rx[2]).toMatch(/^2,Bob,/)
    expect(sectionOf(body, 'STANDINGS — Scaled')[1]).toMatch(/^1,Cara,/)
  })

  // A finished workout with no score is last place, as on the leaderboard.
  it('counts a skipped workout as last place', async () => {
    queueExport({
      workouts: [workoutRow({})],
      divisions: [RX],
      athletes: [athleteRow(1, 'Alice', 1), athleteRow(2, 'Bob', 1)],
      scores: [scoreRow(1, 10, 1)],
    })
    const rx = sectionOf(await (await GET(req())).text(), 'STANDINGS — Rx')
    expect(rx[2]).toBe('2,Bob,,,#2 (No score),2')
  })

  it('doubles a double weight workout in the totals and marks it', async () => {
    queueExport({
      workouts: [workoutRow({ doubleWeight: true })],
      divisions: [RX],
      athletes: [athleteRow(1, 'Alice', 1)],
      scores: [scoreRow(1, 10, 3)],
    })
    const rx = sectionOf(await (await GET(req())).text(), 'STANDINGS — Rx')
    expect(rx[0]).toContain('Event 1 (2×)')
    expect(rx[1]).toMatch(/^1,Alice,.*,6$/)
  })

  // Level on total and on place counts: the tiebreaker workout chosen on
  // Setup decides, as on the leaderboard (the old export used the last workout).
  it('breaks a tie with the tiebreaker workout setting', async () => {
    queueExport({
      workouts: [workoutRow({ id: 10, number: 1 }), workoutRow({ id: 11, number: 2, name: 'WOD 2' })],
      divisions: [RX],
      athletes: [athleteRow(1, 'Alice', 1), athleteRow(2, 'Bob', 1)],
      scores: [
        scoreRow(1, 10, 2, { rawScore: 300000 }), scoreRow(1, 11, 1, { rawScore: 300000 }),
        scoreRow(2, 10, 1, { rawScore: 200000 }), scoreRow(2, 11, 2, { rawScore: 400000 }),
      ],
      settings: [{ key: 'tiebreakWorkoutId', value: '10' }],
    })
    const body = await (await GET(req())).text()
    const rx = sectionOf(body, 'STANDINGS — Rx')
    expect(rx[1]).toMatch(/^1,Bob,/)
    expect(rx[2]).toMatch(/^2,Alice,/)
    expect(body).toContain('Tiebreaker workout,Event 1 - WOD 1')
  })

  it('counts Part B places in the total', async () => {
    queueExport({
      workouts: [workoutRow({ partBEnabled: true })],
      divisions: [RX],
      athletes: [athleteRow(1, 'Alice', 1)],
      scores: [scoreRow(1, 10, 1, { partBPoints: 2, partBRawScore: 61000 })],
    })
    const body = await (await GET(req())).text()
    expect(sectionOf(body, 'STANDINGS — Rx')[1]).toMatch(/^1,Alice,,,#1 \/ B #2 \([^)]*\),3$/)
    expect(sectionOf(body, 'SCORES — Event 1 - WOD 1')[0]).toContain('Part B Place,Part B Score')
  })

  it('shows knockout results, rounds, lane members, judges and withdrawn teams', async () => {
    queueExport({
      workouts: [workoutRow({ knockout: true, knockoutRounds: 2, knockoutAdvance: 3 })],
      divisions: [RX],
      athletes: [athleteRow(1, 'Team A', 1, { withdrawn: true })],
      teamMembers: [{ id: 5, athleteId: 1, name: 'Dee', gender: 'female', order: 0, externalId: null }],
      assignments: [{ id: 1, workoutId: 10, athleteId: 1, heatNumber: 3, lane: 2, rawScore: 90000, tiebreakRawScore: null, partBRawScore: null, teamMemberId: 5, round: 2, capped: false, advanced: true, consolation: false }],
      completions: [{ id: 1, workoutId: 10, heatNumber: 3, completedAt: '2026-11-14T10:00:00Z' }],
      scores: [scoreRow(1, 10, 1, { knockoutLabel: 'Winner · 1:30' })],
      volunteers: [{ id: 7, competitionId: 1, name: 'Jules', roleId: null }],
      judges: [{ id: 1, workoutId: 10, volunteerId: 7, heatNumber: 3, lane: 2 }],
    })
    const body = await (await GET(req())).text()
    expect(sectionOf(body, 'WORKOUTS')[1]).toContain('2 rounds, top 3 advance')
    expect(sectionOf(body, 'SCORES — Event 1 - WOD 1')[1]).toContain('Winner · 1:30')
    const heats = sectionOf(body, 'HEATS — Event 1 - WOD 1')
    expect(heats[0]).toBe('Round,Heat,Lane,Athlete/Team,Running,Division,Bib #,Lane Score,Consolation,Advanced,Judge,Heat Finished')
    expect(heats[1]).toBe('2,3,2,Team A,Dee,Rx,,1:30.00,,Yes,Jules,Yes')
    expect(sectionOf(body, 'ATHLETES/TEAMS')[1]).toBe('Team A,Rx,,,Yes,Dee (female)')
    expect(sectionOf(body, 'VOLUNTEERS')[1]).toBe('Jules,')
  })
})
