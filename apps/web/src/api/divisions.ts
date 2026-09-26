import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiPost, apiPut } from '@/lib/api'
import { postEach } from '@/lib/postEach'
import { queryKeys } from './queryKeys'

// The competition's divisions. Written on the setup screen and read almost
// everywhere else — the roster assigns athletes to one, equipment can be
// scoped to one, and the heat running order is division order, lowest first.

export type Division = { id: number; name: string; order: number }

export function useDivisions(slug: string) {
  return useQuery({
    queryKey: queryKeys.divisions(slug),
    queryFn: () => apiGet<Division[]>(`/api/divisions?slug=${slug}`),
    enabled: !!slug,
  })
}

/** Deleting a division unassigns the athletes in it, and its order is the
    order the heats run in, so a write here reaches past its own list.
    `success` is what the MutationCache toasts when the write lands. */
function useDivisionWriter<T>(slug: string, success: string, send: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    meta: { success },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.divisions(slug) })
      qc.invalidateQueries({ queryKey: queryKeys.athletes(slug) })
      qc.invalidateQueries({ queryKey: queryKeys.leaderboard(slug) })
    },
  })
}

export function useAddDivision(slug: string) {
  return useDivisionWriter(slug, 'Division added', (input: { name: string; order: number }) =>
    apiPost('/api/divisions', { slug, ...input }))
}

export function useSaveDivision(slug: string) {
  return useDivisionWriter(slug, 'Division saved', ({ id, ...body }: { id: number; name: string; order: number }) =>
    apiPut(`/api/divisions/${id}?slug=${slug}`, body))
}

/** The list with one division moved and the order values the list already
    used dealt back out down it — so a reorder never invents a number and
    never leaves a gap. One computation serves the cache and the writes, so
    what the screen shows is exactly what the server is being sent. */
function dealtOrders(rows: Division[], from: number, to: number): Division[] {
  const next = rows.slice()
  next.splice(to, 0, ...next.splice(from, 1))
  return next.map((division, i) => ({ ...division, order: rows[i].order }))
}

/** A pasted list, one write per division in list order (COM-109). The list is
    re-read on a refusal too, so the divisions that did land show. */
export function useImportDivisions(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inputs: { name: string; order: number }[]) =>
      postEach(inputs, (d) => d.name, (d) => apiPost('/api/divisions', { slug, ...d })),
    meta: { success: 'Divisions imported' },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.divisions(slug) }),
  })
}

/** Moving a division to a position is a move, not an exchange.
 *
 *  v1 traded order values between the division picked and whoever already held
 *  that position, so sending the first division to third left the old third at
 *  first (defect 23). An exchange only reads as a move when the two are next to
 *  each other; over any greater distance it scatters the rows in between.
 *
 *  Only the rows whose value actually changed are written, and they go out
 *  together, so the set never lands half-applied. The pick answers the hand:
 *  the cached list moves first and the writes follow it out; a refusal puts
 *  the old list back, and the setup page's banner names the failure — which is
 *  also why the own onError here keeps the global toast quiet.
 *
 *  `rows` must be in the order the list is drawn in, which is what
 *  GET /api/divisions returns.
 */
export function useReorderDivisions(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ rows, from, to }: { rows: Division[]; from: number; to: number }) => {
      const was = new Map(rows.map((d) => [d.id, d.order]))
      const writes = dealtOrders(rows, from, to)
        .filter((d) => d.order !== was.get(d.id))
        .map((d) => apiPut(`/api/divisions/${d.id}?slug=${slug}`, { order: d.order }))
      return Promise.all(writes)
    },
    meta: { success: 'Divisions reordered' },
    onMutate: async ({ rows, from, to }) => {
      await qc.cancelQueries({ queryKey: queryKeys.divisions(slug) })
      const prev = qc.getQueryData<Division[]>(queryKeys.divisions(slug))
      qc.setQueryData(queryKeys.divisions(slug), dealtOrders(rows, from, to))
      return { prev }
    },
    onError: (_e, _move, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.divisions(slug), ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.divisions(slug) })
      qc.invalidateQueries({ queryKey: queryKeys.athletes(slug) })
      qc.invalidateQueries({ queryKey: queryKeys.leaderboard(slug) })
    },
  })
}

export function useDeleteDivision(slug: string) {
  return useDivisionWriter(slug, 'Division deleted', (id: number) => apiDel(`/api/divisions/${id}?slug=${slug}`))
}
