import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { useRoster } from './useRoster'

const { apiDel, apiPost, apiPut } = vi.hoisted(() => ({
  apiDel: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiDel, apiPost, apiPut }))

// v1: the write half of both tabs in src/app/[slug]/admin/people/page.tsx. The
// two tabs ran the same six writes against different nouns, so the writes are
// tested once here and the tabs are tested for what they draw.

type Row = { id: number; name: string }
const ROWS: Row[] = [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bo' }]

function mount(rows: Row[] = ROWS) {
  const setRows = vi.fn()
  const run = vi.fn(async (label: string, op: () => Promise<unknown>) => {
    try { return await op() } catch (e) { run.failures.push(`${label}: ${(e as Error).message}`); return undefined }
  }) as unknown as ReturnType<typeof vi.fn> & { failures: string[] }
  run.failures = []
  const reload = vi.fn(async () => {})
  const setLoading = vi.fn()
  const hook = renderHook(() =>
    useRoster<Row>({
      slug: 'rugged-rumble', resource: 'athletes', noun: 'athlete', swapField: 'newAthleteId',
      rows, setRows, run: run as never, reload, setLoading,
    }),
  )
  return { ...hook, setRows, run, reload, setLoading }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({ id: 9 })
  apiPut.mockResolvedValue({ id: 1 })
  apiDel.mockResolvedValue({ ok: true })
})

describe('adding', () => {
  it('posts the body under the competitions slug, empties the form, then re-reads', async () => {
    const { result, reload, setLoading } = mount()
    const reset = vi.fn()
    await act(() => result.current.add({ name: 'Cy', bibNumber: '9' }, reset))
    expect(apiPost).toHaveBeenCalledWith('/api/athletes', { slug: 'rugged-rumble', name: 'Cy', bibNumber: '9' })
    expect(reset).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
    expect(setLoading.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('sends one request per imported line, named after the line that failed', async () => {
    const { result, run } = mount()
    apiPost.mockRejectedValueOnce(new HttpError(409, 'Bib taken'))
    await act(() => result.current.bulk([
      { name: 'Cy', body: { name: 'Cy' } },
      { name: 'Di', body: { name: 'Di' } },
    ], vi.fn()))
    expect(apiPost).toHaveBeenCalledTimes(2)
    expect(run.failures).toEqual(['Import "Cy": Bib taken'])
  })
})

describe('editing one row', () => {
  it('puts the row and closes the editor', async () => {
    const { result, reload } = mount()
    act(() => result.current.setEditingId(1))
    await act(() => result.current.saveEdit(1, { name: 'Anna' }))
    expect(apiPut).toHaveBeenCalledWith('/api/athletes/1?slug=rugged-rumble', { name: 'Anna' })
    expect(result.current.editingId).toBeNull()
    expect(reload).toHaveBeenCalled()
  })
})

// The two deletes are the only writes that do not report through `run`. They
// are asked in a ConfirmDialog, which holds its own error line, so they reject
// and let the dialog that asked say why.
describe('removing', () => {
  it('drops the row where it stands rather than re-reading', async () => {
    const { result, setRows, reload } = mount()
    act(() => result.current.setSelected(['1', '2']))
    await act(() => result.current.remove(1))
    expect(apiDel).toHaveBeenCalledWith('/api/athletes/1?slug=rugged-rumble')
    expect(setRows.mock.calls[0][0](ROWS)).toEqual([{ id: 2, name: 'Bo' }])
    expect(result.current.selected).toEqual(['2'])
    expect(reload).not.toHaveBeenCalled()
  })

  it('keeps the row and refuses out loud when the delete was refused', async () => {
    const { result, setRows, run } = mount()
    apiDel.mockRejectedValue(new HttpError(403, 'Not yours'))
    await expect(act(() => result.current.remove(1))).rejects.toThrow('Not yours')
    expect(setRows).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('deletes every selected row in one request and lets the selection go', async () => {
    const { result, reload } = mount()
    act(() => { result.current.setSelected(['1', '2']); result.current.setConfirmDeleteSelected(true) })
    await act(() => result.current.deleteSelected())
    expect(apiDel).toHaveBeenCalledWith('/api/athletes', { slug: 'rugged-rumble', ids: [1, 2] })
    expect(result.current.selected).toEqual([])
    expect(reload).toHaveBeenCalled()
  })

  it('keeps the selection and refuses out loud when the bulk delete was refused', async () => {
    const { result, reload, setLoading } = mount()
    apiDel.mockRejectedValue(new HttpError(403, 'Not yours'))
    act(() => result.current.setSelected(['1', '2']))
    await expect(act(() => result.current.deleteSelected())).rejects.toThrow('Not yours')
    expect(result.current.selected).toEqual(['1', '2'])
    expect(reload).not.toHaveBeenCalled()
    expect(setLoading.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  it('asks for nothing when nothing is selected', async () => {
    const { result } = mount()
    await act(() => result.current.deleteSelected())
    expect(apiDel).not.toHaveBeenCalled()
  })
})

describe('swapping one competitor for another', () => {
  // The editor is open on the competitor being replaced, and once they are
  // replaced that row is somebody else — so the editor closes with the picker.
  it('posts the replacement, then closes the editor it was asked from', async () => {
    const { result, reload } = mount()
    act(() => { result.current.setEditingId(1); result.current.setSwapToId('2') })
    await act(() => result.current.swap(1))
    expect(apiPost).toHaveBeenCalledWith('/api/athletes/1/swap?slug=rugged-rumble', { newAthleteId: 2 })
    expect(result.current.editingId).toBeNull()
    expect(result.current.swapToId).toBe('')
    expect(reload).toHaveBeenCalled()
  })

  it('waits until a replacement has been picked', async () => {
    const { result } = mount()
    act(() => result.current.setEditingId(1))
    await act(() => result.current.swap(1))
    expect(apiPost).not.toHaveBeenCalled()
  })

  // v1 read `error` out of the refused body here and nowhere else, which is the
  // difference between a sentence and a line of JSON.
  it('reports the handlers own words, not its JSON', async () => {
    const { result, run } = mount()
    apiPost.mockRejectedValue(new HttpError(409, JSON.stringify({ error: 'Already assigned' })))
    act(() => result.current.setSwapToId('2'))
    await act(() => result.current.swap(1))
    expect(run.failures).toEqual(['Swap athlete: Already assigned'])
  })

  it('falls back to the status when the body says nothing', async () => {
    const { result, run } = mount()
    apiPost.mockRejectedValue(new HttpError(500, 'gateway exploded'))
    act(() => result.current.setSwapToId('2'))
    await act(() => result.current.swap(1))
    expect(run.failures).toEqual(['Swap athlete: HTTP 500'])
  })
})

describe('searching', () => {
  it('matches on any part of a name, ignoring case and outer spaces', () => {
    const { result } = mount()
    act(() => result.current.setSearch('  NN '))
    expect(result.current.matches('Ann')).toBe(true)
    expect(result.current.matches('Bo')).toBe(false)
  })

  it('matches everything while the box is empty', () => {
    const { result } = mount()
    expect(result.current.matches('Bo')).toBe(true)
  })
})
