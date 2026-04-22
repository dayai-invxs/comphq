'use client'

import QueryProvider from '@/lib/QueryProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
