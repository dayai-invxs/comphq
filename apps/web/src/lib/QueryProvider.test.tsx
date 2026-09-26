import { ToastProvider } from '@mond-design-system/react'
import { useMutation } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HttpError } from './http'
import QueryProvider from './QueryProvider'

// The global feedback seam: every useMutation in the app reports through the
// MutationCache unless it says otherwise, so no write can fail silently and
// none has to wire its own toast.

function mount(node: React.ReactNode) {
  return render(
    <ToastProvider regionLabel="Notifications" dismissLabel="Dismiss">
      <QueryProvider>{node}</QueryProvider>
    </ToastProvider>,
  )
}

function Fire({ mutationOptions, label = 'go' }: {
  mutationOptions: Parameters<typeof useMutation>[0]
  label?: string
}) {
  const m = useMutation(mutationOptions)
  return <button onClick={() => m.mutate(undefined)}>{label}</button>
}

describe('mutation feedback', () => {
  it('toasts the failure of a mutation that handles none itself', async () => {
    mount(<Fire mutationOptions={{
      mutationFn: () => Promise.reject(new HttpError(403, '{"error":"Not yours"}')),
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await waitFor(() => expect(screen.getByText('Not yours')).toBeInTheDocument())
  })

  // A mutation with its own onError is one whose screen already says why —
  // a dialog, a banner — and a toast on top would say it twice.
  it('stays quiet when the mutation handles the failure itself', async () => {
    const seen: unknown[] = []
    mount(<Fire mutationOptions={{
      mutationFn: () => Promise.reject(new Error('handled locally')),
      onError: (e: unknown) => { seen.push(e) },
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(screen.queryByText('handled locally')).not.toBeInTheDocument()
  })

  it('toasts the success a mutation names in its meta', async () => {
    mount(<Fire mutationOptions={{
      mutationFn: () => Promise.resolve('ok'),
      meta: { success: 'Settings saved' },
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await waitFor(() => expect(screen.getByText('Settings saved')).toBeInTheDocument())
  })

  it('stays quiet about a success no mutation named', async () => {
    mount(<Fire mutationOptions={{ mutationFn: () => Promise.resolve('ok') }} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    // Let the mutation settle before asserting that no toast appeared:
    // a success toast renders with role="status".
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
