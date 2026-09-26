'use client'

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useToast } from '@mond-design-system/react'
import { useRef, useState } from 'react'
import { errorMessage } from './errorMessage'

/**
 * Wraps the app in a TanStack Query provider. One client instance per
 * browser session — state survives page navigations but not full reloads.
 *
 * Defaults chosen for a live-comp app:
 * - refetchOnWindowFocus: true — scorekeeper tabs come back, grab fresh data
 * - refetchOnReconnect: true — wifi hiccups shouldn't leave stale scores
 * - staleTime: 5_000 — matches the CDN Cache-Control s-maxage on the
 *   public read routes so we don't hit uncached requests from multiple
 *   components that mount close together
 *
 * The MutationCache is the app's feedback seam. Every useMutation reports
 * here, so no write can fail into silence: a failure toasts unless the
 * mutation carries its own onError — a screen that already says why, in a
 * dialog or a banner, should not be echoed — and a success toasts when the
 * mutation names one in `meta.success`.
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // The client outlives renders while the toast function belongs to the
  // current one; the ref hands the long-lived cache the current function.
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [client] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.onError) return
            toastRef.current({ title: errorMessage(error), tone: 'danger' })
          },
          onSuccess: (_data, _variables, _context, mutation) => {
            const title = mutation.meta?.success
            if (typeof title === 'string') toastRef.current({ title, tone: 'success' })
          },
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            staleTime: 5_000,
            retry: 1,
          },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
