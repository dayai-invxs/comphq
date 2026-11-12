import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpsData } from '@/lib/opsHeats'
import { CorralCall } from './CorralCall'

// Heat 1 starts 09:00 and is called to the corral 5 minutes before, at 08:55;
// heat 2 starts 09:10 and is called at 09:05. A call is up for one minute.

const at = (hhmmss: string) => Date.parse(`2026-08-26T${hhmmss}.000Z`)

const DATA: OpsData = {
  showBib: false,
  workouts: [{
    id: 7, number: 3, name: 'Fran', status: 'active', locationName: null,
    startTime: '2026-08-26T09:00:00.000Z', heatIntervalSecs: 600, timeBetweenHeatsSecs: 0,
    callTimeSecs: 300, walkoutTimeSecs: 120, heatStartOverrides: {},
    heats: [
      { heatNumber: 1, isComplete: false, entries: [] },
      { heatNumber: 2, isComplete: false, entries: [] },
    ],
  }],
}

const HEADLINE_1 = "It's time for Workout 3 Heat 1 to line up!"
const HEADLINE_2 = "It's time for Workout 3 Heat 2 to line up!"

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function tick(ms: number) {
  act(() => { vi.advanceTimersByTime(ms) })
}

describe('the corral call', () => {
  it('stays away before the corral time', () => {
    vi.setSystemTime(at('08:54:59'))
    render(<CorralCall data={DATA} />)
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })

  it('comes up at the corral time with the line-up message', () => {
    vi.setSystemTime(at('08:54:59'))
    render(<CorralCall data={DATA} />)
    tick(1000)
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(HEADLINE_1)
    expect(screen.getByText('Athletes please go to the corral area asap.')).toBeInTheDocument()
  })

  it('goes after 60 seconds on its own', () => {
    vi.setSystemTime(at('08:55:00'))
    render(<CorralCall data={DATA} />)
    tick(59_000)
    expect(screen.getByText(HEADLINE_1)).toBeInTheDocument()
    tick(1000)
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })

  it('is not raised for a heat the corral has already walked out', () => {
    vi.setSystemTime(at('08:55:10'))
    render(<CorralCall data={DATA} checks={{ '7-1': { walkout: true } }} />)
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })

  it('is not raised for a workout that is not running', () => {
    vi.setSystemTime(at('08:55:10'))
    render(<CorralCall data={{ ...DATA, workouts: [{ ...DATA.workouts[0], status: 'draft' }] }} />)
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })
})

describe('closing it on a phone or desktop', () => {
  it('closes with the button and stays closed for that heat', () => {
    vi.setSystemTime(at('08:55:05'))
    render(<CorralCall data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
    tick(5000)
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })

  it('still raises the next heat after one was closed', () => {
    vi.setSystemTime(at('08:55:05'))
    render(<CorralCall data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => { vi.setSystemTime(at('09:04:59')) })
    tick(1000)
    expect(screen.getByText(HEADLINE_2)).toBeInTheDocument()
  })

  it('closes on a click outside the message, but not on one inside it', () => {
    vi.setSystemTime(at('08:55:05'))
    render(<CorralCall data={DATA} />)
    fireEvent.click(screen.getByText(HEADLINE_1))
    expect(screen.getByText(HEADLINE_1)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    vi.setSystemTime(at('08:55:05'))
    render(<CorralCall data={DATA} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText(HEADLINE_1)).not.toBeInTheDocument()
  })
})

describe('on the TV', () => {
  it('shows the call with no way to close it', () => {
    vi.setSystemTime(at('08:55:05'))
    render(<CorralCall data={DATA} tv />)
    expect(screen.getByRole('alert')).toHaveTextContent(HEADLINE_1)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('alert'))
    expect(screen.getByText(HEADLINE_1)).toBeInTheDocument()
  })
})
