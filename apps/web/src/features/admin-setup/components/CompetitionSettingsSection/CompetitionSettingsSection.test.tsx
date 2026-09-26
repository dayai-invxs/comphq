import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { CompetitionSettingsSection } from './CompetitionSettingsSection'

// v1: the Competition Settings section of src/app/[slug]/admin/setup/page.tsx.
// Four settings, each written the moment it is changed — there is no Save.

const onPatch = vi.fn()

function draw(over: Partial<Parameters<typeof CompetitionSettingsSection>[0]> = {}) {
  return render(
    <CompetitionSettingsSection
      showBib
      leaderboardVisibility="per_workout"
      judgePassword="rug702"
      judgeMaxConsecutive={3}
      onPatch={onPatch}
      {...over}
    />,
  )
}

const bib = () => screen.getByRole('switch', { name: 'Show Bib Numbers' })
const live = () => screen.getByRole('switch', { name: 'Live Leaderboard' })
const password = () => screen.getByRole('textbox', { name: 'Judge Screen Password' })
const consecutive = () => screen.getByRole('spinbutton', { name: 'Judge Max Consecutive Heats' })

beforeEach(() => {
  vi.clearAllMocks()
  onPatch.mockResolvedValue(undefined)
})

it('says up front that nothing here waits for a Save', () => {
  draw()
  expect(screen.getByRole('heading', { name: 'Competition Settings' })).toBeInTheDocument()
  expect(screen.getByText('Every control here writes as it is changed. There is no Save.')).toBeInTheDocument()
})

it('shows each setting where it stands', () => {
  draw()
  expect(bib()).toBeChecked()
  expect(live()).not.toBeChecked()
  expect(password()).toHaveValue('rug702')
  expect(consecutive()).toHaveValue(3)
})

it('writes the bib setting the moment it is toggled', async () => {
  draw()
  fireEvent.click(bib())
  await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ showBib: false }))
})

// The toggle is on when the board updates per heat, which is the setting's
// livelier half — v1 named the control for that, not for the stored value.
it('names the two leaderboard settings by what they do', () => {
  const { rerender } = draw()
  expect(screen.getByText('Leaderboard only shows after a full workout is completed')).toBeInTheDocument()

  rerender(
    <CompetitionSettingsSection
      showBib
      leaderboardVisibility="per_heat"
      judgePassword="rug702"
      judgeMaxConsecutive={3}
      onPatch={onPatch}
    />,
  )
  expect(live()).toBeChecked()
  expect(screen.getByText('Leaderboard updates after each completed heat')).toBeInTheDocument()
})

it('swaps the leaderboard setting for the other one', async () => {
  draw()
  fireEvent.click(live())
  await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ leaderboardVisibility: 'per_heat' }))
})

it('swaps it back', async () => {
  draw({ leaderboardVisibility: 'per_heat' })
  fireEvent.click(live())
  await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ leaderboardVisibility: 'per_workout' }))
})

it('saves a trimmed password when the box is left', async () => {
  draw()
  fireEvent.change(password(), { target: { value: '  hunter2  ' } })
  fireEvent.blur(password())
  await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ judgePassword: 'hunter2' }))
})

// v1 skipped the write rather than clearing the password, so the box can read
// empty while the old password still opens the screen.
it('refuses to save an empty password, and says nothing about it', async () => {
  draw()
  fireEvent.change(password(), { target: { value: '   ' } })
  fireEvent.blur(password())
  await waitFor(() => expect(onPatch).not.toHaveBeenCalled())
})

// Enter does not save; it leaves the box, and leaving the box saves. The
// focus is what a typist would already have, and blur only fires from it.
it('leaves the box on Enter, which is what saves it', async () => {
  draw()
  password().focus()
  fireEvent.change(password(), { target: { value: 'hunter2' } })
  fireEvent.keyDown(password(), { key: 'Enter' })
  await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ judgePassword: 'hunter2' }))
})

it('saves the consecutive-heat cap when the box is left', async () => {
  draw()
  fireEvent.change(consecutive(), { target: { value: '5' } })
  fireEvent.blur(consecutive())
  await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ judgeMaxConsecutive: 5 }))
})

it('refuses a cap outside v1s one-to-twenty range', async () => {
  draw()
  fireEvent.change(consecutive(), { target: { value: '0' } })
  fireEvent.blur(consecutive())
  fireEvent.change(consecutive(), { target: { value: '21' } })
  fireEvent.blur(consecutive())
  await waitFor(() => expect(onPatch).not.toHaveBeenCalled())
})

// The switches are drawn from the props, not from a flip of their own, so a
// refused write leaves the control showing what the server still holds. v1
// flipped first and sent the PATCH unchecked, which left the switch claiming
// a setting that had never been accepted.
it('leaves a switch where the server has it when the write is refused', async () => {
  onPatch.mockRejectedValue(new Error('Settings are read-only'))
  draw()
  fireEvent.click(bib())
  await waitFor(() => expect(onPatch).toHaveBeenCalled())
  expect(bib()).toBeChecked()
})
