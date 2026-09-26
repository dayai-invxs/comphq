import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { HttpError } from '@/lib/http'
import { useWorkoutJudges } from './useWorkoutJudges'

const { apiGet, apiPost, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiDel }))

// v1: the judge half of src/app/[slug]/admin/workouts/[id]/page.tsx. Who may
// judge is a volunteer whose role is named "judge", but the lane picker offers
// every volunteer — v1 passed `allVolunteers` to the card, not the filtered
// list, so a lane can be given to anyone.

const ASSIGNMENTS = [
  { id: 90, volunteerId: 1, heatNumber: 1, lane: 1, judgeName: 'Ann' },
  { id: 91, volunteerId: 2, heatNumber: 2, lane: 3, judgeName: 'Bo' },
]
const ROLES = [{ id: 5, name: 'Judge' }, { id: 6, name: 'Scorekeeper' }]
const VOLUNTEERS = [
  { id: 1, name: 'Ann', roleId: 5 },
  { id: 2, name: 'Bo', roleId: 6 },
  { id: 3, name: 'Cy', roleId: null },
]

function answer() {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/api/volunteer-roles')) return Promise.resolve(ROLES)
    if (path.startsWith('/api/volunteers')) return Promise.resolve(VOLUNTEERS)
    return Promise.resolve(ASSIGNMENTS)
  })
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useWorkoutJudges('42', 'rugged-rumble'), { wrapper })
}

async function loaded() {
  const hook = mount()
  await waitFor(() => expect(hook.result.current.assignments).toHaveLength(2))
  await waitFor(() => expect(hook.result.current.volunteers).toHaveLength(3))
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
  answer()
  apiPost.mockResolvedValue({ id: 99 })
  apiDel.mockResolvedValue({})
})

describe('what the screen knows about judges', () => {
  it('reads the assignments, the roles and the volunteers', async () => {
    await loaded()
    expect(apiGet.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/api/volunteer-roles?slug=rugged-rumble',
      '/api/volunteers?slug=rugged-rumble',
      '/api/workouts/42/judge-assignments?slug=rugged-rumble',
    ])
  })

  it('counts only the volunteers whose role is judge, whatever its case', async () => {
    const { result } = await loaded()
    expect(result.current.judges.map((j) => j.name)).toEqual(['Ann'])
  })

  it('offers every volunteer for a lane, judge or not', async () => {
    const { result } = await loaded()
    expect(result.current.volunteers.map((v) => v.name)).toEqual(['Ann', 'Bo', 'Cy'])
  })

  it('names the judge in each lane of one heat and no other', async () => {
    const { result } = await loaded()
    const heat2 = result.current.judgesByLane(2)
    expect(heat2.get(3)).toEqual({ volunteerId: 2, assignmentId: 91, judgeName: 'Bo' })
    expect(heat2.has(1)).toBe(false)
  })

  // v1 called this read non-critical: the rest of the screen works without it.
  it('says nothing when the read fails', async () => {
    apiGet.mockRejectedValue(new HttpError(500, 'boom'))
    const { result } = mount()
    await waitFor(() => expect(apiGet).toHaveBeenCalled())
    expect(result.current.error).toBeNull()
    expect(result.current.assignments).toEqual([])
  })
})

describe('putting a judge in a lane', () => {
  it('posts the volunteer, the heat and the lane, and reads nothing back', async () => {
    const { result } = await loaded()
    apiGet.mockClear()
    await act(() => result.current.setJudge(3, 2, 3))
    expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/judge-assignments?slug=rugged-rumble',
      { volunteerId: 3, heatNumber: 3, lane: 2 },
    )
    // The row is built here from what is already known; the three reads of
    // the initial load are not repeated per lane pick.
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('names the judge in the lane before the server answers', async () => {
    apiPost.mockReturnValue(new Promise(() => {}))
    const { result } = await loaded()
    act(() => { void result.current.setJudge(3, 2, 3) })
    await waitFor(() =>
      expect(result.current.judgesByLane(3).get(2)?.judgeName).toBe('Cy'))
  })

  it('keeps the row id the server minted', async () => {
    apiPost.mockResolvedValue({ id: 77, volunteerId: 3, heatNumber: 3, lane: 2 })
    const { result } = await loaded()
    await act(() => result.current.setJudge(3, 2, 3))
    await waitFor(() =>
      expect(result.current.judgesByLane(3).get(2)?.assignmentId).toBe(77))
  })

  it('hands an occupied lane straight to the new judge', async () => {
    const { result } = await loaded()
    await act(() => result.current.setJudge(2, 3, 3))
    const lane = result.current.judgesByLane(2).get(3)
    expect(lane?.judgeName).toBe('Cy')
    expect(result.current.assignments).toHaveLength(2)
  })

  it('deletes the assignment when the lane is cleared, without waiting', async () => {
    apiDel.mockReturnValue(new Promise(() => {}))
    const { result } = await loaded()
    act(() => { void result.current.setJudge(2, 3, null) })
    await waitFor(() => expect(result.current.assignments.map((a) => a.id)).toEqual([90]))
    expect(apiDel).toHaveBeenCalledWith(
      '/api/workouts/42/judge-assignments?slug=rugged-rumble',
      { ids: [91] },
    )
  })

  it('asks for nothing when the cleared lane had no judge', async () => {
    const { result } = await loaded()
    await act(() => result.current.setJudge(9, 9, null))
    expect(apiDel).not.toHaveBeenCalled()
  })

  it('takes the lane back and reports it when the post is refused', async () => {
    apiPost.mockRejectedValue(new HttpError(409, 'Judge is busy that heat'))
    const { result } = await loaded()
    await act(() => result.current.setJudge(3, 2, 3))
    await waitFor(() => expect(result.current.error).toBe('Judge is busy that heat'))
    expect(result.current.judgesByLane(3).has(2)).toBe(false)
  })

  it('puts the judge back when the delete is refused', async () => {
    apiDel.mockRejectedValue(new HttpError(403, 'Not yours'))
    const { result } = await loaded()
    await act(() => result.current.setJudge(2, 3, null))
    await waitFor(() => expect(result.current.error).toBe('Not yours'))
    expect(result.current.judgesByLane(2).get(3)?.judgeName).toBe('Bo')
  })

  it('clears a previous failure when asked again', async () => {
    apiPost.mockRejectedValueOnce(new HttpError(409, 'Judge is busy that heat'))
    const { result } = await loaded()
    await act(() => result.current.setJudge(3, 2, 3))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    await act(() => result.current.setJudge(3, 2, 1))
    await waitFor(() => expect(result.current.error).toBeNull())
  })
})

describe('filling every lane at once', () => {
  it('posts the consecutive-heat limit and keeps what comes back', async () => {
    apiPost.mockResolvedValue([ASSIGNMENTS[0]])
    const { result } = await loaded()
    await act(() => result.current.generate(4))
    expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/judge-assignments/generate?slug=rugged-rumble',
      { maxConsecutive: 4 },
    )
    await waitFor(() => expect(result.current.assignments.map((a) => a.id)).toEqual([90]))
  })

  // The rejection travels: ConfirmDialog stays open on it, and the hook's own
  // error state serves the non-dialog path.
  it('reports a refusal instead of emptying the lanes', async () => {
    apiPost.mockRejectedValue(new HttpError(400, 'No judges available'))
    const { result } = await loaded()
    await act(async () => {
      await expect(result.current.generate(3)).rejects.toThrow('No judges available')
    })
    await waitFor(() => expect(result.current.error).toBe('No judges available'))
    expect(result.current.assignments).toHaveLength(2)
  })
})

describe('emptying every lane', () => {
  it('deletes with no body at all and empties the list', async () => {
    const { result } = await loaded()
    await act(() => result.current.clear())
    expect(apiDel).toHaveBeenCalledWith('/api/workouts/42/judge-assignments?slug=rugged-rumble')
    await waitFor(() => expect(result.current.assignments).toEqual([]))
  })

  it('keeps the lanes when the delete is refused', async () => {
    apiDel.mockRejectedValue(new HttpError(403, 'Not yours'))
    const { result } = await loaded()
    await act(async () => {
      await expect(result.current.clear()).rejects.toThrow('Not yours')
    })
    await waitFor(() => expect(result.current.error).toBe('Not yours'))
    expect(result.current.assignments).toHaveLength(2)
  })
})
