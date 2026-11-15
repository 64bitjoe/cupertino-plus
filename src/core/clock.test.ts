import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLOCK_CAP_MS, CLOCK_SLACK_MS, ClockController, clockDelay } from './clock'

/** Just enough of a document: its `hidden` flag and the one listener the clock adds. */
const fakeDocument = () => {
  const listeners = new Set<() => void>()
  return {
    hidden: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    fire: () => listeners.forEach(listener => listener()),
    listeners,
  }
}

const fakeHost = () => {
  const host = {
    isConnected: true,
    updates: 0,
    controllers: [] as ClockController[],
    addController(controller: ClockController) {
      host.controllers.push(controller)
    },
    requestUpdate() {
      host.updates += 1
    },
  }
  return host
}

let doc: ReturnType<typeof fakeDocument>

beforeEach(() => {
  vi.useFakeTimers()
  doc = fakeDocument()
  vi.stubGlobal('document', doc)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const clockFor = (nextIn: () => number | undefined) => {
  const host = fakeHost()
  const clock = new ClockController(host as never, nextIn)
  return { host, clock }
}

describe('clockDelay', () => {
  it('adds the slack and caps at a minute', () => {
    expect(clockDelay(1000)).toBe(1000 + CLOCK_SLACK_MS)
    expect(clockDelay(10 * 60_000)).toBe(CLOCK_CAP_MS)
  })
})

describe('ClockController', () => {
  it('registers itself with its host', () => {
    const { host, clock } = clockFor(() => undefined)
    expect(host.controllers).toEqual([clock])
  })

  it('wakes the host once, just past the next change', () => {
    const { host, clock } = clockFor(() => 1000)
    clock.hostConnected()
    clock.hostUpdated()
    vi.advanceTimersByTime(1000 + CLOCK_SLACK_MS - 1)
    expect(host.updates).toBe(0)
    vi.advanceTimersByTime(1)
    expect(host.updates).toBe(1)
  })

  it('sets no timer when nothing moves with the clock', () => {
    const { host, clock } = clockFor(() => undefined)
    clock.hostUpdated()
    vi.advanceTimersByTime(CLOCK_CAP_MS * 2)
    expect(host.updates).toBe(0)
  })

  it('sleeps in a background tab and redraws at once on the way back', () => {
    const { host, clock } = clockFor(() => 1000)
    clock.hostConnected()
    clock.hostUpdated()
    doc.hidden = true
    doc.fire()
    vi.advanceTimersByTime(5000)
    expect(host.updates).toBe(0)
    doc.hidden = false
    doc.fire()
    expect(host.updates).toBe(1)
  })

  it('does not arm while the tab is hidden', () => {
    const { host, clock } = clockFor(() => 1000)
    doc.hidden = true
    clock.hostUpdated()
    vi.advanceTimersByTime(5000)
    expect(host.updates).toBe(0)
  })

  it('stops and lets go of the page on disconnect', () => {
    const { host, clock } = clockFor(() => 1000)
    clock.hostConnected()
    clock.hostUpdated()
    clock.hostDisconnected()
    vi.advanceTimersByTime(5000)
    expect(host.updates).toBe(0)
    expect(doc.listeners.size).toBe(0)
  })
})
