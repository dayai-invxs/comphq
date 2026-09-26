import { Route } from 'react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { JudgeGate } from './JudgeGate'

// What the gate has to do: refuse the screen to a stranger, open it to a judge
// who knows the competition's password or is already signed in, and remember
// that for the session. And it has to refuse the compiled-in password to
// anyone the competition never gave it to (defect 20).

const { apiGet, useSession } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useSession: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet }))
vi.mock('@/lib/session', () => ({ useSession }))

function serve(settings: unknown = { judgePassword: 'letmein' }) {
  apiGet.mockImplementation(() => Promise.resolve(settings))
}

function mount() {
  return renderRoutes(
    <Route path=":slug" element={<JudgeGate title="Judge Access">the schedule</JudgeGate>} />,
    ['/summer'],
  )
}

function enter(password: string) {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  useSession.mockReturnValue({ user: null, loading: false, signOut: vi.fn() })
  serve()
})

describe('JudgeGate', () => {
  it('shows nothing at all until it knows who is asking', () => {
    useSession.mockReturnValue({ user: null, loading: true, signOut: vi.fn() })
    mount()
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Judge Access' })).not.toBeInTheDocument()
  })

  it('asks for a password when nobody is signed in', async () => {
    mount()
    expect(await screen.findByRole('heading', { name: 'Judge Access' })).toBeInTheDocument()
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  it('reads the settings for the slug in the address', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    expect(apiGet).toHaveBeenCalledWith('/api/settings?slug=summer')
  })

  it('lets a signed-in user straight through', async () => {
    useSession.mockReturnValue({ user: { id: 'u1' }, loading: false, signOut: vi.fn() })
    mount()
    expect(await screen.findByText('the schedule')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Judge Access' })).not.toBeInTheDocument()
  })

  it("opens on the competition's own password", async () => {
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled())
    enter('letmein')
    expect(await screen.findByText('the schedule')).toBeInTheDocument()
  })

  it('remembers the unlock for the rest of the session', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled())
    enter('letmein')
    await screen.findByText('the schedule')
    expect(sessionStorage.getItem('judgeUnlocked')).toBe('1')
  })

  // One gate, one key: a judge who opened the judge screen is not asked again
  // by the equipment screen.
  it('opens straight away for a session that has already unlocked', async () => {
    sessionStorage.setItem('judgeUnlocked', '1')
    mount()
    expect(await screen.findByText('the schedule')).toBeInTheDocument()
  })

  it('says so on a wrong password, and takes the wrong one back', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled())
    enter('nope')
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  // DEFECT 20, fixed here. v1 resolved the password as
  // `settings.data?.judgePassword ?? BUILT_IN`, and `data` is undefined while
  // the request is in flight — so for the first frames of every visit the
  // compiled-in constant opened a screen the competition had given its own
  // password to.
  it('refuses the built-in password while the settings are still in flight', async () => {
    apiGet.mockImplementation(() => new Promise(() => {}))
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    enter('rug702')
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  it('will not take an answer at all until the read has settled', async () => {
    apiGet.mockImplementation(() => new Promise(() => {}))
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    expect(screen.getByRole('button', { name: 'Enter' })).toHaveAttribute('aria-disabled', 'true')
  })

  it("refuses the competition's password too, until then", async () => {
    apiGet.mockImplementation(() => new Promise(() => {}))
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    enter('letmein')
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  // The fallback is for the case it was written for: a box with no signal has
  // to let its judges in.
  it('falls back to the built-in password once the read has failed', async () => {
    apiGet.mockImplementation(() => Promise.reject(new Error('offline')))
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled())
    enter('rug702')
    expect(await screen.findByText('the schedule')).toBeInTheDocument()
  })

  it('still refuses a wrong password when the read has failed', async () => {
    apiGet.mockImplementation(() => Promise.reject(new Error('offline')))
    mount()
    await screen.findByRole('heading', { name: 'Judge Access' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled())
    enter('letmein')
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument()
  })
})
