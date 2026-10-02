import { describe, expect, it, vi } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { rawEvent19948 } from '@/lib/competitionCorner/__fixtures__/event19948'
import { POST } from './route'

const body = { slug: 'default', tz: 'America/Los_Angeles', mergePartB: true, event: rawEvent19948() }
const req = (b: unknown) => new Request('http://test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })

describe('POST /api/import/competition-corner/preview', () => {
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

  it('answers 400 when the posted event does not match', async () => {
    mock.queueResults([], [], [], [])

    const res = await POST(req({ ...body, event: { id: 1 } }))

    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/not in the shape the import reads/)
  })

  // The function never calls Competition Corner: Cloudflare refuses it there.
  it('reads nothing from the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mock.queueResults([], [], [], [])

    await POST(req(body))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
