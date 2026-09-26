import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetAthleteChecks, useSetEquipChecks } from './checks'
import { queryKeys } from './queryKeys'

const { apiPatch } = vi.hoisted(() => ({ apiPatch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiPatch }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiPatch.mockResolvedValue({})
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('check writers', () => {
  it('shows the athlete tick before the server has been told', () => {
    const { result } = renderHook(() => useSetAthleteChecks('summer'), { wrapper })
    result.current.setEntry('7-1', () => ({ corral: true, walkout: false }))
    expect(client.getQueryData(queryKeys.checks('summer'))).toEqual({
      athleteChecks: { '7-1': { corral: true, walkout: false } },
      equipChecks: {},
    })
  })

  it('setAsync sends the whole map, for the reset', async () => {
    const { result } = renderHook(() => useSetAthleteChecks('summer'), { wrapper })
    await result.current.setAsync({})
    expect(apiPatch).toHaveBeenCalledWith('/api/checks', { slug: 'summer', type: 'athlete', checks: {} })
  })

  // COM-116. A tick is one entry, read against the cache at the moment of the
  // tap, so a second tap before the screen re-renders still keeps the first.
  it('merges a tick into the latest cache, not a render-time copy', () => {
    client.setQueryData(queryKeys.checks('summer'), {
      athleteChecks: { '7-1': { corral: true, walkout: false } },
      equipChecks: {},
    })
    const { result } = renderHook(() => useSetAthleteChecks('summer'), { wrapper })
    result.current.setEntry('7-2', () => ({ corral: true, walkout: false }))
    result.current.setEntry('7-1', (old) => ({ corral: false, ...old, walkout: true }))
    expect(client.getQueryData(queryKeys.checks('summer'))).toEqual({
      athleteChecks: {
        '7-1': { corral: true, walkout: true },
        '7-2': { corral: true, walkout: false },
      },
      equipChecks: {},
    })
  })

  it('sends a tick as one entry, not the whole map', async () => {
    const { result } = renderHook(() => useSetEquipChecks('summer'), { wrapper })
    result.current.setEntry('7-1-Rx', (old) => !old)
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/api/checks', {
        slug: 'summer',
        type: 'equipment',
        entry: { key: '7-1-Rx', value: true },
      }),
    )
  })

  // On and off in quick succession must reach the server in that order, or
  // the box ends up ticked on the server while the screen shows it clear.
  it('sends ticks one at a time, in tap order', async () => {
    let release!: () => void
    apiPatch.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({}) }))
    const { result } = renderHook(() => useSetEquipChecks('summer'), { wrapper })
    result.current.setEntry('7-1-Rx', (old) => !old)
    result.current.setEntry('7-1-Rx', (old) => !old)
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1))
    expect(apiPatch.mock.calls[0][1]).toMatchObject({ entry: { value: true } })
    release()
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(2))
    expect(apiPatch.mock.calls[1][1]).toMatchObject({ entry: { value: false } })
  })

  // Both halves live under one cache key. A writer that dropped the other half
  // would un-tick every box the other screen owns.
  it('leaves the other half of the cache alone', () => {
    client.setQueryData(queryKeys.checks('summer'), {
      athleteChecks: { '7-1': { corral: true, walkout: false } },
      equipChecks: { '7-1-Rx': true },
    })
    const { result } = renderHook(() => useSetEquipChecks('summer'), { wrapper })
    result.current.setEntry('7-2-Rx', () => true)
    expect(client.getQueryData(queryKeys.checks('summer'))).toEqual({
      athleteChecks: { '7-1': { corral: true, walkout: false } },
      equipChecks: { '7-1-Rx': true, '7-2-Rx': true },
    })
  })

  // A failed write is v1's own outcome: the tick stays where the finger put it
  // and the next poll is what corrects it.
  it('keeps the tick when the write is refused', async () => {
    apiPatch.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useSetAthleteChecks('summer'), { wrapper })
    result.current.setEntry('7-1', () => ({ corral: true, walkout: false }))
    await waitFor(() => expect(apiPatch).toHaveBeenCalled())
    expect(client.getQueryData(queryKeys.checks('summer'))).toEqual({
      athleteChecks: { '7-1': { corral: true, walkout: false } },
      equipChecks: {},
    })
  })

  // The tick stays, but the screen must still be able to say the save did not
  // land — a silent divergence between screen and server is the audit's core
  // complaint.
  it('reports a refused write so the screen can warn', async () => {
    apiPatch.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useSetAthleteChecks('summer'), { wrapper })
    result.current.setEntry('7-1', () => ({ corral: true, walkout: false }))
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.error?.message).toBe('nope')
  })

  it('setAsync hands the refusal to the caller for the reset dialog', async () => {
    apiPatch.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useSetEquipChecks('summer'), { wrapper })
    await expect(result.current.setAsync({})).rejects.toThrow('nope')
  })

  it('setAsync still writes the cache first', async () => {
    const { result } = renderHook(() => useSetEquipChecks('summer'), { wrapper })
    const promise = result.current.setAsync({ '7-1-Rx': true })
    expect(client.getQueryData(queryKeys.checks('summer'))).toEqual({
      athleteChecks: {},
      equipChecks: { '7-1-Rx': true },
    })
    await promise
  })
})
