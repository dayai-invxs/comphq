import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ImportResult } from '@/api/imports'
import { CsvImportPanel } from './CsvImportPanel'

type Import = {
  mutate: ReturnType<typeof vi.fn>
  isPending: boolean
  data?: ImportResult
  error?: Error | null
}

const NOTHING: ImportResult = { imported: 0, workoutsAffected: [], errors: [] }

function panel(over: Partial<Import> = {}) {
  const run = { mutate: vi.fn(), isPending: false, data: undefined, error: null, ...over } as never
  render(
    <CsvImportPanel
      title="Import Heat Assignments"
      columns="workout_number, heat_number, lane_number, athlete_name"
      note="Overwrites existing assignments for any workout included in the file."
      placeholder={'workout_number,heat_number,lane_number,athlete_name\n1,1,1,Jane Smith'}
      run={run}
    />,
  )
  return run as unknown as Import
}

const paste = (csv: string) =>
  fireEvent.change(screen.getByLabelText('CSV'), { target: { value: csv } })

describe('the panel', () => {
  it('names what it imports and which columns it wants', () => {
    panel()
    expect(screen.getByRole('heading', { name: 'Import Heat Assignments' })).toBeInTheDocument()
    expect(
      screen.getByText('workout_number, heat_number, lane_number, athlete_name'),
    ).toBeInTheDocument()
  })

  // The page draws this panel twice, and the two differ only by their title —
  // so the title has to name the region, or neither can be reached on its own.
  it('names its region by its title', () => {
    panel()
    expect(screen.getByRole('region', { name: 'Import Heat Assignments' })).toBeInTheDocument()
  })

  // What an import overwrites is the one thing worth knowing before pressing
  // Import, so it is said above the box rather than after the fact.
  it('says what importing will overwrite, before it is pressed', () => {
    panel()
    expect(
      screen.getByText('Overwrites existing assignments for any workout included in the file.'),
    ).toBeInTheDocument()
  })

  // v1 disabled Import until there was something to send, and a file of
  // whitespace counts as nothing.
  it('will not import an empty box', () => {
    panel()
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
    paste('   ')
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })

  it('sends what was pasted', () => {
    const run = panel()
    paste('a,b\n1,2')
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(run.mutate).toHaveBeenCalledWith('a,b\n1,2')
  })

  // v1's hidden file input behind a Choose File button is FileDrop here. What
  // it hands over still has to land in the same box the placeholder documents.
  it('fills the box from a chosen file', async () => {
    panel()
    const file = new File(['workout_number,heat_number'], 'heats.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    expect(await screen.findByDisplayValue('workout_number,heat_number')).toBeInTheDocument()
  })

  // v1 showed Clear only once there was text, and clearing dropped the last
  // result with it.
  it('offers Clear only when there is something to clear', () => {
    panel()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    paste('a,b')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('CSV')).toHaveValue('')
  })
})

describe('what came back', () => {
  it('counts what landed and names the workouts it touched', () => {
    panel({ data: { imported: 3, workoutsAffected: [1, 2], errors: [] } })
    expect(
      screen.getByText('Imported 3 assignments across workouts #1, #2.'),
    ).toBeInTheDocument()
  })

  // v1 built this sentence with three separate plural checks, and one row
  // across one workout reads singular in all of them.
  it('reads singular for one row in one workout', () => {
    panel({ data: { imported: 1, workoutsAffected: [4], errors: [] } })
    expect(screen.getByText('Imported 1 assignment across workout #4.')).toBeInTheDocument()
  })

  it('lists every refused line with its number', () => {
    panel({
      data: {
        imported: 0,
        workoutsAffected: [],
        errors: [
          { line: 2, message: 'Unknown athlete' },
          { line: 5, message: 'Lane 9 does not exist' },
        ],
      },
    })
    expect(screen.getByText('2 errors:')).toBeInTheDocument()
    expect(screen.getByText('Unknown athlete')).toBeInTheDocument()
    expect(screen.getByText('Lane 9 does not exist')).toBeInTheDocument()
  })

  it('says so when a file parsed but changed nothing', () => {
    panel({ data: NOTHING })
    expect(screen.getByText('Nothing was imported.')).toBeInTheDocument()
  })

  // The heats route answers 200 with warnings beside the tally. v1 typed them
  // and then never drew them; the panel shows them, since a warning nobody
  // reads is a warning nobody acts on (see the header).
  it('shows warnings the route sent back', () => {
    panel({
      data: { imported: 2, workoutsAffected: [1], errors: [], warnings: [{ message: 'Heat 3 is over capacity' }] },
    })
    expect(screen.getByText('Heat 3 is over capacity')).toBeInTheDocument()
  })

  // v1's heats import never handled a refusal — the button stuck at
  // "Importing…" forever (defect 21). Here the refusal is shown.
  it('reports a refusal instead of hanging', () => {
    panel({ error: new Error('Empty CSV') })
    expect(screen.getByRole('alert')).toHaveTextContent('Empty CSV')
  })

  it('says it is working while the request is out', () => {
    panel({ isPending: true })
    expect(screen.getByRole('button', { name: 'Importing…' })).toBeInTheDocument()
  })
})
