import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { CC_BASE, fixtureFetch } from '@/lib/competitionCorner/__fixtures__/fixtureFetch'
import { POST } from './route'

const body = { slug: 'default', url: 'https://competitioncorner.net/events/19948/details', tz: 'America/Los_Angeles', mergePartB: true }
const req = (b: unknown) => new Request('http://test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })

describe('POST /api/import/competition-corner/preview', () => {
  beforeEach(() => vi.stubGlobal('fetch', fixtureFetch()))
  afterEach(() => vi.unstubAllGlobals())

  it('rejects unauthenticated', async () => {
    setAuthUser(null)

    expect((await POST(req(body))).status).toBe(401)
  })

  it('lists every change for an empty competition, with a version', async () => {
    mock.queueResults([], [], [], [])

    const res = await POST(req(body))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.event.id).toBe(19948)
    expect(json.changes).toHaveLength(6 + 4 + 74 + 4)
    expect(json.version).toMatch(/^[0-9a-f]{64}$/)
  })

  it('answers 400 for a link that is not an event', async () => {
    mock.queueResults([], [], [], [])

    expect((await POST(req({ ...body, url: 'nope' }))).status).toBe(400)
  })

  it('answers 502 when Competition Corner is down', async () => {
    vi.stubGlobal('fetch', fixtureFetch({ [`${CC_BASE}/events/19948`]: new Response('', { status: 503 }) }))
    mock.queueResults([], [], [], [])

    expect((await POST(req(body))).status).toBe(502)
  })
})
