import { describe, it, expect, beforeEach, vi } from 'vitest'
import { keyNav } from './keyNav'

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
})
