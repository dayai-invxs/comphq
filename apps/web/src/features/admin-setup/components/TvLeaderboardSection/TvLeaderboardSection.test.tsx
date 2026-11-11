import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { TvLeaderboardSection } from './TvLeaderboardSection'

// v1: the TV Leaderboard section of src/app/[slug]/admin/setup/page.tsx. What
// the scoreboard in the gym shows, and in which order it shows it.

const onSaveOrder = vi.fn()
const onSavePercentages = vi.fn()
const onSaveSecondsPerScreen = vi.fn()

const RX = { id: 1, name: 'RX', order: 1, teamSize: 1, menCount: null, womenCount: null }
const SCALED = { id: 2, name: 'Scaled', order: 2, teamSize: 1, menCount: null, womenCount: null }

function draw(over: Partial<Parameters<typeof TvLeaderboardSection>[0]> = {}) {
  return render(
    <TvLeaderboardSection
      divisions={[RX, SCALED]}
      order={{ RX: 2 }}
      percentages={{ RX: 40 }}
      onSaveOrder={onSaveOrder}
      onSavePercentages={onSavePercentages}
      secondsPerScreen={10}
      onSaveSecondsPerScreen={onSaveSecondsPerScreen}
      {...over}
    />,
  )
}

const position = (name: string) => screen.getByRole('combobox', { name: `TV position of ${name}` })
const percent = (name: string) => screen.getByRole('spinbutton', { name: `Percent of ${name} shown` })

beforeEach(() => {
  vi.clearAllMocks()
  onSaveOrder.mockResolvedValue(undefined)
  onSavePercentages.mockResolvedValue(undefined)
  onSaveSecondsPerScreen.mockResolvedValue(undefined)
})

it('says what the panel decides', () => {
  draw()
  expect(screen.getByRole('heading', { name: 'TV Display' })).toBeInTheDocument()
  expect(screen.getByText('How long each screen shows, and the order and % of top athletes per division on the leaderboard')).toBeInTheDocument()
})

it('says where the divisions come from rather than drawing an empty table', () => {
  draw({ divisions: [] })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText('No divisions to show')).toBeInTheDocument()
})

it('shows each division where it stands, and blank where it has no position', () => {
  draw()
  expect(position('RX')).toHaveValue('2')
  expect(position('Scaled')).toHaveValue('')
})

// v1 keys both settings by division name rather than id, so a rename loses
// the setting. Ported as-is.
it('keys a position by the divisions name', async () => {
  draw()
  fireEvent.change(position('Scaled'), { target: { value: '1' } })
  await waitFor(() => expect(onSaveOrder).toHaveBeenCalledWith({ RX: 2, Scaled: 1 }))
})

it('drops the key when a division is given no position', async () => {
  draw()
  fireEvent.change(position('RX'), { target: { value: '' } })
  await waitFor(() => expect(onSaveOrder).toHaveBeenCalledWith({}))
})

it('shows every division as a percentage, all of it unless told otherwise', () => {
  draw()
  expect(percent('RX')).toHaveValue(40)
  expect(percent('Scaled')).toHaveValue(100)
})

it('saves a percentage when the box is left', async () => {
  draw()
  fireEvent.change(percent('Scaled'), { target: { value: '25' } })
  fireEvent.blur(percent('Scaled'))
  await waitFor(() => expect(onSavePercentages).toHaveBeenCalledWith({ RX: 40, Scaled: 25 }))
})

it('holds a percentage inside nought and a hundred', async () => {
  draw()
  fireEvent.change(percent('RX'), { target: { value: '150' } })
  fireEvent.blur(percent('RX'))
  await waitFor(() => expect(onSavePercentages).toHaveBeenCalledWith({ RX: 100 }))

  fireEvent.change(percent('RX'), { target: { value: '-5' } })
  fireEvent.blur(percent('RX'))
  await waitFor(() => expect(onSavePercentages).toHaveBeenLastCalledWith({ RX: 0 }))
})

// One position per division, however many divisions there are.
it('offers as many positions as there are divisions', () => {
  draw()
  expect(screen.getAllByRole('option', { name: '1' })).toHaveLength(2)
  expect(screen.getAllByRole('option', { name: '2' })).toHaveLength(2)
  expect(screen.queryAllByRole('option', { name: '3' })).toHaveLength(0)
})

// Reported by the page banner, the same as every other write on this screen.
// What matters here is that a refusal does not escape the handler.
it('lets a refused write go to the page without throwing', async () => {
  onSaveOrder.mockRejectedValue(new Error('Settings are read-only'))
  draw()
  fireEvent.change(position('Scaled'), { target: { value: '1' } })
  await waitFor(() => expect(onSaveOrder).toHaveBeenCalled())
  expect(position('Scaled')).toBeInTheDocument()
})

// A pace typed but not changed is not a write.
it('does not save the TV pace when it did not change', () => {
  draw()
  const box = screen.getByRole('spinbutton', { name: 'Seconds per screen' })
  fireEvent.change(box, { target: { value: '10' } })
  fireEvent.blur(box)
  expect(onSaveSecondsPerScreen).not.toHaveBeenCalled()
})

it('caps the TV pace at two minutes and rounds to whole seconds', () => {
  draw()
  const box = screen.getByRole('spinbutton', { name: 'Seconds per screen' })
  fireEvent.change(box, { target: { value: '500' } })
  fireEvent.blur(box)
  expect(onSaveSecondsPerScreen).toHaveBeenLastCalledWith(120)
  fireEvent.change(box, { target: { value: '12.6' } })
  fireEvent.blur(box)
  expect(onSaveSecondsPerScreen).toHaveBeenLastCalledWith(13)
})
