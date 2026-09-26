import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DataPanel } from './DataPanel'

describe('DataPanel', () => {
  it('names its region by its title', () => {
    render(<DataPanel title="Heat Assignments"><p>rows</p></DataPanel>)
    const region = screen.getByRole('region', { name: 'Heat Assignments' })
    expect(within(region).getByRole('heading', { name: 'Heat Assignments' })).toBeTruthy()
  })

  // A panel is a section of a page, never the page — the h1 belongs to the
  // screen and a panel that claimed it would leave two.
  it('heads itself below the page heading', () => {
    render(<DataPanel title="Divisions">x</DataPanel>)
    expect(screen.getByRole('heading', { name: 'Divisions', level: 2 })).toBeTruthy()
  })

  it('draws only its content when it has no head', () => {
    render(<DataPanel><p>rows</p></DataPanel>)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('rows')).toBeTruthy()
  })

  it('keeps its actions inside its own region', () => {
    render(
      <DataPanel title="Athletes" actions={<button>Add athlete</button>}>
        <p>rows</p>
      </DataPanel>,
    )
    const region = screen.getByRole('region', { name: 'Athletes' })
    expect(within(region).getByRole('button', { name: 'Add athlete' })).toBeTruthy()
  })
})
