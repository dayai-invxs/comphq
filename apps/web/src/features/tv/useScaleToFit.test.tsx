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
