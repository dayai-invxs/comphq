import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { CompetitionSummary } from './competitions'
import { queryKeys } from './queryKeys'

// Every account on the site, and who may administer what. The whole resource
// is behind requireSiteAdmin, so a caller who is not a super admin gets a 403
// from the first read and the screen says so.

export interface SiteUser {
  id: string
  email: string | null
  isSuper: boolean
  competitions: CompetitionSummary[]
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: () => apiGet<SiteUser[]>('/api/users') })
}

/** `success` is what the MutationCache toasts when the write lands. */
function useUserWriter<T>(success: string, send: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    meta: { success },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useCreateUser() {
  return useUserWriter('User created', (input: {
    email: string
    password: string
    isSuper: boolean
    competitionIds: number[]
  }) => apiPost('/api/users', input))
}

/** PATCH syncs rather than merges: the competitionIds sent become the whole
    set, so an edit always carries every membership the user is to keep. */
export function useUpdateUser() {
  return useUserWriter('User saved', ({ userId, ...body }: {
    userId: string
    isSuper: boolean
    competitionIds: number[]
  }) => apiPatch(`/api/users/${userId}`, body))
}

export function useDeleteUser() {
  return useUserWriter('User deleted', (userId: string) => apiDel(`/api/users/${userId}`))
}

/** Sends the account a reset link. Nothing about the account changes, so
    there is nothing to re-read. */
export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (userId: string) => apiPost(`/api/users/${userId}/reset-password`, {}),
  })
}
