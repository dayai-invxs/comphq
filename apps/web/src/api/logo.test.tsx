import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from './queryKeys'
import { useLogo, useRemoveLogo, useUploadLogo } from './logo'

const { apiDel, apiGet, apiUpload } = vi.hoisted(() => ({
  apiDel: vi.fn(), apiGet: vi.fn(), apiUpload: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiDel, apiGet, apiUpload }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const png = () => new File(['x'], 'logo.png', { type: 'image/png' })
const cached = () => client.getQueryData(queryKeys.logo) as { url: string | null }

beforeEach(() => {
  vi.clearAllMocks()
  // The upload stamps the URL with the clock, and two uploads a millisecond
  // apart would stamp it the same. Held still so the test moves it itself.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  apiGet.mockResolvedValue({ url: null })
  apiUpload.mockResolvedValue({ url: 'https://cdn/competition-logo.png' })
  apiDel.mockResolvedValue({ url: null })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLogo', () => {
  // No slug anywhere: one logo for the install, not one per competition.
  it('asks for the one logo the whole install shares', async () => {
    renderHook(() => useLogo(), { wrapper })
    await act(async () => {})
    expect(apiGet).toHaveBeenCalledWith('/api/logo')
  })
})

describe('writing the logo', () => {
  it('sends the file under the field name the route reads', async () => {
    const { result } = renderHook(() => useUploadLogo(), { wrapper })
    const file = png()
    await act(() => result.current.mutateAsync(file))
    const [path, form] = apiUpload.mock.calls[0]
    expect(path).toBe('/api/logo')
    expect((form as FormData).get('logo')).toBe(file)
  })

  it('removes it without a body', async () => {
    const { result } = renderHook(() => useRemoveLogo(), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(apiDel).toHaveBeenCalledWith('/api/logo')
  })

  // Every shell draws the mark, so the header already on screen has to change
  // with it. The response carries the new URL, so it is written rather than
  // asked for a second time.
  it('puts the new URL straight into the cache the shells read', async () => {
    const { result } = renderHook(() => useUploadLogo(), { wrapper })
    await act(() => result.current.mutateAsync(png()))
    expect(cached().url).toMatch(/^https:\/\/cdn\/competition-logo\.png\?/)
  })

  // Defect 26: a replacement is stored under the name it replaced, so nothing
  // about the URL changes and every drawing of it keeps the browser's copy.
  it('marks a replacement so every drawing of it gets past the cached file', async () => {
    const { result } = renderHook(() => useUploadLogo(), { wrapper })
    await act(() => result.current.mutateAsync(png()))
    const first = cached().url
    vi.setSystemTime(new Date('2026-01-01T00:00:01Z'))
    await act(() => result.current.mutateAsync(png()))
    expect(cached().url).not.toBe(first)
  })

  it('keeps a URL that already carries a query, rather than replacing it', async () => {
    apiUpload.mockResolvedValue({ url: 'https://cdn/logo.png?v=2' })
    const { result } = renderHook(() => useUploadLogo(), { wrapper })
    await act(() => result.current.mutateAsync(png()))
    expect(cached().url).toMatch(/^https:\/\/cdn\/logo\.png\?v=2&t=/)
  })

  it('empties that cache when the logo is removed', async () => {
    client.setQueryData(queryKeys.logo, { url: 'https://cdn/competition-logo.png' })
    const { result } = renderHook(() => useRemoveLogo(), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(client.getQueryData(queryKeys.logo)).toEqual({ url: null })
  })
})
