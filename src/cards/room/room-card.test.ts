/**
 * The room card's translation into a chips card, its editor's round trip, and the element-level
 * rules the room cards share (which registries repaint them, what reopens their templates).
 *
 * The elements are constructed in Node, against Lit's own server shim: enough for a constructor,
 * a `setConfig` and the protected hooks, which is all these tests reach. `window`, the build's
 * version constant and `ResizeObserver` are stubbed before the modules load.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { HaFormSchema, HomeAssistant } from '../../core/types/ha'
import type { RoomCardConfig } from './room-card'

let Room: typeof import('./room-card')
let Editor: typeof import('./room-card-editor')
let Chips: typeof import('../chips/chips-card')
let Tiles: typeof import('../tiles/tiles-card')
let Badge: typeof import('../badge/badge')
let Base: typeof import('../../core/base-card')
let ListEditor: typeof import('../chips/chip-list-editor')

beforeAll(async () => {
  const global = globalThis as Record<string, unknown>
  global.__CW_VERSION__ = 'test'
  global.window ??= globalThis
  global.ResizeObserver ??= class {
    observe(): void {}
    disconnect(): void {}
  }
  Room = await import('./room-card')
  Editor = await import('./room-card-editor')
  Chips = await import('../chips/chips-card')
  Tiles = await import('../tiles/tiles-card')
  Badge = await import('../badge/badge')
  Base = await import('../../core/base-card')
  ListEditor = await import('../chips/chip-list-editor')
})

/** An element whose `style` can be written to, which the shim's cannot. */
const make = <T extends object>(Element: new () => T): T => {
  const element = new Element()
  Object.defineProperty(element, 'style', {
    value: { setProperty: () => {}, removeProperty: () => {} },
  })
  return element
}

const house = (): HomeAssistant =>
  ({
    states: {
      'light.a': { entity_id: 'light.a', state: 'on', attributes: {} },
    },
    entities: { 'light.a': { entity_id: 'light.a', area_id: 'den' } },
    devices: {},
    areas: { den: { area_id: 'den', name: 'Den' } },
    themes: { darkMode: false },
    locale: { language: 'en' },
  }) as unknown as HomeAssistant

describe('the room card', () => {
  it('becomes a chips card of one room row, carrying only the room keys', () => {
    const card = make(Room.CupertinoRoomCard) as any
    const config: RoomCardConfig = {
      type: 'custom:cupertino-plus-room',
      area: 'den',
      name: 'The Den',
      summary: ['lights'],
      include: ['lock.hall'],
      extras: [{ entity: 'sensor.bin' }],
      temperature_entity: '',
      tap_action: { action: 'navigate', navigation_path: '/den' },
      alignment: 'center',
    }
    card.setConfig(config)
    expect(card._config.entities).toEqual([
      {
        area: 'den',
        summary: ['lights'],
        include: ['lock.hall'],
        extras: [{ entity: 'sensor.bin' }],
      },
    ])
    expect(card._config.alignment).toBe('center')
    expect(card._config.name).toBe('The Den')
  })

  it('draws no row until a room is chosen', () => {
    const card = make(Room.CupertinoRoomCard) as any
    card.setConfig({ type: 'custom:cupertino-plus-room' })
    expect(card._config.entities).toEqual([])
    expect(() => card.setConfig(undefined)).toThrow()
  })
})

describe('the room editor', () => {
  const editor = () => new Editor.CupertinoRoomCardEditor() as any
  const fields = (data: Record<string, unknown>): string[] => {
    const e = editor()
    e._config = data
    return (e.fields() as HaFormSchema[]).map(row => row.name)
  }

  it('round-trips a full config through its form', () => {
    const config: RoomCardConfig = {
      type: 'custom:cupertino-plus-room',
      area: 'den',
      summary: ['lights', 'alerts'],
      exclude: ['cover.garage'],
      include: ['lock.hall'],
      extras: [{ entity: 'sensor.bin', color: 'green' }],
      temperature_entity: 'sensor.den_temperature',
      humidity_entity: 'sensor.den_humidity',
      name: 'The Den',
      show_name: false,
      content: 'icon',
      alignment: 'end',
      container: 'card',
      tap_action: { action: 'navigate', navigation_path: '/den' },
    }
    const e = editor()
    const data = e.toForm(config)
    const back = e.fromForm(config, data, Object.keys(data))
    expect(back).toEqual(config)
  })

  it('writes nothing it was not given', () => {
    const config: RoomCardConfig = { type: 'custom:cupertino-plus-room', area: 'den' }
    const e = editor()
    const data = e.toForm(config)
    expect(e.fromForm(config, data, Object.keys(data))).toEqual(config)
  })

  it('names and explains every action field', () => {
    const e = editor()
    const named = (name: string) => e.label({ name } as HaFormSchema)
    for (const name of [
      'action_target',
      'action_data',
      'action_entity',
      'confirm',
      'confirm_text',
    ]) {
      expect(named(name)).not.toBe(name)
    }
    expect(named('pipeline_id')).toBe('Assistant')
    expect(named('start_listening')).toBe('Start listening')
    expect(e.helper({ name: 'action_target' } as HaFormSchema)).toBeDefined()
    expect(e.helper({ name: 'container' } as HaFormSchema)).toContain('wallpaper')
  })

  it('offers the shared Background row and the chips card’s alignment words', () => {
    const e = editor()
    e._config = { type: 'x', area: 'den' }
    const rows = e.fields() as HaFormSchema[]
    const container = rows.find(row => row.name === 'container') as any
    expect(container.selector.select.options[0].label).toBe('Glass — floats on the dashboard')
    const alignment = rows.find(row => row.name === 'alignment') as any
    expect(alignment.selector.select.options.map((o: any) => o.label)).toContain('Centre')
    expect(fields({ type: 'x', show_name: false })).not.toContain('name')
  })
})

describe('the room cards’ repaint rules', () => {
  it('repaint on a registry edit only where rooms are drawn', () => {
    const rooms: (new () => object)[] = [
      Chips.CupertinoChipsCard,
      Tiles.CupertinoTilesCard,
      Room.CupertinoRoomCard,
    ]
    for (const Card of rooms) expect((make(Card) as any).watchesRegistries).toBe(true)
    class Plain extends Base.CupertinoCard {
      protected override render() {
        return undefined as never
      }
    }
    expect((make(Plain) as any).watchesRegistries).toBe(false)
  })

  it('counts an entity moved, hidden or recategorised as a registry change', () => {
    const before = house()
    expect(Base.registriesChanged(before, { ...before, states: {} })).toBe(false)
    expect(Base.registriesChanged(before, { ...before, entities: { ...before.entities } })).toBe(
      true,
    )
    expect(Base.registriesChanged(before, { ...before, devices: {} })).toBe(true)
    expect(Base.registriesChanged(before, { ...before, areas: {} })).toBe(true)
  })

  it('a registry edit repaints a room card and not a plain one', () => {
    const before = house()
    const after = { ...before, entities: { ...before.entities } }
    const changed = new Map([['hass', before]])
    const room = make(Room.CupertinoRoomCard) as any
    room.setConfig({ type: 'x', area: 'den' })
    Object.defineProperty(room, 'hass', { value: after, writable: true })
    expect(room.shouldUpdate(changed)).toBe(true)
    Object.defineProperty(room, 'hass', { value: { ...before, states: before.states } })
    expect(room.shouldUpdate(changed)).toBe(false)

    class Plain extends Base.CupertinoCard {
      protected override render() {
        return undefined as never
      }
    }
    const plain = make(Plain) as any
    plain.setConfig({ type: 'x' })
    Object.defineProperty(plain, 'hass', { value: after })
    expect(plain.shouldUpdate(changed)).toBe(false)
  })

  it('keep their watched ids until the rows or the registries change', () => {
    const card = make(Chips.CupertinoChipsCard) as any
    card.setConfig({ type: 'x', entities: [{ area: 'den' }, 'sensor.hall'] })
    const hass = house()
    Object.defineProperty(card, 'hass', { value: hass, writable: true })
    const first = card.watchedEntities()
    expect([...first].sort()).toEqual(['light.a', 'sensor.hall'])
    card.hass = { ...hass, states: { ...hass.states } }
    expect(card.watchedEntities()).toBe(first)
    card.hass = { ...hass, entities: {} }
    expect(card.watchedEntities()).toEqual(['sensor.hall'])
  })

  it('reuse the last update’s rows for their grid size', () => {
    for (const [Card, key, config] of [
      [Chips.CupertinoChipsCard, '_chips', { type: 'x', entities: [{ area: 'den' }] }],
      [Tiles.CupertinoTilesCard, '_tiles', { type: 'x', tiles: [{ area: 'den' }] }],
    ] as const) {
      const card = make(Card as new () => object) as any
      card.setConfig(config)
      Object.defineProperty(card, 'hass', { value: house(), writable: true })
      card.willUpdate(new Map())
      const views = card[key]
      expect(views.length).toBeGreaterThan(0)
      expect(card[key]).toBe(views)
      // A new config is read afresh, not answered with the last one's rows.
      card.setConfig({ ...config })
      expect(card[key]).not.toBe(views)
    }
  })

  it('ask for an update when re-attached, so their templates reopen', async () => {
    // The shim has no shadow root to attach, so Lit's own half is stood down; the card's
    // request is what is under test.
    const { LitElement } = await import('lit')
    const lit = vi.spyOn(LitElement.prototype, 'connectedCallback').mockImplementation(() => {})
    for (const Card of [Chips.CupertinoChipsCard, Tiles.CupertinoTilesCard, Badge.CupertinoBadge]) {
      const card = make(Card as new () => object) as any
      const request = vi.spyOn(card, 'requestUpdate')
      card.connectedCallback()
      expect(request).toHaveBeenCalled()
    }
    lit.mockRestore()
  })
})

describe('a room row’s panel', () => {
  it('offers no icon, name or reading, which a room row does not draw', () => {
    const names = (config: Record<string, unknown>, templating: boolean) =>
      ListEditor.chipSchema(undefined, config, config, templating, true).map(row => row.name)
    const room = names({ area: 'den' }, true)
    expect(room).not.toContain('icon')
    expect(room).not.toContain('name')
    expect(room).not.toContain('value')
    expect(room).toContain('show')
    expect(room).toContain('fill')
    expect(room).toContain('on_hold_action')
    const blank = names({}, true)
    expect(blank).toEqual(expect.arrayContaining(['icon', 'name', 'value']))
  })
})
