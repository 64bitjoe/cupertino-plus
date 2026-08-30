import { afterEach, describe, expect, it, vi } from 'vitest'

import { isPressable, runAction, type ActionConfig } from './actions'
import type { HomeAssistant } from './types/ha'

interface ServiceCall {
  domain: string
  service: string
  data?: Record<string, unknown>
  target?: Record<string, unknown>
}

const stubHass = (calls: ServiceCall[]): HomeAssistant =>
  ({
    callService: (
      domain: string,
      service: string,
      data?: Record<string, unknown>,
      target?: Record<string, unknown>,
    ) => {
      calls.push({ domain, service, ...(data ? { data } : {}), ...(target ? { target } : {}) })
      return Promise.resolve()
    },
  }) as unknown as HomeAssistant

/** A stand-in for the card element: Node 22 has EventTarget, so no DOM is needed. */
const stubElement = (seen: CustomEvent[]): EventTarget => {
  const target = new EventTarget()
  target.addEventListener('hass-more-info', event => seen.push(event as CustomEvent))
  return target
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('runAction', () => {
  it('opens more-info by default, and for an absent config', () => {
    const seen: CustomEvent[] = []
    runAction(stubHass([]), stubElement(seen), undefined, 'sensor.hall')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.detail).toEqual({ entityId: 'sensor.hall' })
  })

  it('toggles through homeassistant.toggle', () => {
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement([]), { action: 'toggle' }, 'light.hall')
    expect(calls).toEqual([
      { domain: 'homeassistant', service: 'toggle', target: { entity_id: 'light.hall' } },
    ])
  })

  it('splits a dotted service and passes data and target through', () => {
    const calls: ServiceCall[] = []
    const config: ActionConfig = {
      action: 'call-service',
      service: 'script.goodnight',
      data: { speed: 'slow' },
      target: { area_id: 'bedroom' },
    }
    runAction(stubHass(calls), stubElement([]), config, 'sensor.hall')
    expect(calls).toEqual([
      {
        domain: 'script',
        service: 'goodnight',
        data: { speed: 'slow' },
        target: { area_id: 'bedroom' },
      },
    ])
  })

  it('calls a service with no target when the config names none', () => {
    const calls: ServiceCall[] = []
    const config: ActionConfig = {
      action: 'call-service',
      service: 'script.goodnight',
      data: { speed: 'slow' },
    }
    runAction(stubHass(calls), stubElement([]), config, 'sensor.hall')
    expect(calls).toEqual([
      {
        domain: 'script',
        service: 'goodnight',
        data: { speed: 'slow' },
      },
    ])
  })

  it('warns rather than throwing when call-service has no usable service', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement([]), { action: 'call-service' }, 'sensor.hall')
    runAction(
      stubHass(calls),
      stubElement([]),
      { action: 'call-service', service: 'nodots' },
      'sensor.hall',
    )
    expect(calls).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('navigates through the router window', () => {
    const pushed: string[] = []
    const fired: string[] = []
    const fakeWindow = {
      name: 'ha-main-window',
      history: { pushState: (_s: unknown, _t: string, path: string) => pushed.push(path) },
      dispatchEvent: (event: Event) => {
        fired.push(event.type)
        return true
      },
    }
    vi.stubGlobal('window', fakeWindow)
    vi.stubGlobal('parent', fakeWindow)
    vi.stubGlobal('top', fakeWindow)

    runAction(
      stubHass([]),
      stubElement([]),
      { action: 'navigate', navigation_path: '/lovelace/1' },
      'sensor.hall',
    )
    expect(pushed).toEqual(['/lovelace/1'])
    expect(fired).toEqual(['location-changed'])
  })

  it('warns rather than navigating nowhere when the path is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runAction(stubHass([]), stubElement([]), { action: 'navigate' }, 'sensor.hall')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all for none', () => {
    const seen: CustomEvent[] = []
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement(seen), { action: 'none' }, 'sensor.hall')
    expect(seen).toEqual([])
    expect(calls).toEqual([])
  })

  /** A chip with no entity and no `tap_action.entity` override — a spacer, or one built
   *  entirely from templates — has nothing a toggle or a more-info dialog can target. */
  it('warns rather than toggling nothing when there is no entity at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls: ServiceCall[] = []
    runAction(stubHass(calls), stubElement([]), { action: 'toggle' }, undefined)
    expect(calls).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns rather than opening more-info for nothing when there is no entity at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen: CustomEvent[] = []
    runAction(stubHass([]), stubElement(seen), undefined, undefined)
    expect(seen).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('still toggles when an explicit tap_action.entity supplies the target', () => {
    const calls: ServiceCall[] = []
    runAction(
      stubHass(calls),
      stubElement([]),
      { action: 'toggle', entity: 'light.hall' },
      undefined,
    )
    expect(calls).toEqual([
      { domain: 'homeassistant', service: 'toggle', target: { entity_id: 'light.hall' } },
    ])
  })

  it('lets a config name a different entity than the one pressed', () => {
    const seen: CustomEvent[] = []
    runAction(
      stubHass([]),
      stubElement(seen),
      { action: 'more-info', entity: 'sensor.other' },
      'sensor.hall',
    )
    expect(seen[0]?.detail).toEqual({ entityId: 'sensor.other' })
  })
})

describe('isPressable', () => {
  it('is true for everything except none', () => {
    expect(isPressable(undefined)).toBe(true)
    expect(isPressable({ action: 'toggle' })).toBe(true)
    expect(isPressable({ action: 'none' })).toBe(false)
  })
})
