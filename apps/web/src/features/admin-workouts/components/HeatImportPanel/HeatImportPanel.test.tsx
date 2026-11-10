import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatImportPanel } from './HeatImportPanel'

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiPost }))

const DONE = { imported: 2, workoutsAffected: [1], errors: [], warnings: [], notes: [] }
const EXISTING = { existing: [{ number: 1, name: 'Fran', heats: 3, lanes: 20, scored: true }] }

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  render(<HeatImportPanel slug="summer" />, { wrapper })
  fireEvent.change(screen.getByLabelText('CSV'), { target: { value: '1,1,1,Ann' } })
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
}

const sent = () => apiPost.mock.calls.map((c) => (c[1] as { mode: string }).mode)

beforeEach(() => vi.clearAllMocks())

describe('HeatImportPanel', () => {
  it('imports straight away when no workout in the file has heats', async () => {
    apiPost.mockResolvedValueOnce({ existing: [] }).mockResolvedValueOnce(DONE)
    mount()
    await waitFor(() => expect(sent()).toEqual(['preview', 'replace']))
    expect(await screen.findByText(/Imported 2 assignments/)).toBeInTheDocument()
  })

  it('asks first when heats exist, and adds / updates on that choice', async () => {
    apiPost.mockResolvedValueOnce(EXISTING).mockResolvedValueOnce({ ...DONE, notes: [{ message: 'Workout #1: 18 lanes not in the file left as they were.' }] })
    mount()
    expect(await screen.findByText('Workout 1 · Fran: 3 heats, 20 lanes (has scores)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add / update' }))
    await waitFor(() => expect(sent()).toEqual(['preview', 'merge']))
    expect(await screen.findByText('Workout #1: 18 lanes not in the file left as they were.')).toBeInTheDocument()
  })

  it('replaces only after a second, are-you-sure confirmation', async () => {
    apiPost.mockResolvedValueOnce(EXISTING).mockResolvedValueOnce(DONE)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Replace…' }))
    expect(await screen.findByText('Replace every heat in Workout 1?')).toBeInTheDocument()
    expect(screen.getByText(/Are you sure\? .* Some of these workouts have scores\./)).toBeInTheDocument()
    expect(sent()).toEqual(['preview'])
    fireEvent.click(screen.getByRole('button', { name: 'Yes, replace heats' }))
    await waitFor(() => expect(sent()).toEqual(['preview', 'replace']))
  })

  it('imports nothing when cancelled', async () => {
    apiPost.mockResolvedValueOnce(EXISTING)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText(/Fran/)).toBeNull())
    expect(sent()).toEqual(['preview'])
  })
})
