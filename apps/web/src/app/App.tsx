import { RouterProvider } from 'react-router'
import { ToastProvider } from '@mond-design-system/react'
import QueryProvider from '@/lib/QueryProvider'
import { SessionProvider } from '@/lib/session'
import { router } from './router'

// The provider stack. v1's src/app/providers.tsx held only QueryProvider —
// it asked Supabase for the user again in each of its two admin layouts — so
// the session sits inside the query cache and outside the router: the cache
// because the session hooks read through it, the router because every route
// depends on both.
export function App() {
  return (
    <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss">
      <QueryProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryProvider>
    </ToastProvider>
  )
}
