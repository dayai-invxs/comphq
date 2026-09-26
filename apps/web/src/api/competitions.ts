import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiPost } from '@/lib/api'
import { queryKeys } from './queryKeys'

// The competition resource: the two lists the shells gate on, and the two
// writes the super-admin home makes.

export interface CompetitionSummary {
  id: number
  name: string
  slug: string
}

/** A competition the signed-in user has a CompetitionAdmin row for. Super
    admins get every competition, all reported as role 'admin'. */
export interface MyCompetition extends CompetitionSummary {
  role: string
}

// Public in v1 — it lists every competition to anyone (defect 4). The admin
// gate leans on that, so it is read here as v1 read it.
export function useCompetitions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.competitions,
    queryFn: () => apiGet<CompetitionSummary[]>('/api/competitions'),
    enabled,
  })
}

export function useMyCompetitions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.myCompetitions,
    queryFn: () => apiGet<MyCompetition[]>('/api/competitions/mine'),
    enabled,
  })
}

/** Both lists change together: creating a competition makes its creator that
    competition's admin, and deleting one takes that membership with it. */
/** `success` is what the MutationCache toasts when the write lands. */
function useListWriter<T, R>(success: string, send: (input: T) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    meta: { success },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.competitions })
      qc.invalidateQueries({ queryKey: queryKeys.myCompetitions })
    },
  })
}

export function useCreateCompetition() {
  return useListWriter('Competition created', (input: { name: string; slug: string }) =>
    apiPost<CompetitionSummary>('/api/competitions', input))
}

export function useDeleteCompetition() {
  return useListWriter('Competition deleted', (id: number) => apiDel(`/api/competitions/${id}`))
}
