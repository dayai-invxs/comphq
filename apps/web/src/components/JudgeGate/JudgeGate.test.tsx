import { Route } from 'react-router'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRoutes } from '@/test/harness'
import { HttpError } from '@/lib/http'
import { forgetJudgeToken } from '@/lib/judgeToken'
import { JudgeGate } from './JudgeGate'

// What the gate has to do: refuse the screen to a stranger, open it to a judge
// who knows the competition's password or is already signed in, and remember
// that for this competition for the session. The password is the server's to
// check; the gate never holds it.

const { apiPost, useSession } = vi.hoisted(() => ({
  apiPost: vi.fn(),
  useSession: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiPost }))
vi.mock('@/lib/session', () => ({ useSession }))

/** The server's answer: yes for this password, 403 for any other. */
function accept(password = 'letmein') {
  apiPost.mockImplementation((_path: string, body: { password: string }) =>
    body.password === password ? Promise.resolve({ ok: true, token: 'tok' }) : Promise.reject(new HttpError(403, 'Incorrect password')))
}

function mount(slug = 'summer') {
  return renderRoutes(
    <Route path=":slug" element={<JudgeGate title="Judge Access">the schedule</JudgeGate>} />,
    [`/${slug}`],
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
  accept()
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

  it('lets a signed-in person straight through', () => {
    useSession.mockReturnValue({ user: { id: 'u1' }, loading: false, signOut: vi.fn() })
    mount()
    expect(screen.getByText('the schedule')).toBeInTheDocument()
  })

  it('has the server check the password, for the competition in the address', async () => {
    mount()
    enter('letmein')
    expect(await screen.findByText('the schedule')).toBeInTheDocument()
    expect(apiPost).toHaveBeenCalledWith('/api/settings/judge', { slug: 'summer', password: 'letmein' })
  })

  it('says so on a wrong password, and takes the wrong one back', async () => {
    mount()
    enter('nope')
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  it('tells a connection failure apart from a wrong password', async () => {
    apiPost.mockRejectedValue(new TypeError('Failed to fetch'))
    mount()
    enter('letmein')
    expect(await screen.findByText(/Could not check the password/)).toBeInTheDocument()
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  // The token is what the screen's ticks carry back; it stands for the unlock.
  it('remembers the unlock for the rest of the session', async () => {
    mount()
    enter('letmein')
    await screen.findByText('the schedule')
    expect(sessionStorage.getItem('judgeToken:summer')).toBe('tok')
  })

  it('opens straight away for a session that has already unlocked this competition', () => {
    sessionStorage.setItem('judgeToken:summer', 'tok')
    mount()
    expect(screen.getByText('the schedule')).toBeInTheDocument()
  })

  // An unlock for one competition used to open every competition's screens.
  it('still asks in another competition', async () => {
    sessionStorage.setItem('judgeToken:summer', 'tok')
    mount('winter')
    expect(await screen.findByRole('heading', { name: 'Judge Access' })).toBeInTheDocument()
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })

  // An unlock from before tokens has nothing for the ticks to carry.
  it('ignores the old unlocks', async () => {
    sessionStorage.setItem('judgeUnlocked', '1')
    sessionStorage.setItem('judgeUnlocked:summer', '1')
    mount()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Judge Access' })).toBeInTheDocument())
  })

  it('says so when it has been asked too many times', async () => {
    apiPost.mockRejectedValue(new HttpError(429, 'Too many attempts'))
    mount()
    enter('letmein')
    expect(await screen.findByText('Too many tries. Wait a minute and try again.')).toBeInTheDocument()
  })

  // The password was changed on Setup while the screen was open: the server
  // stops taking its ticks, and the screen asks for the new password.
  it('locks again when the token is forgotten', async () => {
    sessionStorage.setItem('judgeToken:summer', 'tok')
    mount()
    expect(screen.getByText('the schedule')).toBeInTheDocument()
    act(() => forgetJudgeToken('summer'))
    expect(await screen.findByText('The password has changed. Enter the new one.')).toBeInTheDocument()
    expect(screen.queryByText('the schedule')).not.toBeInTheDocument()
  })
})
