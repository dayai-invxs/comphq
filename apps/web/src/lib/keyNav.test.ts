import { describe, it, expect, beforeEach, vi } from 'vitest'
import { keyNav, reveal } from './keyNav'

// Minimal DOM stub sufficient for keyNav's querySelectorAll-based lookup.
// Using jsdom-like shim rather than adding the full environment, which
// would slow every test run for a trivial helper.
type FakeInput = {
  disabled: boolean
  focus: () => void
  select: () => void
  getAttribute: (name: string) => string | null
}

function makeFake(group: string): FakeInput & { focused: boolean; selected: boolean } {
  const rec = {
    disabled: false,
    focused: false,
    selected: false,
    focus() { this.focused = true },
    select() { this.selected = true },
    getAttribute(name: string) { return name === 'data-keynav-group' ? group : null },
  }
  return rec
}

describe('keyNav', () => {
  const nav = keyNav('grp')

  beforeEach(() => {
    vi.resetAllMocks()
  })

  function mountDoc(inputs: FakeInput[]) {
    ;(globalThis as unknown as { document: { querySelectorAll: (sel: string) => FakeInput[] } }).document = {
      querySelectorAll: () => inputs,
    }
  }

  it('moves focus forward on Enter', () => {
    const a = makeFake('grp'), b = makeFake('grp'), c = makeFake('grp')
    mountDoc([a, b, c])
    const ev = {
      key: 'Enter',
      currentTarget: a,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLInputElement>
    nav(ev)
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(b.focused).toBe(true)
    expect(c.focused).toBe(false)
  })

  it('moves focus forward on ArrowDown', () => {
    const a = makeFake('grp'), b = makeFake('grp')
    mountDoc([a, b])
    nav({ key: 'ArrowDown', currentTarget: a, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>)
    expect(b.focused).toBe(true)
  })

  it('moves focus backward on ArrowUp', () => {
    const a = makeFake('grp'), b = makeFake('grp')
    mountDoc([a, b])
    nav({ key: 'ArrowUp', currentTarget: b, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>)
    expect(a.focused).toBe(true)
  })

  it('ignores unrelated keys', () => {
    const a = makeFake('grp'), b = makeFake('grp')
    mountDoc([a, b])
    const ev = { key: 'Tab', currentTarget: a, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>
    nav(ev)
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(b.focused).toBe(false)
  })

  it('noop at the end of the list', () => {
    const a = makeFake('grp'), b = makeFake('grp')
    mountDoc([a, b])
    const ev = { key: 'ArrowDown', currentTarget: b, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>
    nav(ev)
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })

  it('skips disabled inputs', () => {
    const a = makeFake('grp'), b = makeFake('grp'), c = makeFake('grp')
    b.disabled = true
    mountDoc([a, b, c])
    nav({ key: 'Enter', currentTarget: a, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>)
    // Because disabled filtering removes b from the list, a's neighbour is c
    expect(c.focused).toBe(true)
    expect(b.focused).toBe(false)
  })

  // Enter on a phone: the next box was focused under the keyboard and the
  // page never moved to it.
  it('scrolls the box it moves to into view', () => {
    const a = makeFake('grp')
    const b = Object.assign(makeFake('grp'), { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top: 0, bottom: 0 }) })
    mountDoc([a, b])
    nav({ key: 'Enter', currentTarget: a, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLInputElement>)
    expect(b.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })
})

describe('reveal', () => {
  function box(top: number) {
    return { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top, bottom: top + 40 }) } as unknown as HTMLElement
  }

  function keyboardOpen(height: number) {
    const scrollBy = vi.fn()
    vi.stubGlobal('window', { visualViewport: { offsetTop: 0, height }, scrollBy })
    return scrollBy
  }

  it('lifts a box hidden behind the keyboard above it', () => {
    const scrollBy = keyboardOpen(400)
    reveal(box(500))
    // 540 is its bottom; the visible area ends at 400 less the 96 kept clear.
    expect(scrollBy).toHaveBeenCalledWith(0, 540 - 304)
    vi.unstubAllGlobals()
  })

  it('leaves a box that is already in sight where it is', () => {
    const scrollBy = keyboardOpen(400)
    reveal(box(150))
    expect(scrollBy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('brings a box up from under the app bar', () => {
    const scrollBy = keyboardOpen(400)
    reveal(box(10))
    expect(scrollBy).toHaveBeenCalledWith(0, 10 - 96)
    vi.unstubAllGlobals()
  })
})
