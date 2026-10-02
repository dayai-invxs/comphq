import { describe, expect, it, vi } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { rawEvent19948 } from '@/lib/competitionCorner/__fixtures__/event19948'
import { POST as preview } from '../preview/route'
import { POST } from './route'

const body = { slug: 'default', tz: 'America/Los_Angeles', mergePartB: true, event: rawEvent19948() }
const req = (b: unknown) => new Request('http://test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
const emptyCompetition = () => mock.queueResults([], [], [], [])

async function previewEmpty() {
  emptyCompetition()
  return (await preview(req(body))).json() as Promise<{ version: string; changes: Array<{ key: string }> }>
}

describe('POST /api/import/competition-corner/apply', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)

    expect((await POST(req({ ...body, version: 'x', accepted: ['division:1'] }))).status).toBe(401)
  })

  it('answers 409 when the preview is stale', async () => {
    emptyCompetition()

    const res = await POST(req({ ...body, version: 'stale', accepted: ['division:1'] }))

    expect(res.status).toBe(409)
    expect(mock.calls.some((c) => c.method === 'insert')).toBe(false)
  })

  it('answers 400 with the reasons when the selection cannot be written', async () => {
    const { version, changes } = await previewEmpty()
    const athlete = changes.find((c) => c.key.startsWith('athlete:'))!
    emptyCompetition()

    const res = await POST(req({ ...body, version, accepted: [athlete.key] }))

    expect(res.status).toBe(400)
    expect((await res.json()).errors[0]).toMatch(/needs .* too\.$/)
  })

  it('writes the accepted divisions and stamps the competition', async () => {
    const { version, changes } = await previewEmpty()
    const divisions = changes.filter((c) => c.key.startsWith('division:')).map((c) => c.key)
    emptyCompetition()

    const res = await POST(req({ ...body, version, accepted: divisions }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ applied: 6 })
    const inserted = mock.calls.filter((c) => c.method === 'values').map((c) => c.args[0])
    expect(inserted[0]).toHaveLength(6)
    expect(mock.calls.filter((c) => c.method === 'set').at(-1)!.args[0]).toMatchObject({ ccEventId: 19948 })
  })
})
