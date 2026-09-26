import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiPost, apiPut } from '@/lib/api'
import { postEach } from '@/lib/postEach'
import { queryKeys } from './queryKeys'

// What a volunteer can be at this competition. Defined on the setup screen;
// the roster and the judge screens only offer the list.

export type VolunteerRole = { id: number; name: string }

export function useVolunteerRoles(slug: string) {
  return useQuery({
    queryKey: queryKeys.volunteerRoles(slug),
    queryFn: () => apiGet<VolunteerRole[]>(`/api/volunteer-roles?slug=${slug}`),
    enabled: !!slug,
  })
}

/** `success` is what the MutationCache toasts when the write lands. */
function useRoleWriter<T>(slug: string, success: string, send: (input: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    meta: { success },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.volunteerRoles(slug) }),
  })
}

export function useAddVolunteerRole(slug: string) {
  return useRoleWriter(slug, 'Role added', (name: string) =>
    apiPost('/api/volunteer-roles', { slug, name }))
}

export function useSaveVolunteerRole(slug: string) {
  return useRoleWriter(slug, 'Role saved', ({ id, name }: { id: number; name: string }) =>
    apiPut(`/api/volunteer-roles/${id}?slug=${slug}`, { name }))
}

export function useDeleteVolunteerRole(slug: string) {
  return useRoleWriter(slug, 'Role deleted', (id: number) =>
    apiDel(`/api/volunteer-roles/${id}?slug=${slug}`))
}

/** One POST per name. Re-reads on settle, so a partial import still shows
    the roles that landed. */
export function useImportVolunteerRoles(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (names: string[]) =>
      postEach(names, (name) => name, (name) => apiPost('/api/volunteer-roles', { slug, name })),
    meta: { success: 'Roles imported' },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.volunteerRoles(slug) }),
  })
}
