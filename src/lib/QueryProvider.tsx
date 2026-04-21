'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

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
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
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
