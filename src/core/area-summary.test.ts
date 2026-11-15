import { describe, expect, it } from 'vitest'

import {
  areaEntityIds,
  areaRegistryIds,
  areaSummary,
  Memo,
  registriesOf,
  ROOM_KEYS,
  roomKeysOf,
  areaSummaryText,
  roomExtrasFor,
  roomSummaryOptions,
  roomTemplates,
  roomWatchedIds,
  summaryPartsFor,
} from './area-summary'
import { roomFromForm, roomRows, roomToForm } from './area-form'
import { tintLabel } from './tint'
import type { HassEntity, HomeAssistant } from './types/ha'

const state = (
  entity_id: string,
  value: string,
  attributes: Record<string, unknown> = {},
): HassEntity =>
  ({
    entity_id,
    state: value,
    attributes,
    last_changed: '',
    last_updated: '',
    context: { id: '', parent_id: null, user_id: null },
  }) as HassEntity

/**
 * A house with a kitchen. Entities on the kitchen device inherit its area; `light.porch` sits on
 * the same device but is moved to the patio on its own entry, which is the override to honour.
 */
const house = (
  list: HassEntity[],
  extra: {
    hidden?: string[]
    areaOf?: Record<string, string>
    area?: Record<string, unknown>
  } = {},
): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: Object.fromEntries(
      list.map(one => [
        one.entity_id,
        {
          entity_id: one.entity_id,
          device_id: 'dev.kitchen',
          area_id: extra.areaOf?.[one.entity_id] ?? null,
          hidden: extra.hidden?.includes(one.entity_id) ?? false,
        },
      ]),
    ),
    devices: { 'dev.kitchen': { id: 'dev.kitchen', area_id: 'kitchen' } },
    areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen', ...extra.area } },
    locale: { language: 'en' },
  }) as unknown as HomeAssistant

describe('areaEntityIds', () => {
  it("takes the device's area, unless the entity names its own, and skips hidden ones", () => {
    const hass = house(
      [state('light.a', 'on'), state('light.porch', 'on'), state('light.hidden', 'on')],
      { areaOf: { 'light.porch': 'patio' }, hidden: ['light.hidden'] },
    )
    expect(areaEntityIds(hass, 'kitchen')).toEqual(['light.a'])
    expect(areaEntityIds(hass, 'patio')).toEqual(['light.porch'])
  })
})

describe('areaSummary', () => {
  it('reads a room the way the Home app does, attention first', () => {
    const hass = house(
      [
        state('light.a', 'on'),
        state('light.b', 'on'),
        state('light.c', 'off'),
        state('binary_sensor.door', 'on', { device_class: 'door' }),
        state('binary_sensor.room', 'on', { device_class: 'occupancy' }),
        state('sensor.t1', '71.2', { device_class: 'temperature' }),
        state('sensor.t2', '72.9', { device_class: 'temperature' }),
      ],
      { area: { temperature_entity_id: 'sensor.t2' } },
    )
    expect(areaSummaryText(areaSummary(hass, 'kitchen'))).toBe(
      'Door Open · Occupied · 73° · 2 Lights On',
    )
  })

  it("prefers the area's chosen sensor, and an override over both", () => {
    const sensors = [
      state('sensor.t1', '60', { device_class: 'temperature' }),
      state('sensor.t2', '80', { device_class: 'temperature' }),
    ]
    const hass = house(sensors, { area: { temperature_entity_id: 'sensor.t2' } })
    expect(areaSummary(hass, 'kitchen', { parts: ['temperature'] })[0]?.text).toBe('80°')
    expect(
      areaSummary(hass, 'kitchen', { parts: ['temperature'], temperatureEntity: 'sensor.t1' })[0]
        ?.text,
    ).toBe('60°')
  })

  it('never guesses a temperature from the sensors in the room', () => {
    const hass = house([
      state('sensor.window', '71', { device_class: 'temperature' }),
      state('sensor.freezer', '-2', { device_class: 'temperature' }),
    ])
    expect(areaSummary(hass, 'kitchen', { parts: ['temperature'] })).toEqual([])
  })

  it('leaves the temperature out while the chosen sensor is not reporting', () => {
    const hass = house([state('sensor.t1', 'unavailable', { device_class: 'temperature' })], {
      area: { temperature_entity_id: 'sensor.t1' },
    })
    expect(areaSummary(hass, 'kitchen', { parts: ['temperature'] })).toEqual([])
  })

  it('counts a light group and its members once, by leaving the group out', () => {
    const hass = house([
      state('light.a', 'on'),
      state('light.b', 'on'),
      state('light.group', 'on', { entity_id: ['light.a', 'light.b'] }),
    ])
    expect(areaSummary(hass, 'kitchen', { parts: ['lights'] })[0]?.text).toBe('2 Lights On')
  })

  it('flags alerts, and names mixed openings by count alone', () => {
    const hass = house([
      state('binary_sensor.leak', 'on', { device_class: 'moisture' }),
      state('lock.back', 'jammed'),
      state('binary_sensor.door', 'on', { device_class: 'door' }),
      state('binary_sensor.window', 'on', { device_class: 'window' }),
    ])
    const [alerts, open] = areaSummary(hass, 'kitchen', { parts: ['alerts', 'open'] })
    expect(alerts).toMatchObject({ text: 'Leak · Lock Jammed', alert: true })
    expect(open?.text).toBe('2 Open')
  })

  it('says only "Open" for a contact of the generic opening class', () => {
    const hass = house([state('binary_sensor.w', 'on', { device_class: 'opening' })])
    expect(areaSummary(hass, 'kitchen', { parts: ['open'] })[0]?.text).toBe('Open')
  })

  it('says nothing for a quiet room, and ignores what is not reporting', () => {
    const hass = house([
      state('light.a', 'off'),
      state('binary_sensor.door', 'unavailable', { device_class: 'door' }),
    ])
    expect(areaSummary(hass, 'kitchen')).toEqual([])
  })

  it('shows a thermostat that is running, with its target', () => {
    const hass = house([state('climate.hall', 'heat', { hvac_action: 'heating', temperature: 70 })])
    expect(areaSummary(hass, 'kitchen', { parts: ['climate'] })[0]?.text).toBe('Heating to 70°')
  })

  it('keeps the order the card asked for', () => {
    const hass = house(
      [state('light.a', 'on'), state('sensor.h', '41.6', { device_class: 'humidity' })],
      { area: { humidity_entity_id: 'sensor.h' } },
    )
    expect(areaSummaryText(areaSummary(hass, 'kitchen', { parts: ['lights', 'humidity'] }))).toBe(
      'Light On · 42%',
    )
  })
})

describe('summaryPartsFor', () => {
  it('keeps the parts it knows, in order', () => {
    expect(summaryPartsFor(['lights', 'nonsense', 'alerts'])).toEqual(['lights', 'alerts'])
    expect(summaryPartsFor('lights')).toBeUndefined()
  })
})

describe('customising a room', () => {
  const GARAGE = state('cover.garage', 'open', { device_class: 'garage' })
  const LAMP = state('light.a', 'on')
  const LEAK = state('binary_sensor.leak', 'on', { device_class: 'moisture' })
  const HALL_LOCK = state('lock.hall', 'unlocked')
  const BIN = state('sensor.bin_day', 'tomorrow', { friendly_name: 'Bins' })
  const DRYER = state('sensor.dryer', 'running', { friendly_name: 'Dryer', device_class: 'enum' })
  const hass = house([GARAGE, LAMP, LEAK, HALL_LOCK, BIN, DRYER], {
    areaOf: { 'lock.hall': 'hall', 'sensor.bin_day': 'hall', 'sensor.dryer': 'hall' },
  })
  const text = (options: Parameters<typeof areaSummary>[2]) =>
    areaSummaryText(areaSummary(hass, 'kitchen', options))

  it('leaves out what it is told to', () => {
    expect(text({ parts: ['open', 'lights'] })).toBe('Garage Open · Light On')
    expect(text({ parts: ['open', 'lights'], exclude: ['cover.garage'] })).toBe('Light On')
  })

  it('counts what it borrows from another room, by the same rules', () => {
    expect(text({ parts: ['locks'] })).toBe('')
    expect(text({ parts: ['locks'], include: ['lock.hall'] })).toBe('Unlocked')
    // Borrowed twice is still one lock.
    expect(text({ parts: ['locks'], include: ['lock.hall', 'lock.hall'] })).toBe('Unlocked')
  })

  it("keeps the user's order, but alerts always come first", () => {
    expect(text({ parts: ['lights', 'open', 'alerts'] })).toBe('Leak · Light On · Garage Open')
  })

  it('adds its own icons after the parts, in a state, while active, or from a template', () => {
    const items = areaSummary(hass, 'kitchen', {
      parts: ['lights'],
      extras: [
        {
          entity: 'sensor.bin_day',
          state: 'today, tomorrow',
          icon: 'mdi:trash-can',
          color: 'green',
          name: 'Bins Out',
        },
        { entity: 'sensor.dryer', state: 'done' },
        { entity: 'sensor.dryer', text: '{{ 12 }}m', show: '{{ true }}' },
        { entity: 'lock.hall' },
        { entity: 'cover.missing' },
      ],
      resolve: template =>
        template === '{{ true }}' ? 'True' : template === '{{ 12 }}m' ? '12m' : undefined,
    })
    expect(items.map(item => item.text)).toEqual(['Light On', 'Bins Out', 'Dryer 12m', 'lock.hall'])
    expect(items[1]).toMatchObject({
      part: 'custom',
      icon: 'mdi:trash-can',
      color: 'var(--cw-green)',
      entities: ['sensor.bin_day'],
      alert: false,
    })
    expect(items[2]?.badge).toBe('12m')
  })

  it('reads a room config into options, watching what it borrows and its icons', () => {
    const room = {
      area: 'kitchen',
      include: ['lock.hall'],
      exclude: ['cover.garage'],
      extras: [
        { entity: 'sensor.bin_day', show: "{{ is_state(entity, 'today') }}" },
        { icon: 'x' },
      ],
    }
    expect(roomSummaryOptions(room).extras).toEqual([
      { entity: 'sensor.bin_day', show: "{{ is_state(entity, 'today') }}" },
    ])
    expect(roomWatchedIds(hass, room)).toEqual(
      expect.arrayContaining(['lock.hall', 'sensor.bin_day', 'light.a']),
    )
    expect(roomTemplates(room)).toEqual([
      { template: "{{ is_state(entity, 'today') }}", entity: 'sensor.bin_day' },
    ])
    expect(roomExtrasFor('nope')).toBeUndefined()
  })
})

describe('the room panel', () => {
  const hass = house([state('light.a', 'on'), state('lock.hall', 'locked')], {
    areaOf: { 'lock.hall': 'hall' },
  })

  it('offers only the room’s own to leave out, and everything else to count', () => {
    const rows = roomRows({ area: 'kitchen' }, { hass })
    const byName = Object.fromEntries(rows.map(row => [row.name, row.selector]))
    expect(byName.exclude).toEqual({ entity: { multiple: true, include_entities: ['light.a'] } })
    expect(byName.include).toEqual({ entity: { multiple: true, exclude_entities: ['light.a'] } })
    expect(byName.summary).toMatchObject({ select: { multiple: true, reorder: true } })
    expect(byName.extras).toHaveProperty('object')
  })

  it('writes each new key only when it says something, and keeps the dragged order', () => {
    const form = roomToForm({ area: 'kitchen' })
    expect(roomFromForm({ ...form, exclude: [], include: [], extras: [] })).toEqual({
      area: 'kitchen',
    })
    expect(
      roomFromForm({
        ...form,
        summary: ['lights', 'temperature'],
        exclude: ['cover.garage'],
        include: ['lock.hall'],
        extras: [{ entity: 'sensor.bin_day', icon: '', color: 'green' }],
      }),
    ).toEqual({
      area: 'kitchen',
      summary: ['lights', 'temperature'],
      exclude: ['cover.garage'],
      include: ['lock.hall'],
      extras: [{ entity: 'sensor.bin_day', color: 'green' }],
    })
  })
})

describe('the area map', () => {
  /** A registry that counts how often it is walked, so a test can see the cache hold. */
  const counted = (hass: HomeAssistant): { hass: HomeAssistant; walks: () => number } => {
    let walks = 0
    const entities = new Proxy(hass.entities, {
      ownKeys(target) {
        walks += 1
        return Reflect.ownKeys(target)
      },
    })
    return { hass: { ...hass, entities }, walks: () => walks }
  }

  it('walks the registry once for every room, and once per registry change', () => {
    const { hass, walks } = counted(
      house([state('light.a', 'on'), state('light.b', 'off'), state('lock.hall', 'locked')], {
        areaOf: { 'lock.hall': 'hall' },
      }),
    )
    expect(areaEntityIds(hass, 'kitchen')).toEqual(['light.a', 'light.b'])
    expect(areaEntityIds(hass, 'hall')).toEqual(['lock.hall'])
    // A state push: a new `hass` and new states, the same registries.
    const pushed = { ...hass, states: { ...hass.states } }
    expect(areaEntityIds(pushed, 'kitchen')).toEqual(['light.a', 'light.b'])
    expect(walks()).toBe(1)
    // The device moved room: a new device registry, so a fresh walk.
    const moved = {
      ...hass,
      devices: { 'dev.kitchen': { id: 'dev.kitchen', area_id: 'hall' } },
    } as unknown as HomeAssistant
    expect(areaEntityIds(moved, 'kitchen')).toEqual([])
    expect(areaEntityIds(moved, 'hall')).toEqual(['light.a', 'light.b', 'lock.hall'])
    expect(walks()).toBe(2)
  })

  it('keeps the state filter outside the cache', () => {
    const hass = house([state('light.a', 'on'), state('light.b', 'off')])
    expect(areaEntityIds(hass, 'kitchen')).toEqual(['light.a', 'light.b'])
    const { 'light.b': _gone, ...rest } = hass.states
    void _gone
    const without = { ...hass, states: rest } as HomeAssistant
    expect(areaEntityIds(without, 'kitchen')).toEqual(['light.a'])
    // What a card watches keeps it, so its first state repaints the room.
    expect(areaRegistryIds(without, 'kitchen')).toEqual(['light.a', 'light.b'])
    expect(roomWatchedIds(without, { area: 'kitchen' })).toContain('light.b')
  })

  it('reads a hidden entity or a new category once the registry is replaced', () => {
    const hass = house([state('light.a', 'on'), state('light.b', 'off')])
    expect(areaEntityIds(hass, 'kitchen')).toEqual(['light.a', 'light.b'])
    const hidden = {
      ...hass,
      entities: {
        ...hass.entities,
        'light.b': { ...hass.entities['light.b'], entity_category: 'config' },
      },
    } as HomeAssistant
    expect(areaEntityIds(hidden, 'kitchen')).toEqual(['light.a'])
  })

  it('answers a missing registry with nothing', () => {
    const bare = { states: {} } as unknown as HomeAssistant
    expect(areaEntityIds(bare, 'kitchen')).toEqual([])
  })
})

describe('Memo', () => {
  it('computes again only when a key is a different object', () => {
    const memo = new Memo<number>()
    let runs = 0
    const rows = [{ area: 'den' }]
    const hass = house([])
    const get = (keys: readonly unknown[]) => memo.get(keys, () => ++runs)
    expect(get([rows, ...registriesOf(hass)])).toBe(1)
    expect(get([rows, ...registriesOf({ ...hass, states: {} })])).toBe(1)
    expect(get([[...rows], ...registriesOf(hass)])).toBe(2)
    expect(get([[...rows], ...registriesOf(undefined)])).toBe(3)
  })
})

describe('roomKeysOf', () => {
  it('copies only the room keys that are set', () => {
    expect(ROOM_KEYS).toContain('extras')
    expect(
      roomKeysOf({
        area: 'den',
        summary: ['lights'],
        include: ['lock.hall'],
        exclude: [],
        temperature_entity: '',
        name: 'Den',
        tap_action: { action: 'none' },
      } as never),
    ).toEqual({ area: 'den', summary: ['lights'], include: ['lock.hall'], exclude: [] })
  })
})

describe('the extras colour list', () => {
  it('labels the palette as every other colour list does', () => {
    const extras = roomRows({ area: 'kitchen' }).find(row => row.name === 'extras')
    const options = (
      extras?.selector as {
        object: { fields: { color: { selector: { select: { options: unknown[] } } } } }
      }
    ).object.fields.color.selector.select.options
    expect(options).toContainEqual({ value: 'accent', label: tintLabel('accent') })
    expect(options).toContainEqual({ value: 'red', label: 'Red' })
  })
})
