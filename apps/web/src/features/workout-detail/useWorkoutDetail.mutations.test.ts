import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWorkoutMutations } from './useWorkoutDetail.mutations'

// v1: src/hooks/useWorkoutDetail.test.ts. The same contract, asserted one layer
// up: v1 mocked fetch and read the URL, v3 mocks the api seam and reads the
// path, because the seam is what puts the function origin in front of it.

const { apiGet, apiPost, apiPut, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiPut, apiDel }))

const PAYLOAD = { athleteId: 1, rawScore: 1000, tiebreakRawScore: null, partBRawScore: null }

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of [apiGet, apiPost, apiPut, apiDel]) fn.mockResolvedValue({})
})

describe('workout mutations — HTTP contract', () => {
  it('saveScorePayload throws whatever the seam threw', async () => {
    apiPost.mockRejectedValue(Object.assign(new Error('nope'), { status: 500 }))
    const api = buildWorkoutMutations('1', 'default')
    await expect(api.saveScorePayload(PAYLOAD)).rejects.toMatchObject({ status: 500 })
  })

  it('saveAll rejects if any score save fails (no silent success)', async () => {
    let calls = 0
    apiPost.mockImplementation(() => {
      calls++
      return calls < 3 ? Promise.resolve({}) : Promise.reject(Object.assign(new Error('fail'), { status: 500 }))
    })
    const api = buildWorkoutMutations('1', 'default')
    const payloads = [1, 2, 3].map((id) => ({ ...PAYLOAD, athleteId: id }))
    await expect(api.saveAll(payloads)).rejects.toMatchObject({ status: 500 })
  })

  it('saveAll passes the correct payload for each athlete', async () => {
    const api = buildWorkoutMutations('42', 'comp-slug')
    const payloads = [
      { ...PAYLOAD, athleteId: 1, rawScore: 100 },
      { ...PAYLOAD, athleteId: 2, rawScore: 200 },
    ]
    await api.saveAll(payloads)
    expect(apiPost.mock.calls.map((c) => c[1])).toEqual(payloads)
  })

  it('saveAll hits the workout-scoped POST endpoint with the slug query', async () => {
    const api = buildWorkoutMutations('42', 'comp-slug')
    await api.saveAll([PAYLOAD])
    expect(apiPost.mock.calls[0][0]).toBe('/api/workouts/42/scores?slug=comp-slug')
  })

  it('escapes slug in the query string', async () => {
    const api = buildWorkoutMutations('1', 'slug with spaces')
    await api.saveAll([PAYLOAD])
    expect(apiPost.mock.calls[0][0]).toContain('slug=slug%20with%20spaces')
  })

  it('reorderAssignments issues a single PUT to /assignments/reorder with the updates', async () => {
    const api = buildWorkoutMutations('42', 'comp')
    const updates = [
      { id: 1, heatNumber: 2, lane: 1 },
      { id: 2, heatNumber: 1, lane: 1 },
    ]
    await api.reorderAssignments(updates)
    expect(apiPut.mock.calls).toEqual([['/api/workouts/42/assignments/reorder?slug=comp', { updates }]])
  })

  it('reorderAssignments rejects with whatever the seam threw', async () => {
    apiPut.mockRejectedValue(Object.assign(new Error('boom'), { status: 409 }))
    const api = buildWorkoutMutations('1', 'default')
    await expect(api.reorderAssignments([{ id: 1, heatNumber: 1, lane: 1 }])).rejects.toMatchObject({ status: 409 })
  })

  // Every remaining route, so a renamed path shows up here rather than as a
  // 404 in a live competition.
  it('addresses each route the way v1 did', async () => {
    const api = buildWorkoutMutations('7', 'comp')
    await api.load()
    await api.calculate()
    await api.completeHeat(2)
    await api.undoHeat(2)
    await api.setStatus('active')
    await api.updateSettings({ lanes: 4 })
    await api.generateAssignments(true)
    await api.saveHeatTime(3, '2026-01-01T10:00:00.000Z')
    await api.clearScores()
    await api.resetWorkout()
    await api.deleteWorkout()

    expect(apiGet.mock.calls.map((c) => c[0])).toEqual(['/api/workouts/7?slug=comp'])
    expect(apiPost.mock.calls).toEqual([
      ['/api/workouts/7/calculate?slug=comp', {}],
      ['/api/workouts/7/heats/2/complete?slug=comp', {}],
      ['/api/workouts/7/assignments?slug=comp', { useCumulative: true }],
      ['/api/workouts/7/reset?slug=comp', {}],
    ])
    expect(apiPut.mock.calls).toEqual([
      ['/api/workouts/7?slug=comp', { status: 'active' }],
      ['/api/workouts/7?slug=comp', { lanes: 4 }],
      ['/api/workouts/7/heat-times?slug=comp', { heatNumber: 3, isoTime: '2026-01-01T10:00:00.000Z' }],
    ])
    expect(apiDel.mock.calls.map((c) => c[0])).toEqual([
      '/api/workouts/7/heats/2/complete?slug=comp',
      '/api/workouts/7/scores?slug=comp',
      '/api/workouts/7?slug=comp',
    ])
  })

  // A bodyless DELETE must stay bodyless: several routes read a body and treat
  // an unparseable one as absent (defect 11).
  it('sends no body on the deletes that had none', async () => {
    const api = buildWorkoutMutations('7', 'comp')
    await api.undoHeat(1)
    await api.clearScores()
    await api.deleteWorkout()
    for (const call of apiDel.mock.calls) expect(call).toHaveLength(1)
  })
})
