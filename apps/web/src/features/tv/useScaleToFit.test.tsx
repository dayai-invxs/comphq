import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useScaleToFit } from './useScaleToFit'

// v1: the useLayoutEffect at src/app/[slug]/TV/page.tsx:71. A scoreboard has
// exactly one screen and no scrollbar, so anything taller than the screen is
// shrunk until it fits.

function Probe({ tick }: { tick: number }) {
  const { containerRef, contentRef } = useScaleToFit([tick])
  return (
    <div ref={containerRef} data-testid="container">
      <div ref={contentRef} data-testid="content">{tick}</div>
    </div>
  )
}

// jsdom lays nothing out, so the two measurements the hook reads are the two
// values a test has to supply.
function measure(available: number, natural: number) {
  Object.defineProperty(screen.getByTestId('container'), 'clientHeight', { value: available, configurable: true })
  Object.defineProperty(screen.getByTestId('content'), 'scrollHeight', { value: natural, configurable: true })
}

const content = () => screen.getByTestId('content')

it('leaves content that already fits alone', () => {
  const { rerender } = render(<Probe tick={0} />)
  measure(1080, 800)
  rerender(<Probe tick={1} />)
  expect(content().style.transform).toBe('')
})

it('shrinks content taller than the screen by the ratio it overflows by', () => {
  const { rerender } = render(<Probe tick={0} />)
  measure(1000, 2000)
  rerender(<Probe tick={1} />)
  expect(content().style.transform).toBe('scale(0.5)')
})

// Scaling from the centre would pull the content off two edges; from the top
// left it only shortens, and the width is given back what the scale took.
// 1000/1300 is the case that shows why the width is rounded: 100 / (1000/1300)
// is 130.00000000000003 in binary floating point, and a stylesheet carrying
// that is a stylesheet nobody can read.
it('scales from the top left and widens to stay flush', () => {
  const { rerender } = render(<Probe tick={0} />)
  measure(1000, 1300)
  rerender(<Probe tick={1} />)
  expect(content().style.transformOrigin).toBe('top left')
  expect(content().style.width).toBe('130%')
})

// The measurement is of the previous scale unless it is undone first, so a
// screen that shrank once would shrink again on every redraw.
it('measures at natural size, so a scale is not applied on top of a scale', () => {
  const { rerender } = render(<Probe tick={0} />)
  measure(1000, 2000)
  rerender(<Probe tick={1} />)
  expect(content().style.transform).toBe('scale(0.5)')

  measure(1000, 1000)
  rerender(<Probe tick={2} />)
  expect(content().style.transform).toBe('')
  expect(content().style.width).toBe('')
})

// The schedule has other arrangements to try before it shrinks anything: fewer,
// wider heats with lanes in columns. The probe's height depends on which one
// it is drawing, the way the real board's does.
function Arranged({ tick, heights }: { tick: number; heights: number[] }) {
  const { containerRef, contentRef, layout } = useScaleToFit([tick], heights.length)
  return (
    <div ref={containerRef} data-testid="container">
      <div ref={contentRef} data-testid="content" data-layout={layout} data-heights={heights.join(',')}>
        {tick}
      </div>
    </div>
  )
}

function arranged(available: number, heights: number[]) {
  const first = render(<Arranged tick={0} heights={heights} />)
  Object.defineProperty(screen.getByTestId('container'), 'clientHeight', { value: available, configurable: true })
  Object.defineProperty(screen.getByTestId('content'), 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.heights!.split(',').map(Number)[Number(this.dataset.layout)]
    },
  })
  return first
}

const drawnLayout = () => Number(content().dataset.layout)

it('keeps the first arrangement that fits at full size', () => {
  const { rerender } = arranged(1000, [2000, 1500, 900, 600])
  rerender(<Arranged tick={1} heights={[2000, 1500, 900, 600]} />)
  expect(drawnLayout()).toBe(2)
  expect(content().style.transform).toBe('')
})

it('goes back to the arrangement that shrinks least when none fits', () => {
  const { rerender } = arranged(1000, [2000, 1250, 1600])
  rerender(<Arranged tick={1} heights={[2000, 1250, 1600]} />)
  expect(drawnLayout()).toBe(1)
  expect(content().style.transform).toBe('scale(0.8)')
})

// A heat walking out can shorten the queue, so every redraw searches again from
// the arrangement the board prefers rather than staying where the last one
// ended up.
it('starts again from the preferred arrangement on every redraw', () => {
  const { rerender } = arranged(1000, [2000, 1500, 900])
  rerender(<Arranged tick={1} heights={[2000, 1500, 900]} />)
  expect(drawnLayout()).toBe(2)

  rerender(<Arranged tick={2} heights={[800, 700, 600]} />)
  expect(drawnLayout()).toBe(0)
  expect(content().style.transform).toBe('')
})

// What reaches into the container's bottom padding is clipped, so the padding
// is not room the content has.
it('does not count the container padding as room', () => {
  const { rerender } = render(<Probe tick={0} />)
  screen.getByTestId('container').style.padding = '50px'
  measure(1000, 950)
  rerender(<Probe tick={1} />)
  expect(content().style.transform).toBe(`scale(${900 / 950})`)
})

// A panel spanning more of a grid's tracks than the screen has runs off the
// side, which no amount of shrinking puts back, so that arrangement is passed
// over even though it is short enough.
it('passes over an arrangement that runs off the side of the screen', () => {
  const { rerender } = arranged(1000, [2000, 900, 950])
  const box = content()
  Object.defineProperty(box, 'clientWidth', { value: 1000, configurable: true })
  Object.defineProperty(box, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.layout === '1' ? 1400 : 1000 },
  })
  rerender(<Arranged tick={1} heights={[2000, 900, 950]} />)
  expect(drawnLayout()).toBe(2)
  expect(content().style.transform).toBe('')
})
