import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionConfig } from './actions'
import {
  activationKey,
  DOUBLE_TAP_MS,
  Gestures,
  HOLD_MS,
  pressesAnything,
  pressHandlers,
} from './gestures'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** One element's press, written down as the order the browser raises its events in. */
const recorder = () => {
  const seen: string[] = []
  return {
    seen,
    tap: () => seen.push('tap'),
    hold: () => seen.push('hold'),
    double: () => seen.push('double'),
  }
}

describe('Gestures', () => {
  it('taps on the click itself when the row has neither a hold nor a double tap', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.down(key)
    gestures.cancel(key)
    gestures.click(key, r.tap)
    // No timer to wait for: the tap is synchronous, exactly as the plain click was.
    expect(r.seen).toEqual(['tap'])
  })

  it('holds after 500ms, and swallows the click its release raises', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.down(key, r.hold)
    vi.advanceTimersByTime(HOLD_MS)
    expect(r.seen).toEqual(['hold'])
    gestures.cancel(key)
    gestures.click(key, r.tap)
    expect(r.seen).toEqual(['hold'])
  })

  it('taps when released before the hold is due', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.down(key, r.hold)
    vi.advanceTimersByTime(HOLD_MS - 1)
    gestures.cancel(key)
    gestures.click(key, r.tap)
    vi.advanceTimersByTime(HOLD_MS)
    expect(r.seen).toEqual(['tap'])
  })

  it('does nothing for a pointer that leaves mid-hold, as a scroll does', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.down(key, r.hold)
    gestures.cancel(key)
    vi.advanceTimersByTime(HOLD_MS * 2)
    expect(r.seen).toEqual([])
  })

  it('does not let a long press that raised no click swallow the next tap', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.down(key, r.hold)
    vi.advanceTimersByTime(HOLD_MS)
    // The browser took that one as a context-menu gesture and never clicked.
    gestures.down(key, r.hold)
    gestures.cancel(key)
    gestures.click(key, r.tap)
    expect(r.seen).toEqual(['hold', 'tap'])
  })

  it('turns two clicks inside 250ms into one double tap and no single', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.click(key, r.tap, r.double)
    vi.advanceTimersByTime(DOUBLE_TAP_MS - 1)
    gestures.click(key, r.tap, r.double)
    vi.advanceTimersByTime(DOUBLE_TAP_MS * 2)
    expect(r.seen).toEqual(['double'])
  })

  it('taps once the double-tap window closes with no second click', () => {
    const gestures = new Gestures()
    const key = {}
    const r = recorder()
    gestures.click(key, r.tap, r.double)
    expect(r.seen).toEqual([])
    vi.advanceTimersByTime(DOUBLE_TAP_MS)
    expect(r.seen).toEqual(['tap'])
  })

  it('keeps two elements apart, so a tap on each is two taps', () => {
    const gestures = new Gestures()
    const a = {}
    const b = {}
    const r = recorder()
    gestures.click(a, r.tap, r.double)
    gestures.click(b, r.tap, r.double)
    vi.advanceTimersByTime(DOUBLE_TAP_MS)
    expect(r.seen).toEqual(['tap', 'tap'])
  })
})

describe('pressHandlers', () => {
  const element = {}
  const event = () => ({ currentTarget: element, preventDefault: vi.fn() }) as unknown as Event
  const key = (name: string) =>
    ({ key: name, currentTarget: element, preventDefault: vi.fn() }) as unknown as KeyboardEvent
  const tap: ActionConfig = { action: 'toggle' }
  const hold: ActionConfig = { action: 'navigate', navigation_path: '/h' }
  const double: ActionConfig = { action: 'url', url_path: 'https://d' }

  it('runs the tap on the click, at once, for a row without a double tap', () => {
    const ran: (ActionConfig | undefined)[] = []
    pressHandlers(new Gestures(), { action: tap }, action => ran.push(action)).click(event())
    expect(ran).toEqual([tap])
  })

  it('runs the hold after HOLD_MS and swallows the click its release raises', () => {
    const ran: (ActionConfig | undefined)[] = []
    const press = pressHandlers(new Gestures(), { action: tap, holdAction: hold }, action =>
      ran.push(action),
    )
    press.down(event())
    vi.advanceTimersByTime(HOLD_MS)
    press.cancel(event())
    press.click(event())
    expect(ran).toEqual([hold])
  })

  it('tells a double tap from two taps', () => {
    const ran: (ActionConfig | undefined)[] = []
    const press = pressHandlers(new Gestures(), { action: tap, doubleTapAction: double }, action =>
      ran.push(action),
    )
    press.click(event())
    press.click(event())
    vi.advanceTimersByTime(DOUBLE_TAP_MS)
    expect(ran).toEqual([double])
  })

  it('runs the default (undefined) tap, as more-info', () => {
    const ran: (ActionConfig | undefined)[] = []
    pressHandlers(new Gestures(), {}, action => ran.push(action)).click(event())
    expect(ran).toEqual([undefined])
  })

  it('never runs a `none`', () => {
    const ran: (ActionConfig | undefined)[] = []
    const press = pressHandlers(new Gestures(), { action: { action: 'none' } }, action =>
      ran.push(action),
    )
    press.click(event())
    const enter = key('Enter')
    press.key(enter)
    expect(ran).toEqual([])
    expect(enter.preventDefault).not.toHaveBeenCalled()
  })

  it('taps on Enter and Space, and claims the key', () => {
    const ran: (ActionConfig | undefined)[] = []
    const press = pressHandlers(new Gestures(), { action: tap }, action => ran.push(action))
    const space = key(' ')
    press.key(space)
    press.key(key('a'))
    expect(ran).toEqual([tap])
    expect(space.preventDefault).toHaveBeenCalled()
  })

  it('keeps the context menu only for a row without a hold', () => {
    const menu = event()
    pressHandlers(new Gestures(), { action: tap }, () => {}).menu(menu)
    expect(menu.preventDefault).not.toHaveBeenCalled()
    pressHandlers(new Gestures(), { action: tap, holdAction: hold }, () => {}).menu(menu)
    expect(menu.preventDefault).toHaveBeenCalled()
  })
})

describe('pressesAnything', () => {
  it('is a button when any gesture does something', () => {
    expect(pressesAnything({})).toBe(true)
    expect(pressesAnything({ action: { action: 'none' } })).toBe(false)
    expect(pressesAnything({ action: { action: 'none' }, holdAction: { action: 'toggle' } })).toBe(
      true,
    )
  })
})

describe('activationKey', () => {
  it('runs on Enter and Space only', () => {
    const run = vi.fn()
    const handler = activationKey(run)
    handler({ key: 'Enter', preventDefault: () => {} } as KeyboardEvent)
    handler({ key: 'Tab', preventDefault: () => {} } as KeyboardEvent)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
