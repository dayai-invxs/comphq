import { render } from '@testing-library/react'
import { ToastProvider } from '@mond-design-system/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, useLocation, type MemoryRouterProps } from 'react-router'
import type { ReactNode } from 'react'

// What a screen needs around it to render at all: a query client, a router and
// the toast region, all three of which App mounts. Retries are off so a
// deliberately failing request settles in the test rather than after three
// backoffs.

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <div data-testid="location">{pathname + search}</div>
}

/** Reads the path the app navigated to. */
export function currentPath(): string {
  return document.querySelector('[data-testid="location"]')?.textContent ?? ''
}

export function renderRoutes(routes: ReactNode, initialEntries: MemoryRouterProps['initialEntries'] = ['/']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <LocationProbe />
          <Routes>{routes}</Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ToastProvider>,
  )
}
