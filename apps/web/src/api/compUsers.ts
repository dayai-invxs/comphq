import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiPatch, apiPost } from '@/lib/api'
import { queryKeys } from './queryKeys'

// Who may work on one competition. The whole resource is behind
// requireCompetitionAdmin — the one part of v1 that asks for the stronger role
// (defect 3 is that nothing else does).

export type CompRole = 'admin' | 'user'
export type CompUser = { userId: string; email: string | null; role: string }

export function useCompUsers(slug: string) {
  return useQuery({
    queryKey: queryKeys.compUsers(slug),
    queryFn: () => apiGet<CompUser[]>(`/api/comp-users?slug=${slug}`),
    enabled: !!slug,
  })
}

/** Re-read after a write: the server decides whether an email became a new
    account or joined an existing one, so the result is not the request.
    `success` is what the MutationCache toasts when the write lands. */
function useRosterWriter<T>(slug: string, success: string, send: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    meta: { success },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.compUsers(slug) }),
  })
}

export function useAddCompUser(slug: string) {
  return useRosterWriter(slug, 'User added', (input: { email: string; password: string; role: CompRole }) =>
    apiPost('/api/comp-users', { slug, ...input }))
}

export function useSetCompUserRole(slug: string) {
  return useRosterWriter(slug, 'Role changed', ({ userId, role }: { userId: string; role: CompRole }) =>
    apiPatch(`/api/comp-users/${userId}`, { slug, role }))
}

export function useRemoveCompUser(slug: string) {
  return useRosterWriter(slug, 'User removed', (userId: string) =>
    apiDel(`/api/comp-users/${userId}?slug=${slug}`))
}
