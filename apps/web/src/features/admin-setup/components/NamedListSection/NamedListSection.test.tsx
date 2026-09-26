import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NamedListSection } from './NamedListSection'

// v1 wrote the workout-locations and volunteer-roles sections of
// src/app/[slug]/admin/setup/page.tsx twice, identical but for their words.
// This is that section once; the words are props.

const onAdd = vi.fn()
const onSave = vi.fn()
const onDelete = vi.fn()

const COPY = {
  title: 'Workout Locations',
  description: 'Define the venues or areas where workouts take place.',
  columnHeader: 'Location',
  noun: 'location',
  emptyTitle: 'No locations yet',
  emptyDescription: 'A workout can be assigned to one, so the schedule says where to go.',
  placeholder: 'e.g. Main Floor, Turf Field, Parking Lot',
  deleteDescription: (name: string) =>
    `Delete location "${name}"? Workouts assigned to this location will be unassigned.`,
}

function draw(over: Partial<Parameters<typeof NamedListSection>[0]> = {}) {
  return render(
    <NamedListSection
      {...COPY}
      rows={[{ id: 1, name: 'Main Floor' }, { id: 2, name: 'Turf Field' }]}
      onAdd={onAdd}
      onSave={onSave}
      onDelete={onDelete}
      {...over}
    />,
  )
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
/** The editor, which is a sheet beside the list rather than the row itself. */
const sheet = (name: string) => within(screen.getByRole('dialog', { name }))
/** The sheet holds one box, so the sheet it is in is the whole address. */
const type = (sheetName: string, value: string) =>
  fireEvent.change(sheet(sheetName).getByRole('textbox'), { target: { value } })
const openEditor = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: 'Edit' }))

beforeEach(() => {
  vi.clearAllMocks()
  onAdd.mockResolvedValue(undefined)
  onSave.mockResolvedValue(undefined)
  onDelete.mockResolvedValue(undefined)
})

describe('the list it draws', () => {
  it('lists what it was given, under the words it was given', () => {
    draw()
    expect(screen.getByRole('heading', { name: 'Workout Locations' })).toBeInTheDocument()
    expect(screen.getByText('Main Floor')).toBeInTheDocument()
    expect(screen.getByText('Turf Field')).toBeInTheDocument()
  })

  it('says what to do rather than drawing an empty table', () => {
    draw({ rows: [] })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No locations yet')).toBeInTheDocument()
  })

  it('offers the same add from the empty list as from a full one', () => {
    draw({ rows: [] })
    expect(screen.getByRole('button', { name: 'Add location' })).toBeInTheDocument()
  })
})

describe('adding a name', () => {
  it('opens on the page asking to add, and not before', () => {
    draw()
    expect(screen.queryByRole('dialog', { name: 'Add location' })).not.toBeInTheDocument()
  })

  it('adds a trimmed name', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
    type('Add location', '  Parking Lot  ')
    fireEvent.click(sheet('Add location').getByRole('button', { name: 'Add location' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Parking Lot'))
  })

  it('keeps a blank name to itself', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
    type('Add location', '   ')
    fireEvent.submit(sheet('Add location').getByRole('textbox').closest('form')!)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('empties the box and shuts once the name has landed', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
    type('Add location', 'Parking Lot')
    fireEvent.click(sheet('Add location').getByRole('button', { name: 'Add location' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // Defect 25: v1's addLocation cleared the box after `run` whatever `run` had
  // made of the write, so a refused add lost the typed name and left only the
  // banner behind. The name is what the person has to type again.
  it('keeps the typed name, and the sheet, when the write is refused', async () => {
    onAdd.mockRejectedValue(new Error('Database is away'))
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
    type('Add location', 'Parking Lot')
    fireEvent.click(sheet('Add location').getByRole('button', { name: 'Add location' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    expect(sheet('Add location').getByRole('textbox')).toHaveValue('Parking Lot')
  })
})

describe('changing one name', () => {
  it('opens the editor holding the name that row already has', () => {
    draw()
    openEditor('Turf Field')
    expect(sheet('Turf Field').getByRole('textbox')).toHaveValue('Turf Field')
  })

  it('renames a row', async () => {
    draw()
    openEditor('Main Floor')
    type('Main Floor', ' Back Room ')
    fireEvent.click(sheet('Main Floor').getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1, 'Back Room'))
  })

  it('gives up on the way out without writing anything', () => {
    draw()
    openEditor('Main Floor')
    type('Main Floor', 'Back Room')
    fireEvent.click(sheet('Main Floor').getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Main Floor' })).not.toBeInTheDocument()
  })

  it('asks before deleting, and says what the deletion costs', async () => {
    draw()
    fireEvent.click(within(row('Main Floor')).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'Delete location "Main Floor"? Workouts assigned to this location will be unassigned.',
    )
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes the row the question was asked about', async () => {
    draw()
    fireEvent.click(within(row('Turf Field')).getByRole('button', { name: 'Delete' }))
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Delete location' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(2))
  })
})

// COM-110. Import many is offered when the caller can take a list, and hands
// on only the names not already on it.
describe('importing many', () => {
  const onAddMany = vi.fn()
  beforeEach(() => { onAddMany.mockResolvedValue(undefined) })

  function importList(list: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
    fireEvent.click(sheet('Add location').getByRole('radio', { name: 'Import many' }))
    type('Add location', list)
    fireEvent.click(sheet('Add location').getByRole('button', { name: 'Import locations' }))
  }

  it('hands on the new names, skipping ones already listed', async () => {
    draw({ onAddMany })
    importList('Parking Lot\nmain floor\nGym')
    await waitFor(() => expect(onAddMany).toHaveBeenCalledWith(['Parking Lot', 'Gym']))
  })

  it('is not offered without a list writer', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }))
    expect(sheet('Add location').queryByRole('radio', { name: 'Import many' })).toBeNull()
  })

  it('is not offered while renaming', () => {
    draw({ onAddMany })
    openEditor('Main Floor')
    expect(sheet('Main Floor').queryByRole('radio', { name: 'Import many' })).toBeNull()
  })
})
