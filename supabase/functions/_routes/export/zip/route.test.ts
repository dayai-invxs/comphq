import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { setAuthUser, supabaseMock } from '@/test/setup'
import { getTableColumns } from 'drizzle-orm'
import { workout } from '@/db/schema'
import { GET } from './route'
import { RX, athleteRow, queueExport, scoreRow, workoutRow } from '../fixtures'

const req = (slug = 'default') => new Request(`http://test/api/export/zip?slug=${slug}`)

async function unzip(res: Response) {
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
  return { files, text: (name: string) => strFromU8(files[name]) }
}

describe('GET /api/export/zip', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns a ZIP with a CSV per table, the standings, data.json and a manifest', async () => {
    queueExport({
      competition: [{ id: 1, name: 'Default', slug: 'default', ccEventId: 42, ccSyncedAt: null }],
      workouts: [workoutRow({ name: 'Fran', scoreCard: { title: 'Fran' }, knockoutRounds: 2 })],
      divisions: [RX],
      athletes: [athleteRow(1, 'Alice', 1, { bibNumber: '101', withdrawn: true })],
      scores: [scoreRow(1, 10, 1, { rawScore: 225123 })],
      settings: [{ key: 'judgePassword', value: 'hunter2' }, { key: 'scoringSystem', value: 'rank' }],
      volunteers: [{ id: 7, competitionId: 1, name: 'Jules', roleId: 3 }],
      roles: [{ id: 3, competitionId: 1, name: 'Judge' }],
    })

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/\.zip"$/)

    const { files, text } = await unzip(res)
    expect(Object.keys(files).sort()).toEqual([
      'athletes.csv', 'competition.csv', 'data.json', 'divisions.csv', 'equipment.csv',
      'heat_assignments.csv', 'heat_completions.csv', 'judge_assignments.csv', 'manifest.json',
      'scores.csv', 'settings.csv', 'standings.csv', 'team_members.csv', 'volunteer_roles.csv',
      'volunteers.csv', 'workout_locations.csv', 'workouts.csv',
    ])

    const manifest = JSON.parse(text('manifest.json'))
    expect(manifest.version).toBe(2)
    expect(manifest.counts).toMatchObject({ athletes: 1, divisions: 1, workouts: 1, scores: 1, volunteers: 1, settings: 1 })

    // Every workout column, under its database name.
    expect(text('workouts.csv').split('\n')[0]).toBe([...Object.keys(getTableColumns(workout)), 'locationName'].join(','))
    expect(text('workouts.csv')).toContain('"{""title"":""Fran""}"')
    expect(text('athletes.csv')).toMatch(/Alice,101,1,,true,/)
    expect(text('scores.csv')).toContain('225123')
    expect(text('volunteers.csv')).toContain('Jules,3,Judge')
    expect(text('competition.csv')).toContain('42')
    expect(text('standings.csv').split('\n')[1]).toMatch(/^Rx,1,1,Alice,1,1,/)

    // The judge password never leaves the database.
    expect(text('settings.csv')).toBe('key,value\nscoringSystem,rank')
    expect(text('data.json')).not.toContain('hunter2')

    const data = JSON.parse(text('data.json'))
    expect(data.version).toBe(2)
    expect(data.workouts[0].scoreCard).toEqual({ title: 'Fran' })
    expect(data.athletes[0].withdrawn).toBe(true)
  })

  it('includes the competition logo from storage', async () => {
    const download = async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })
    supabaseMock.client.storage.from.mockImplementation(() => ({ download }) as never)
    queueExport({
      settings: [{ key: 'logoUrl', value: 'https://x.supabase.co/storage/v1/object/public/logos/1/logo.png?v=5' }],
    })
    const { files } = await unzip(await GET(req()))
    expect([...files['logo.png']]).toEqual([1, 2, 3])
    expect(supabaseMock.client.storage.from).toHaveBeenCalledWith('logos')
  })

  // Only this competition's own logo file is read, whatever the setting says.
  it('skips a logo path that is not this competition\'s', async () => {
    queueExport({
      settings: [{ key: 'logoUrl', value: 'https://x.supabase.co/storage/v1/object/public/logos/2/logo.png' }],
    })
    const { files } = await unzip(await GET(req()))
    expect(Object.keys(files).some((n) => n.startsWith('logo'))).toBe(false)
    expect(supabaseMock.client.storage.from).not.toHaveBeenCalled()
  })
})
