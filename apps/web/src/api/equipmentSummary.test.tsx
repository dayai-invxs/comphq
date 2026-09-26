import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useEquipmentSummary } from './equipmentSummary'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiGet }))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockResolvedValue({ items: [] })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

// v1 put the master list behind a Load button: it walks every workout's
// equipment rows and is not what the screen is for.
it('asks for nothing until it is asked for', () => {
  renderHook(() => useEquipmentSummary('summer', false), { wrapper })
  expect(apiGet).not.toHaveBeenCalled()
})

it('reads the summary once enabled, and hands back the items', async () => {
  apiGet.mockResolvedValue({ items: [{ item: 'Barbell', maxCount: 4, breakdown: [] }] })
  const { result } = renderHook(() => useEquipmentSummary('summer', true), { wrapper })
  await waitFor(() => expect(result.current.data).toEqual([{ item: 'Barbell', maxCount: 4, breakdown: [] }]))
  expect(apiGet).toHaveBeenCalledWith('/api/equipment-summary?slug=summer')
})
