import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { WorkoutEquipmentPopover } from './WorkoutEquipmentPopover'

const { apiGet, apiPost, apiDel } = vi.hoisted(() => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiDel: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiGet, apiPost, apiDel }))

// v1: src/components/workout-detail/WorkoutEquipmentPopover.tsx. What is worth
// pinning is the grouping — everyone's kit first, then divisions by name — and
// that both reads happen on open. The clamping and outside-press effects v1
// hand-rolled belong to MDS `Popover` now, so they are its tests, not these.

const EQUIPMENT = [
  { id: 1, item: 'Barbell', divisionId: 7, division: { id: 7, name: 'Scaled' } },
  { id: 2, item: 'Rower', divisionId: null, division: null },
  { id: 3, item: 'Wall ball', divisionId: 5, division: { id: 5, name: 'Rx' } },
]
const DIVISIONS = [{ id: 5, name: 'Rx' }, { id: 7, name: 'Scaled' }]

function answer(equipment: unknown = EQUIPMENT, divisions: unknown = DIVISIONS) {
  apiGet.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/api/divisions') ? divisions : equipment),
  )
}

function trigger() {
  return screen.getByRole('button', { name: /^Equipment/ })
}

async function open() {
  render(<WorkoutEquipmentPopover workoutId="42" slug="rugged-rumble" />)
  fireEvent.click(trigger())
  return await screen.findByRole('dialog', { name: 'Equipment List' })
}

beforeEach(() => {
  vi.clearAllMocks()
  answer()
  apiPost.mockResolvedValue({})
  apiDel.mockResolvedValue({})
})

describe('the trigger', () => {
  it('counts nothing before the list has been opened', () => {
    render(<WorkoutEquipmentPopover workoutId="42" slug="rugged-rumble" />)
    expect(trigger()).toHaveTextContent(/^Equipment$/)
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('shows how many items the workout needs once it has', async () => {
    await open()
    await waitFor(() => expect(trigger()).toHaveTextContent('3'))
  })
})

describe('opening the list', () => {
  it('asks for the workouts equipment and the competitions divisions', async () => {
    await open()
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2))
    expect(apiGet.mock.calls.map((c) => c[0])).toEqual([
      '/api/workouts/42/equipment?slug=rugged-rumble',
      '/api/divisions?slug=rugged-rumble',
    ])
  })

  it('puts the kit everyone needs first, then the divisions by name', async () => {
    const panel = await open()
    await screen.findByText('Barbell')
    const lists = within(panel).getAllByRole('list')
    expect(lists[0]).toHaveAccessibleName('All Divisions')
    expect(lists[1]).toHaveAccessibleName('Rx')
    expect(lists[2]).toHaveAccessibleName('Scaled')
  })

  it('lists an items name and offers to remove it by name', async () => {
    const panel = await open()
    const rx = await within(panel).findByRole('list', { name: 'Rx' })
    expect(within(rx).getByText('Wall ball')).toBeInTheDocument()
    expect(within(rx).getByRole('button', { name: 'Remove Wall ball' })).toBeInTheDocument()
  })

  it('says so when there is nothing on the list', async () => {
    answer([])
    await open()
    expect(await screen.findByText('No equipment added yet.')).toBeInTheDocument()
  })

  // Defect 21, fixed here: v1 swallowed both reads, so a popover that could
  // not reach the API drew the same empty list as a workout needing no kit.
  it('says the list could not be read, rather than calling it empty', async () => {
    apiGet.mockRejectedValue(new HttpError(500, 'boom'))
    await open()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByText('No equipment added yet.')).not.toBeInTheDocument()
  })

  it('draws the list once a later open succeeds', async () => {
    apiGet.mockRejectedValueOnce(new HttpError(500, 'boom'))
      .mockRejectedValueOnce(new HttpError(500, 'boom'))
    const panel = await open()
    await screen.findByRole('alert')
    answer()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(trigger())
    expect(await screen.findByText('Barbell')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('adding an item', () => {
  async function type(value: string) {
    const panel = await open()
    await screen.findByText('Barbell')
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Equipment item' }), {
      target: { value },
    })
    return panel
  }

  it('posts the trimmed item against no division at all', async () => {
    const panel = await type('  Ski erg  ')
    fireEvent.click(within(panel).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      '/api/workouts/42/equipment?slug=rugged-rumble',
      { item: 'Ski erg', divisionId: null },
    ))
  })

  it('posts the division that was picked', async () => {
    const panel = await type('Ski erg')
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Division' }), {
      target: { value: '7' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      expect.any(String),
      { item: 'Ski erg', divisionId: 7 },
    ))
  })

  it('empties the box and reads the list back', async () => {
    const panel = await type('Ski erg')
    fireEvent.click(within(panel).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4))
    expect(within(panel).getByRole('textbox', { name: 'Equipment item' })).toHaveValue('')
  })

  it('will not submit an empty box', async () => {
    const panel = await open()
    expect(within(panel).getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('reports what the server said when the post fails', async () => {
    apiPost.mockRejectedValue(new HttpError(409, 'Item already listed'))
    const panel = await type('Barbell')
    fireEvent.click(within(panel).getByRole('button', { name: 'Add' }))
    expect(await within(panel).findByText('Item already listed')).toBeInTheDocument()
  })

  it('does not draw a division box for a competition that has no divisions', async () => {
    answer(EQUIPMENT, [])
    const panel = await open()
    await screen.findByText('Barbell')
    expect(within(panel).queryByRole('combobox', { name: 'Division' })).not.toBeInTheDocument()
  })
})

// COM-113. A list of kit, one item per line with an optional division. A
// division is matched by name, never created; a blank one takes the default.
describe('importing a list', () => {
  async function paste(text: string) {
    const panel = await open()
    await screen.findByText('Barbell')
    fireEvent.click(within(panel).getByRole('radio', { name: 'Import many' }))
    fireEvent.change(within(panel).getByRole('textbox', { name: /One per line/ }), {
      target: { value: text },
    })
    return panel
  }

  it('posts each line with its own division, a blank one for everyone', async () => {
    const panel = await paste('Item, Division\nSki erg, scaled\nBox, ')
    fireEvent.click(within(panel).getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
    expect(apiPost.mock.calls).toEqual([
      ['/api/workouts/42/equipment?slug=rugged-rumble', { item: 'Ski erg', divisionId: 7 }],
      ['/api/workouts/42/equipment?slug=rugged-rumble', { item: 'Box', divisionId: null }],
    ])
  })

  it('gives a line naming no division the default division', async () => {
    const panel = await paste('Ski erg')
    fireEvent.change(within(panel).getByRole('combobox', { name: /Default division/ }), {
      target: { value: '5' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(
      expect.any(String),
      { item: 'Ski erg', divisionId: 5 },
    ))
  })

  it('empties the box and reads the list back', async () => {
    const panel = await paste('Ski erg')
    fireEvent.click(within(panel).getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4))
    expect(within(panel).getByRole('textbox', { name: /One per line/ })).toHaveValue('')
  })

  it('names a division that does not exist and sends nothing', async () => {
    const panel = await paste('Ski erg, Teens')
    expect(within(panel).getByRole('alert')).toHaveTextContent('No division named Teens')
    expect(within(panel).getByRole('button', { name: 'Import' })).toBeDisabled()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('keeps going past a refused line and names it', async () => {
    apiPost.mockRejectedValueOnce(new HttpError(400, 'Invalid request'))
    const panel = await paste('Ski erg\nBox')
    fireEvent.click(within(panel).getByRole('button', { name: 'Import' }))
    expect(await within(panel).findByText(/Could not add "Ski erg" \(Invalid request\)/)).toBeInTheDocument()
    expect(apiPost).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4))
  })

  it('fills the list from a dropped file', async () => {
    const panel = await open()
    await screen.findByText('Barbell')
    fireEvent.click(within(panel).getByRole('radio', { name: 'Import many' }))
    const file = new File(['Ski erg, Rx'], 'equipment.csv', { type: 'text/csv' })
    const input = panel.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => expect(within(panel).getByRole('textbox', { name: /One per line/ })).toHaveValue('Ski erg, Rx'))
  })
})

describe('removing an item', () => {
  it('deletes it and takes it off the list', async () => {
    const panel = await open()
    fireEvent.click(await within(panel).findByRole('button', { name: 'Remove Rower' }))
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith(
      '/api/workouts/42/equipment/2?slug=rugged-rumble',
    ))
    await waitFor(() => expect(within(panel).queryByText('Rower')).not.toBeInTheDocument())
  })

  // Defect 22, fixed here: v1 never read the response status, so a refused
  // delete still took the row off the list and it was back on the next open.
  it('keeps the item and says why when the server refuses', async () => {
    apiDel.mockRejectedValue(new HttpError(403, 'Forbidden'))
    const panel = await open()
    fireEvent.click(await within(panel).findByRole('button', { name: 'Remove Rower' }))
    expect(await within(panel).findByText('Forbidden')).toBeInTheDocument()
    expect(within(panel).getByText('Rower')).toBeInTheDocument()
  })
})

describe('closing the list', () => {
  it('closes on the panels own close button', async () => {
    const panel = await open()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
