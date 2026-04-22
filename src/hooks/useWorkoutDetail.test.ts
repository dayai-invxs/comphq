import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pull out the mutation logic for direct unit-testing. The hook wraps
// these with useState/useCallback, but the HTTP + error-surfacing contract
// lives here and must hold regardless of React lifecycle.
import { buildWorkoutMutations } from './useWorkoutDetail.mutations'

describe('workout mutations — HTTP contract', () => {
  const origFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    globalThis.fetch = origFetch
  })

  function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(impl as never)
  }

  it('saveScorePayload throws HttpError on non-OK', async () => {
    mockFetch(() => new Response('nope', { status: 500 }))
    const api = buildWorkoutMutations('1', 'default')
    await expect(api.saveScorePayload({ athleteId: 1, rawScore: 1000, tiebreakRawScore: null, partBRawScore: null }))
      .rejects.toMatchObject({ status: 500 })
  })

  it('saveMany rejects if any score save fails (no silent success)', async () => {
    let callCount = 0
    mockFetch(() => {
      callCount++
      // First 2 succeed, 3rd fails. Promise.all should reject.
      return callCount < 3 ? new Response('{}', { status: 200 }) : new Response('fail', { status: 500 })
    })
    const api = buildWorkoutMutations('1', 'default')
    const payloads = [1, 2, 3].map((id) => ({ athleteId: id, rawScore: 1000, tiebreakRawScore: null, partBRawScore: null }))
    await expect(api.saveAll(payloads)).rejects.toMatchObject({ status: 500 })
  })

  it('saveAll passes the correct payload for each athlete', async () => {
    const received: unknown[] = []
    mockFetch((_url, init) => {
      received.push(JSON.parse(init!.body as string))
      return new Response('{}', { status: 200 })
    })
    const api = buildWorkoutMutations('42', 'comp-slug')
    const payloads = [
      { athleteId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null },
      { athleteId: 2, rawScore: 200, tiebreakRawScore: null, partBRawScore: null },
    ]
    await api.saveAll(payloads)
    expect(received).toEqual(payloads)
  })

  it('saveAll hits the workout-scoped POST endpoint with the slug query', async () => {
    const urls: string[] = []
    mockFetch((url: string) => {
      urls.push(url)
      return new Response('{}', { status: 200 })
    })
    const api = buildWorkoutMutations('42', 'comp-slug')
    await api.saveAll([{ athleteId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null }])
    expect(urls[0]).toBe('/api/workouts/42/scores?slug=comp-slug')
  })

  it('calculate throws HttpError on non-OK', async () => {
    mockFetch(() => new Response('nope', { status: 500 }))
    const api = buildWorkoutMutations('1', 'default')
    await expect(api.calculate()).rejects.toMatchObject({ status: 500 })
  })

  it('completeHeat throws HttpError on non-OK', async () => {
    mockFetch(() => new Response('nope', { status: 500 }))
    const api = buildWorkoutMutations('1', 'default')
    await expect(api.completeHeat(1)).rejects.toMatchObject({ status: 500 })
  })

  it('escapes slug in the query string', async () => {
    const urls: string[] = []
    mockFetch((url: string) => {
      urls.push(url)
      return new Response('{}', { status: 200 })
    })
    const api = buildWorkoutMutations('1', 'slug with spaces')
    await api.saveAll([{ athleteId: 1, rawScore: 100, tiebreakRawScore: null, partBRawScore: null }])
    expect(urls[0]).toContain('slug=slug%20with%20spaces')
  })
})
