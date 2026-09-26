import { useCallback, useState } from 'react'
import { apiDel, apiPost, apiPut } from '@/lib/api'
import { HttpError } from '@/lib/http'
import type { RunFn } from './usePeople'

// v1: the write half of both tabs in src/app/[slug]/admin/people/page.tsx. The
// athletes tab and the volunteers tab ran the same six writes — add, import,
// edit, remove, bulk delete, swap — against different nouns, with the same
// inline confirm state around them. v1 wrote all of it twice, 240 lines each.
// It is written once here and the tabs keep only what they draw.
//
// Two ports rather than copies, both forced by the move off Next:
//
// v1's withdraw and swap called `fetch` on a same-origin path. v3's handlers
// are on another origin behind a gateway that wants credentials, so every call
// goes through lib/api. That is also why a refused withdraw now names itself:
// v1 never read `res.ok` on that one, so it looked like it had worked.
//
// The confirmations are no longer here. v1 asked its questions in the row —
// three ids of state, one per question, because the row is where the answer
// had to be drawn. A delete is asked in a ConfirmDialog now, which holds its
// own question and its own failure, so the two delete writes reject rather
// than report: the dialog that asked is where a refusal belongs.
//
// And `swap` keeps v1's message. It is the one write v1 hand-rolled, to show
// the handler's `error` field instead of the raw body every other write here
// shows — the difference between "Bib 7 is taken" and a line of JSON.

export type Row = { id: number; name: string }

type Config<T extends Row> = {
  slug: string
  resource: 'athletes' | 'volunteers'
  noun: string
  swapField: 'newAthleteId' | 'newVolunteerId'
  rows: T[]
  setRows: React.Dispatch<React.SetStateAction<T[]>>
  run: RunFn
  reload: () => Promise<void>
  setLoading: (v: boolean) => void
}

function swapError(e: unknown): Error {
  if (!(e instanceof HttpError)) return e instanceof Error ? e : new Error(String(e))
  const body: unknown = (() => { try { return JSON.parse(e.message) } catch { return null } })()
  const named = body && typeof body === 'object' ? (body as { error?: unknown }).error : null
  return new Error(typeof named === 'string' ? named : `HTTP ${e.status}`)
}

export function useRoster<T extends Row>({
  slug, resource, noun, swapField, rows, setRows, run, reload, setLoading,
}: Config<T>) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  /** The row the editor is open on. */
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [swapToId, setSwapToId] = useState('')

  const add = useCallback(async (body: object, reset: () => void) => {
    setLoading(true)
    await run(`Add ${noun}`, () => apiPost(`/api/${resource}`, { slug, ...body }))
    reset()
    await reload()
    setLoading(false)
  }, [noun, reload, resource, run, setLoading, slug])

  // One request per line, and one banner per line that fails, so an import
  // that trips on row 4 still lands rows 5 and 6.
  const bulk = useCallback(async (entries: { name: string; body: object }[], reset: () => void) => {
    setLoading(true)
    for (const entry of entries) {
      await run(`Import "${entry.name}"`, () => apiPost(`/api/${resource}`, { slug, ...entry.body }))
    }
    reset()
    await reload()
    setLoading(false)
  }, [reload, resource, run, setLoading, slug])

  const saveEdit = useCallback(async (id: number, body: object) => {
    await run('Save edit', () => apiPut(`/api/${resource}/${id}?slug=${slug}`, body))
    setEditingId(null)
    await reload()
  }, [reload, resource, run, slug])

  // The one write with no re-read: the row is dropped where it stands, so a
  // long roster does not redraw to lose a line. Rejects, so the dialog that
  // asked the question keeps the row and says why.
  const remove = useCallback(async (id: number) => {
    await apiDel(`/api/${resource}/${id}?slug=${slug}`)
    setRows((prev) => prev.filter((row) => row.id !== id))
    setSelected((prev) => prev.filter((key) => key !== String(id)))
  }, [resource, setRows, slug])

  const deleteSelected = useCallback(async () => {
    if (selected.length === 0) return
    setLoading(true)
    try {
      await apiDel(`/api/${resource}`, { slug, ids: selected.map(Number) })
      setSelected([])
      await reload()
    } finally {
      setLoading(false)
    }
  }, [reload, resource, selected, setLoading, slug])

  // The editor is open on the row being replaced, and after a swap that row is
  // somebody else — so the editor closes rather than redrawing under the hand.
  const swap = useCallback(async (fromId: number) => {
    if (!swapToId) return
    setLoading(true)
    await run(`Swap ${noun}`, async () => {
      try {
        return await apiPost(`/api/${resource}/${fromId}/swap?slug=${slug}`, { [swapField]: Number(swapToId) })
      } catch (e) {
        throw swapError(e)
      }
    })
    setSwapToId('')
    setEditingId(null)
    await reload()
    setLoading(false)
  }, [noun, reload, resource, run, setLoading, slug, swapField, swapToId])

  const term = search.trim().toLowerCase()
  const matches = useCallback((name: string) => !term || name.toLowerCase().includes(term), [term])

  return {
    rows,
    selected, setSelected, search, setSearch, matches,
    editingId, setEditingId,
    confirmDeleteSelected, setConfirmDeleteSelected,
    swapToId, setSwapToId,
    add, bulk, saveEdit, remove, deleteSelected, swap,
  }
}

export type Roster<T extends Row> = ReturnType<typeof useRoster<T>>
