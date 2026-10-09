import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DivisionsSection } from './DivisionsSection'

// v1: the Divisions section of src/app/[slug]/admin/setup/page.tsx. The order
// column is load-bearing — it is the heat running order — so the moves it
// offers are tested here rather than left to the writer they call.

const onAdd = vi.fn()
const onSave = vi.fn()
const onMove = vi.fn()
const onDelete = vi.fn()
const onAddMany = vi.fn()

const RX = { id: 1, name: 'RX', order: 1, teamSize: 1, menCount: null, womenCount: null }
const SCALED = { id: 2, name: 'Scaled', order: 2, teamSize: 1, menCount: null, womenCount: null }
const MASTERS = { id: 3, name: 'Masters', order: 5, teamSize: 1, menCount: null, womenCount: null }

function draw(over: Partial<Parameters<typeof DivisionsSection>[0]> = {}) {
  return render(
    <DivisionsSection
      rows={[RX, SCALED, MASTERS]}
      onAdd={onAdd}
      onSave={onSave}
      onMove={onMove}
      onDelete={onDelete}
      {...over}
    />,
  )
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
/** The editor, which is a sheet beside the list rather than the row itself. */
const sheet = (name: string) => within(screen.getByRole('dialog', { name }))
const openEditor = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: 'Edit' }))
/** The sheet holds one box, so the sheet it is in is the whole address. */
const type = (sheetName: string, value: string) =>
  fireEvent.change(sheet(sheetName).getByRole('textbox'), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  onAdd.mockResolvedValue(undefined)
  onSave.mockResolvedValue(undefined)
  onMove.mockResolvedValue(undefined)
  onDelete.mockResolvedValue(undefined)
  onAddMany.mockResolvedValue(undefined)
})

describe('the list it draws', () => {
  it('says what the order is for', () => {
    draw()
    expect(screen.getByRole('heading', { name: 'Divisions' })).toBeInTheDocument()
    expect(
      screen.getByText('Division order determines the heat running order — lower order runs first.'),
    ).toBeInTheDocument()
  })

  it('says what to do rather than drawing an empty table', () => {
    draw({ rows: [] })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No divisions yet')).toBeInTheDocument()
  })

  // The select holds places in the list, not order values: the third row reads
  // 3 even though its order is 5.
  it('numbers the positions by place in the list', () => {
    draw()
    expect(screen.getByRole('combobox', { name: 'Position of Masters' })).toHaveValue('3')
  })
})

describe('what an entry is', () => {
  it('says what each division\'s entries are', () => {
    draw({ rows: [
      { id: 1, name: 'Women', order: 1, teamSize: 1, menCount: null, womenCount: 1 },
      { id: 2, name: 'Teams', order: 2, teamSize: 4, menCount: 2, womenCount: 2 },
    ] })
    expect(within(row('Women')).getByText('Individual · Female')).toBeInTheDocument()
    expect(within(row('Teams')).getByText('Team of 4 · 2M / 2F')).toBeInTheDocument()
  })

  it('adds a team division with its size and split', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
    const form = sheet('Add division')
    type('Add division', 'Mixed Teams')
    fireEvent.click(form.getByRole('radio', { name: 'Team' }))
    fireEvent.change(form.getByRole('spinbutton', { name: 'Athletes per team' }), { target: { value: '4' } })
    fireEvent.change(form.getByRole('spinbutton', { name: 'Male' }), { target: { value: '2' } })
    fireEvent.change(form.getByRole('spinbutton', { name: 'Female' }), { target: { value: '2' } })
    fireEvent.click(form.getByRole('button', { name: 'Add division' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      name: 'Mixed Teams', order: 6, teamSize: 4, menCount: 2, womenCount: 2,
    }))
  })

  it('adds an individual division for one gender', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
    const form = sheet('Add division')
    type('Add division', 'Rx Women')
    fireEvent.change(form.getByRole('combobox', { name: 'Gender' }), { target: { value: 'female' } })
    fireEvent.click(form.getByRole('button', { name: 'Add division' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      name: 'Rx Women', order: 6, teamSize: 1, menCount: null, womenCount: 1,
    }))
  })

  it('opens an existing team division holding its size', () => {
    draw({ rows: [{ id: 2, name: 'Teams', order: 1, teamSize: 3, menCount: null, womenCount: null }] })
    openEditor('Teams')
    expect(sheet('Teams').getByRole('spinbutton', { name: 'Athletes per team' })).toHaveValue(3)
  })
})

describe('adding a division', () => {
  it('opens on the page asking to add, and not before', () => {
    draw()
    expect(screen.queryByRole('dialog', { name: 'Add division' })).not.toBeInTheDocument()
  })

  // v1 asked for an order value alongside a position select, two controls for
  // one property. A new division runs last and the select moves it from there.
  it('puts a new division after the last one in the running order', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
    type('Add division', '  Teens  ')
    fireEvent.click(sheet('Add division').getByRole('button', { name: 'Add division' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Teens', order: 6, teamSize: 1, menCount: null, womenCount: null }))
  })

  it('starts the running order at 1 when there is nothing to follow', async () => {
    draw({ rows: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
    type('Add division', 'RX')
    fireEvent.click(sheet('Add division').getByRole('button', { name: 'Add division' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'RX', order: 1, teamSize: 1, menCount: null, womenCount: null }))
  })

  it('keeps a nameless division to itself', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
    type('Add division', '   ')
    fireEvent.submit(sheet('Add division').getByRole('textbox').closest('form')!)
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('changing one division', () => {
  it('opens the editor holding the name that division already has', () => {
    draw()
    openEditor('Scaled')
    expect(sheet('Scaled').getByRole('textbox')).toHaveValue('Scaled')
  })

  it('renames a division without moving it', async () => {
    draw()
    openEditor('RX')
    type('RX', ' Elite ')
    fireEvent.click(sheet('RX').getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, { name: 'Elite', order: 1, teamSize: 1, menCount: null, womenCount: null }))
  })

  // Defect 25: v1 cleared the box the moment it sent, so a refused write took
  // the typed name with it.
  it('keeps the typed name when the write is refused', async () => {
    draw()
    onSave.mockRejectedValue(new Error('Division already exists'))
    openEditor('RX')
    type('RX', 'Scaled')
    fireEvent.click(sheet('RX').getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(sheet('RX').getByRole('textbox')).toHaveValue('Scaled')
  })

  it('gives up on the way out without writing anything', () => {
    draw()
    openEditor('RX')
    type('RX', 'Elite')
    fireEvent.click(sheet('RX').getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'RX' })).not.toBeInTheDocument()
  })

  it('asks before deleting, and says the athletes lose their division', async () => {
    draw()
    fireEvent.click(within(row('RX')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete division "RX"? Athletes in this division will be unassigned.')

    fireEvent.click(screen.getByRole('button', { name: 'Delete division' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1))
  })
})

// Defect 23 — a position was traded with whoever held it rather than moved to —
// is fixed in useReorderDivisions. What is this section's is handing over the
// two places, and refusing to write when there is no move in it.
describe('moving one division', () => {
  it('hands over the place it leaves and the place it takes', async () => {
    draw()
    fireEvent.change(screen.getByRole('combobox', { name: 'Position of RX' }), { target: { value: '3' } })
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(0, 2))
  })

  it('counts a move up from the place it is in now', async () => {
    draw()
    fireEvent.change(screen.getByRole('combobox', { name: 'Position of Masters' }), { target: { value: '1' } })
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(2, 0))
  })

  it('does not write when the position picked is the one it already has', () => {
    draw()
    fireEvent.change(screen.getByRole('combobox', { name: 'Position of RX' }), { target: { value: '1' } })
    expect(onMove).not.toHaveBeenCalled()
  })
})

// COM-109. A pasted list goes on the end in the order it was pasted, and a
// division already on the list is not sent again.
describe('importing divisions', () => {
  function importList(value: string) {
    draw({ onAddMany })
    fireEvent.click(screen.getByRole('button', { name: 'Add division' }))
    fireEvent.click(sheet('Add division').getByRole('radio', { name: 'Import many' }))
    fireEvent.change(sheet('Add division').getByRole('textbox', { name: 'Divisions, one per line' }), { target: { value } })
    fireEvent.click(sheet('Add division').getByRole('button', { name: 'Import divisions' }))
  }

  it('adds them after the last division, in pasted order', async () => {
    importList('Teens\nMasters 50+')
    await waitFor(() => expect(onAddMany).toHaveBeenCalledWith([
      { name: 'Teens', order: 6 },
      { name: 'Masters 50+', order: 7 },
    ]))
  })

  it('leaves out a division that already exists, whatever its case', async () => {
    importList('rx\nTeens')
    await waitFor(() => expect(onAddMany).toHaveBeenCalledWith([{ name: 'Teens', order: 6 }]))
  })

  it('is not offered while renaming', () => {
    draw({ onAddMany })
    openEditor('RX')
    expect(sheet('RX').queryByRole('radio', { name: 'Import many' })).not.toBeInTheDocument()
  })
})
