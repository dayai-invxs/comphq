import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NameSheet } from './NameSheet'

// The one-field editor the setup screen opens for a division, a location and a
// role alike. Defect 25 — a refused write losing the typed name — is fixed here
// once rather than at those three call sites, so it is proved here once.

const onSubmit = vi.fn()
const onClose = vi.fn()

function draw(over: Partial<Parameters<typeof NameSheet>[0]> = {}) {
  return render(
    <NameSheet
      open
      title="Add location"
      fieldLabel="Location"
      placeholder="e.g. Main Floor"
      initial=""
      submitLabel="Add location"
      onClose={onClose}
      onSubmit={onSubmit}
      {...over}
    />,
  )
}

const box = () => screen.getByRole('textbox', { name: /Location/ })
const submit = () => screen.getByRole('button', { name: 'Add location' })
const type = (value: string) => fireEvent.change(box(), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  onSubmit.mockResolvedValue(undefined)
})

describe('what it draws', () => {
  it('stays out of the way until it is opened', () => {
    draw({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is named by what it is doing, and its field by what it holds', () => {
    draw()
    expect(screen.getByRole('dialog', { name: 'Add location' })).toBeInTheDocument()
    expect(box()).toHaveAttribute('placeholder', 'e.g. Main Floor')
  })

  it('opens holding the name it was given', () => {
    draw({ title: 'Turf Field', initial: 'Turf Field', submitLabel: 'Save' })
    expect(box()).toHaveValue('Turf Field')
  })

  // It is one sheet reused by every row, so it has to follow the row that was
  // tapped rather than keep the name the last one left in it.
  it('follows the row it is reopened on', () => {
    const { rerender } = draw({ open: false, initial: 'Main Floor', submitLabel: 'Save' })
    rerender(
      <NameSheet
        open
        title="Turf Field"
        fieldLabel="Location"
        placeholder="e.g. Main Floor"
        initial="Turf Field"
        submitLabel="Save"
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    )
    expect(box()).toHaveValue('Turf Field')
  })

  it('has nothing to submit until a name is typed', () => {
    draw()
    expect(submit()).toBeDisabled()
    type('Parking Lot')
    expect(submit()).toBeEnabled()
  })

  it('says it is working while the write is out', () => {
    draw({ initial: 'Parking Lot', busy: true })
    expect(submit()).toHaveAttribute('aria-busy', 'true')
  })
})

describe('sending the name', () => {
  it('sends it trimmed', async () => {
    draw()
    type('  Parking Lot  ')
    fireEvent.click(submit())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Parking Lot'))
  })

  it('keeps a blank name to itself', () => {
    draw()
    type('   ')
    fireEvent.submit(box().closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('empties the box and shuts once the name has landed', async () => {
    draw()
    type('Parking Lot')
    fireEvent.click(submit())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(box()).toHaveValue('')
  })

  // Defect 25: v1 cleared the box after the write whatever the write had made
  // of it, so a refusal left the person to remember what they had typed.
  it('keeps the typed name, and stays open, when the write is refused', async () => {
    onSubmit.mockRejectedValue(new Error('Location already exists'))
    draw()
    type('Parking Lot')
    fireEvent.click(submit())
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(box()).toHaveValue('Parking Lot')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves without writing when it is closed', () => {
    draw()
    type('Parking Lot')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  // Three of these are on the setup screen at once, and the footer button
  // submits a form it does not contain — so the form each one points at has to
  // be its own.
  it('gives its form a name of its own, so three on a page do not collide', () => {
    const { container } = draw()
    const form = container.ownerDocument.querySelector('form')!
    expect(form.id).toBe('name-sheet-location')
    expect(submit()).toHaveAttribute('form', 'name-sheet-location')
  })
})

// COM-109 / COM-110. Given onSubmitMany, adding offers a pasted or dropped
// list as well as one name. Editing never does: a rename is one name.
describe('importing many', () => {
  const onSubmitMany = vi.fn()
  const importMany = () => fireEvent.click(screen.getByRole('radio', { name: 'Import many' }))
  const list = () => screen.getByRole('textbox', { name: 'Locations, one per line' })
  const importButton = () => screen.getByRole('button', { name: 'Import locations' })

  beforeEach(() => { onSubmitMany.mockResolvedValue(undefined) })

  it('is not offered without onSubmitMany', () => {
    draw()
    expect(screen.queryByRole('radio', { name: 'Import many' })).not.toBeInTheDocument()
  })

  it('sends the listed names, header and repeats dropped', async () => {
    draw({ onSubmitMany, plural: 'locations' })
    importMany()
    fireEvent.change(list(), { target: { value: 'Location\nMain Floor\nTurf\nmain floor' } })
    fireEvent.click(importButton())
    await waitFor(() => expect(onSubmitMany).toHaveBeenCalledWith(['Main Floor', 'Turf']))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('has nothing to import until a name is listed', () => {
    draw({ onSubmitMany, plural: 'locations' })
    importMany()
    expect(importButton()).toBeDisabled()
  })

  it('fills the list from a dropped file', async () => {
    draw({ onSubmitMany, plural: 'locations' })
    importMany()
    const file = new File(['Main Floor\nTurf'], 'locations.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => expect(list()).toHaveValue('Main Floor\nTurf'))
  })

  it('keeps the list, and stays open, when the import is refused', async () => {
    onSubmitMany.mockRejectedValue(new Error('nope'))
    draw({ onSubmitMany, plural: 'locations' })
    importMany()
    fireEvent.change(list(), { target: { value: 'Turf' } })
    fireEvent.click(importButton())
    await waitFor(() => expect(onSubmitMany).toHaveBeenCalled())
    expect(list()).toHaveValue('Turf')
    expect(onClose).not.toHaveBeenCalled()
  })
})
