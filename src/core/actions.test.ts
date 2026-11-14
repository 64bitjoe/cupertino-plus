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

describe('runAction, the newer actions', () => {
  /** Records every event a press raises, by type, with its detail. */
  const recording = () => {
    const seen: { type: string; detail: unknown }[] = []
    const target = new EventTarget()
    for (const type of ['hass-action', 'hass-more-info', 'haptic']) {
      target.addEventListener(type, event =>
        seen.push({ type, detail: (event as CustomEvent).detail }),
      )
    }
    return { seen, target }
  }

  it("calls a perform-action under Home Assistant's newer names", () => {
    const calls: ServiceCall[] = []
    const config: ActionConfig = {
      action: 'perform-action',
      perform_action: 'light.turn_on',
      data: { brightness_pct: 40 },
    }
    runAction(stubHass(calls), stubElement([]), config, 'light.hall')
    expect(calls).toEqual([{ domain: 'light', service: 'turn_on', data: { brightness_pct: 40 } }])
  })

  it('reads the pre-2023 service_data when data is absent', () => {
    const calls: ServiceCall[] = []
    const config: ActionConfig = {
      action: 'call-service',
      service: 'script.night',
      service_data: { a: 1 },
    }
    runAction(stubHass(calls), stubElement([]), config, undefined)
    expect(calls).toEqual([{ domain: 'script', service: 'night', data: { a: 1 } }])
  })

  it('asks the companion app for a light haptic on a service call', () => {
    const { seen, target } = recording()
    runAction(stubHass([]), target, { action: 'toggle' }, 'light.hall')
    expect(seen).toEqual([{ type: 'haptic', detail: 'light' }])
  })

  it('goes back through the router window', () => {
    const back = vi.fn()
    vi.stubGlobal('window', { name: 'ha-main-window', history: { back } })
    runAction(stubHass([]), stubElement([]), { action: 'back' }, undefined)
    expect(back).toHaveBeenCalledOnce()
  })

  it('hands url and assist to Home Assistant as a tap, with the entity', () => {
    const { seen, target } = recording()
    const url: ActionConfig = { action: 'url', url_path: 'https://example.com' }
    runAction(stubHass([]), target, url, 'light.hall')
    runAction(stubHass([]), target, { action: 'assist' }, undefined)
    expect(seen).toEqual([
      {
        type: 'hass-action',
        detail: { config: { entity: 'light.hall', tap_action: url }, action: 'tap' },
      },
      {
        type: 'hass-action',
        detail: { config: { tap_action: { action: 'assist' } }, action: 'tap' },
      },
    ])
  })

  it('hands any action with a confirmation to Home Assistant, and calls nothing itself', () => {
    const calls: ServiceCall[] = []
    const { seen, target } = recording()
    const config: ActionConfig = { action: 'toggle', confirmation: { text: 'Sure?' } }
    runAction(stubHass(calls), target, config, 'lock.front')
    expect(calls).toEqual([])
    expect(seen.map(e => e.type)).toEqual(['hass-action'])
  })

  it('runs a confirmation: false action itself, as no confirmation', () => {
    const calls: ServiceCall[] = []
    runAction(
      stubHass(calls),
      stubElement([]),
      { action: 'toggle', confirmation: false },
      'light.a',
    )
    expect(calls).toHaveLength(1)
  })
})
