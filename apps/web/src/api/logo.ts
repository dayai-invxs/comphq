import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiUpload } from '@/lib/api'
import { queryKeys } from './queryKeys'

// The mark on a competition's bars. Each competition has its own; there used
// to be one for the whole site, so one competition's upload replaced every
// other's. Screens outside a competition have no slug and carry the CompHQ
// lockup, so nothing is asked for them.
//
// The server stamps each upload's URL with ?v=<time>: a replacement keeps the
// file's name, and the new address is what gets every drawing of it, here
// and on every other screen, past the copy browsers and the CDN held (v1's
// defect 26).

export type Logo = { url: string | null }

const path = (slug: string) => `/api/logo?slug=${encodeURIComponent(slug)}`

export function useLogo(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.logo(slug ?? ''),
    queryFn: () => apiGet<Logo>(path(slug!)),
    enabled: !!slug,
    // v1 held it for a minute. It is the one read on these screens that does
    // not change during a competition.
    staleTime: 60_000,
  })
}

/** `success` is what the MutationCache toasts when the write lands. */
function useLogoWriter<T>(slug: string, success: string, send: (input: T) => Promise<Logo>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    // The shells draw it, so the write has to reach the header that is
    // already on screen. Written into the cache rather than invalidated: the
    // response carries the new URL, and a re-read would only ask for it again.
    meta: { success },
    onSuccess: (logo) => qc.setQueryData(queryKeys.logo(slug), logo),
  })
}

/** The field name is the server's: it reads `logo` off the form. */
export function useUploadLogo(slug: string) {
  return useLogoWriter(slug, 'Logo uploaded', (file: File) => {
    const form = new FormData()
    form.append('logo', file)
    return apiUpload<Logo>(path(slug), form)
  })
}

export function useRemoveLogo(slug: string) {
  return useLogoWriter(slug, 'Logo removed', () => apiDel<Logo>(path(slug)))
}
