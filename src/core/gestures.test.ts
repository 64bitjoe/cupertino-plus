import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DOUBLE_TAP_MS, Gestures, HOLD_MS } from './gestures'

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
