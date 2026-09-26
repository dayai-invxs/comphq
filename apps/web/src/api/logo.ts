import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDel, apiGet, apiUpload } from '@/lib/api'
import { queryKeys } from './queryKeys'

// The mark on the shell. Stored against competitionId 0 (defect 8), so there
// is one for the whole install rather than one per competition — which is why
// nothing here is keyed by slug.

export type Logo = { url: string | null }

export function useLogo() {
  return useQuery({
    queryKey: queryKeys.logo,
    queryFn: () => apiGet<Logo>('/api/logo'),
    // v1 held it for a minute. It is the one read on these screens that does
    // not change during a competition.
    staleTime: 60_000,
  })
}

/** `success` is what the MutationCache toasts when the write lands. */
function useLogoWriter<T>(success: string, send: (input: T) => Promise<Logo>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    // The shells draw it, so the write has to reach the header that is
    // already on screen. Written into the cache rather than invalidated: the
    // response carries the new URL, and a re-read would only ask for it again.
    meta: { success },
    onSuccess: (logo) => qc.setQueryData(queryKeys.logo, logo),
  })
}

/** A replacement keeps the stored URL — same bucket, same name — so the
 *  browser goes on serving the copy it already has. The stamp is put on the
 *  URL that lands in the cache, which is the URL every drawing of the mark
 *  reads: the setup screen's preview and the shell's app bar move past the old
 *  file together.
 *
 *  v1 stamped its own preview and nothing else, so the header kept the old
 *  logo until the page was reloaded (defect 26). Stamping at the call site is
 *  what caused that; there is one cache and the stamp belongs on it. */
function bust(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
}

/** The field name is the server's: it reads `logo` off the form. */
export function useUploadLogo() {
  return useLogoWriter('Logo uploaded', async (file: File) => {
    const form = new FormData()
    form.append('logo', file)
    const logo = await apiUpload<Logo>('/api/logo', form)
    return { url: logo.url ? bust(logo.url) : null }
  })
}

export function useRemoveLogo() {
  return useLogoWriter('Logo removed', () => apiDel<Logo>('/api/logo'))
}
