import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const cached = (slug = 'summer') => client.getQueryData(queryKeys.logo(slug)) as { url: string | null } | undefined

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue({ url: null })
  apiUpload.mockResolvedValue({ url: 'https://cdn/logos/1/logo.png?v=2' })
  apiDel.mockResolvedValue({ url: null })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('useLogo', () => {
  it('asks for the competition\'s own logo', async () => {
    renderHook(() => useLogo('summer'), { wrapper })
    await act(async () => {})
    expect(apiGet).toHaveBeenCalledWith('/api/logo?slug=summer')
  })

  // Outside a competition there is no logo to ask for.
  it('asks for nothing without a competition', async () => {
    renderHook(() => useLogo(undefined), { wrapper })
    await act(async () => {})
    expect(apiGet).not.toHaveBeenCalled()
  })
})

describe('writing the logo', () => {
  it('sends the file under the field name the route reads, for its competition', async () => {
    const { result } = renderHook(() => useUploadLogo('summer'), { wrapper })
    const file = png()
    await act(() => result.current.mutateAsync(file))
    const [path, form] = apiUpload.mock.calls[0]
    expect(path).toBe('/api/logo?slug=summer')
    expect((form as FormData).get('logo')).toBe(file)
  })

  it('removes it without a body', async () => {
    const { result } = renderHook(() => useRemoveLogo('summer'), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(apiDel).toHaveBeenCalledWith('/api/logo?slug=summer')
  })

  // Every shell draws the mark, so the header already on screen has to change
  // with it. The response carries the new, stamped URL, so it is written
  // rather than asked for a second time.
  it('puts the new URL straight into that competition\'s cache', async () => {
    const { result } = renderHook(() => useUploadLogo('summer'), { wrapper })
    await act(() => result.current.mutateAsync(png()))
    expect(cached()?.url).toBe('https://cdn/logos/1/logo.png?v=2')
    expect(cached('winter')).toBeUndefined()
  })

  it('empties that cache when the logo is removed', async () => {
    client.setQueryData(queryKeys.logo('summer'), { url: 'https://cdn/logos/1/logo.png?v=1' })
    const { result } = renderHook(() => useRemoveLogo('summer'), { wrapper })
    await act(() => result.current.mutateAsync())
    expect(cached()).toEqual({ url: null })
  })
})
