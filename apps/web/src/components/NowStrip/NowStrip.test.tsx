import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { NowStrip } from './NowStrip'
import type { PendingHeat } from '@/lib/nowHeat'

const startMs = Date.parse('2026-08-27T15:00:00.000Z')

const now: PendingHeat = {
  workout: {
    id: 1,
    number: 3,
    name: 'Helen',
    status: 'active',
    locationName: 'Main floor',
    startTime: '2026-08-27T15:00:00.000Z',
    heatIntervalSecs: 600,
    timeBetweenHeatsSecs: 0,
    callTimeSecs: 600,
    walkoutTimeSecs: 120,
    heatStartOverrides: {},
    heats: [],
  },
  heat: { heatNumber: 3, isComplete: false, entries: [] },
  startMs,
  corralMs: startMs - 600_000,
  walkoutMs: startMs - 120_000,
  divisions: ['Rx', 'Scaled'],
}

describe('NowStrip', () => {
  it('names the heat on the floor', () => {
    render(<NowStrip now={now} />)
    const strip = screen.getByRole('region', { name: 'Now: workout 3, heat 3' })
    expect(within(strip).getByText('Heat 3')).toBeTruthy()
    expect(within(strip).getByText('Workout 3 · Helen')).toBeTruthy()
    expect(within(strip).getByText('Main floor')).toBeTruthy()
    expect(within(strip).getByText('Rx / Scaled')).toBeTruthy()
  })

  it('says it is live', () => {
    render(<NowStrip now={now} />)
    expect(screen.getByRole('status').textContent).toBe('Now')
  })

  // Three clocks in the order the heat runs them, each labelled — a bare time
  // says nothing about which of the three it is.
  it('labels all three clocks', () => {
    render(<NowStrip now={now} />)
    expect(screen.getByText('Corral')).toBeTruthy()
    expect(screen.getByText('Walk out')).toBeTruthy()
    expect(screen.getByText('Start')).toBeTruthy()
  })

  it('draws no clocks for a heat with no start time', () => {
    render(<NowStrip now={{ ...now, startMs: null, corralMs: null, walkoutMs: null }} />)
    expect(screen.queryByText('Start')).toBeNull()
    expect(screen.getByText('Heat 3')).toBeTruthy()
  })

  it('carries whatever the screen hangs under it', () => {
    render(<NowStrip now={now}><p>Lane 1 — Alice Adams</p></NowStrip>)
    expect(screen.getByText('Lane 1 — Alice Adams')).toBeTruthy()
  })
})
