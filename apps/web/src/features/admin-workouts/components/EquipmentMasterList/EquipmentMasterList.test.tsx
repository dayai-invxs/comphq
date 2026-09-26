import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EquipmentSummaryItem } from '@/api/equipmentSummary'
import { EquipmentMasterList } from './EquipmentMasterList'

const BARBELL: EquipmentSummaryItem = {
  item: 'Barbell',
  maxCount: 8,
  breakdown: [
    { workoutId: 2, workoutNumber: 2, workoutName: 'Grace', divisionNames: ['RX', 'Scaled'], maxCount: 8 },
    { workoutId: 1, workoutNumber: 1, workoutName: 'Fran', divisionNames: [null], maxCount: 5 },
  ],
}

function list(over: { items?: EquipmentSummaryItem[]; loading?: boolean; onLoad?: () => void } = {}) {
  const onLoad = over.onLoad ?? vi.fn()
  render(
    <EquipmentMasterList
      items={over.items}
      loading={over.loading ?? false}
      onLoad={onLoad}
    />,
  )
  return onLoad
}

describe('before it is asked for', () => {
  // v1 put this behind a button because the walk across every workout's
  // equipment is not what the screen is for.
  it('shows nothing until Load is pressed', () => {
    const onLoad = list()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(onLoad).toHaveBeenCalled()
  })

  // Un-loaded is not empty, and v1 drew neither — the panel sat blank under
  // its own heading with no way to tell the two apart.
  it('says why it is blank rather than sitting blank', () => {
    list()
    expect(screen.getByText('Not counted yet')).toBeInTheDocument()
    expect(
      screen.getByText('Reading it walks every workout, so it is asked for rather than read on the way in.'),
    ).toBeInTheDocument()
  })

  it('names its region, so the page it shares can be read a section at a time', () => {
    list()
    expect(screen.getByRole('region', { name: 'Equipment Master List' })).toBeInTheDocument()
  })

  it('says it is working while the walk is out', () => {
    list({ loading: true })
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
  })

  // Once there is a list, the same button re-walks it.
  it('offers Refresh once there is a list', () => {
    list({ items: [] })
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})

describe('the list', () => {
  it('gives the count the competition has to own', () => {
    list({ items: [BARBELL] })
    expect(screen.getByText('Barbell')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  // v1 sorted the breakdown by workout number in the render, and the route
  // does not promise an order.
  it('breaks the count down by workout, in workout order', () => {
    list({ items: [BARBELL] })
    const wods = screen.getAllByText(/^WOD \d$/).map((n) => n.textContent)
    expect(wods).toEqual(['WOD 1', 'WOD 2'])
  })

  // A breakdown row with no division at all applies to everyone; that is the
  // rule the count itself is built on.
  it('names the divisions a row is scoped to, or says all of them', () => {
    list({ items: [BARBELL] })
    expect(screen.getByText('All divisions')).toBeInTheDocument()
    expect(screen.getByText('RX, Scaled')).toBeInTheDocument()
  })

  it('says so when no workout lists any equipment', () => {
    list({ items: [] })
    expect(screen.getByText('No equipment listed on any workout.')).toBeInTheDocument()
  })
})
