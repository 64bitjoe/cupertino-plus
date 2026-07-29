import { describe, expect, it } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import {
  deviceConfigs,
  entityIds,
  inheritedIcon,
  inheritedName,
  readDevice,
  readDevices,
  watchedIds,
  writeDeviceRows,
} from './model'

const entity = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id: entityId,
  state,
  attributes,
  last_changed: '2026-07-24T09:41:00.000Z',
  last_updated: '2026-07-24T09:41:00.000Z',
})

/** Only `states` is ever read, so only `states` is stood up. */
const withStates = (...entities: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(entities.map(one => [one.entity_id, one])),
  }) as unknown as HomeAssistant

const PHONE = 'sensor.phone_battery'

describe('the config, however it was written', () => {
  it('takes a bare id, an object, and a list of either', () => {
    expect(deviceConfigs([PHONE])).toEqual([{ entity: PHONE }])
    expect(deviceConfigs([{ entity: PHONE, name: 'Phone' }])).toEqual([
      { entity: PHONE, name: 'Phone' },
    ])
    expect(deviceConfigs([PHONE, { entity: 'sensor.watch_battery' }])).toEqual([
      { entity: PHONE },
      { entity: 'sensor.watch_battery' },
    ])
  })

  /** A scalar where a list is meant, which is what somebody writes first. */
  it('takes a single entity written without the list', () => {
    expect(deviceConfigs(PHONE)).toEqual([{ entity: PHONE }])
  })

  /** A bare `entities:` in the YAML parses to null; an absent key is undefined. */
  it('comes to nothing for a config that named nothing', () => {
    expect(deviceConfigs(undefined)).toEqual([])
    expect(deviceConfigs(null)).toEqual([])
    expect(deviceConfigs([])).toEqual([])
  })

  it('skips a row with no entity in it rather than drawing a ring for nothing', () => {
    expect(deviceConfigs([PHONE, '', 'notanentity', {}, { entity: 7 }, 42, null])).toEqual([
      { entity: PHONE },
    ])
  })

  /**
   * The domain is deliberately not checked — see `deviceConfig`. A battery percentage is a
   * `sensor` almost always and not always, and rejecting the exception would cost a working
   * setup to enforce a convention this card has no stake in.
   */
  it('accepts a level published outside the sensor domain', () => {
    expect(deviceConfigs(['number.rover_battery'])).toEqual([{ entity: 'number.rover_battery' }])
  })

  it('drops an override that says nothing, so it cannot shadow the entity', () => {
    expect(deviceConfigs([{ entity: PHONE, name: '', icon: '', charging_entity: 'nope' }])).toEqual(
      [{ entity: PHONE }],
    )
  })
})

/**
 * What `watchedEntities()` answers with. A charging sensor left off this list is the quiet
 * failure: `hass` is replaced on every state change anywhere in the installation, so the bolt
 * would appear when some unrelated sensor twitched and not when the phone was plugged in.
 */
describe('the entities a card has to be woken for', () => {
  it('includes the charging sensor of every device that named one', () => {
    expect(
      watchedIds([
        PHONE,
        { entity: 'sensor.watch_battery', charging_entity: 'binary_sensor.watch_charging' },
      ]),
    ).toEqual([PHONE, 'sensor.watch_battery', 'binary_sensor.watch_charging'])
  })
})

/**
 * The half of the visual editor a test can reach without a browser, and the half where the
 * damage would be done. `ha-entities-picker` reports a list of ids and nothing else, so the
 * editor shows it the ids and puts the rest of each row in a panel of its own; these two
 * functions are the way out and the way back.
 */
describe('a round trip through the editor', () => {
  const TABLET = 'sensor.tablet_battery'
  const WATCH = 'sensor.watch_battery'
  const CHARGER = 'binary_sensor.tablet_charging'

  /** What the panels reported, as the editor hands it over: a lookup by entity id. */
  const panels =
    (rows: Record<string, unknown>) =>
    (entity: string): unknown =>
      rows[entity]

  it('shows the picker the ids and nothing else', () => {
    expect(entityIds([PHONE, { entity: TABLET, charging_entity: CHARGER }])).toEqual([
      PHONE,
      TABLET,
    ])
  })

  it('writes what a panel reported into the row it belongs to', () => {
    expect(
      writeDeviceRows([PHONE, TABLET], panels({ [TABLET]: { charging_entity: CHARGER } })),
    ).toEqual([PHONE, { entity: TABLET, charging_entity: CHARGER }])
  })

  it('carries every field a panel offers', () => {
    expect(
      writeDeviceRows(
        [TABLET],
        panels({ [TABLET]: { icon: 'mdi:tablet', name: 'Tablet', charging_entity: CHARGER } }),
      ),
    ).toEqual([{ entity: TABLET, icon: 'mdi:tablet', name: 'Tablet', charging_entity: CHARGER }])
  })

  /** The picker is the authority on which devices there are and in what order. */
  it('follows the picker when a row is reordered, added or removed', () => {
    const overrides = panels({ [TABLET]: { charging_entity: CHARGER } })
    const tablet = { entity: TABLET, charging_entity: CHARGER }

    expect(writeDeviceRows([TABLET, PHONE], overrides)).toEqual([tablet, PHONE])
    expect(writeDeviceRows([TABLET], overrides)).toEqual([tablet])
    expect(writeDeviceRows([PHONE, TABLET, WATCH], overrides)).toEqual([PHONE, tablet, WATCH])
  })

  /**
   * The bug that keying panels by position would have caused, stated as a test: removing the
   * first of three devices shifts the other two up, and the second device must not inherit
   * the first one's charging sensor on the way.
   */
  it('keeps a panel with its own device when an earlier one is removed', () => {
    const overrides = panels({ [PHONE]: { icon: 'mdi:cellphone' } })
    expect(writeDeviceRows([WATCH, TABLET], overrides)).toEqual([WATCH, TABLET])
  })

  /**
   * An `{ entity: … }` and its bare id say the same thing, so the object form must not spread
   * through a list of plain strings on every keystroke of an edit.
   */
  it('does not churn a config of plain ids into objects', () => {
    expect(writeDeviceRows([PHONE], panels({}))).toEqual([PHONE])
    expect(writeDeviceRows([PHONE], panels({ [PHONE]: {} }))).toEqual([PHONE])
    expect(writeDeviceRows([{ entity: PHONE }], panels({}))).toEqual([PHONE])
  })

  /**
   * A field the user emptied. `icon: ''` would shadow the entity's own icon with nothing, so
   * an emptied override has to leave the config rather than sit in it blank.
   */
  it('drops a field that was cleared rather than writing it empty', () => {
    expect(
      writeDeviceRows([PHONE], panels({ [PHONE]: { icon: '', name: '', charging_entity: '' } })),
    ).toEqual([PHONE])
    expect(writeDeviceRows([PHONE], panels({ [PHONE]: { icon: undefined } }))).toEqual([PHONE])
  })
})

/**
 * The two values the editor greys into its Icon and Name fields. A placeholder is a promise
 * about what happens when the field is left empty, so these are read off the same expressions
 * `readDevice` keeps it with — see the pair of tests on its own fallbacks below.
 */
describe('what a device inherits when the config overrides nothing', () => {
  it('answers the entity’s own name and icon', () => {
    const hass = withStates(
      entity(PHONE, '72', { friendly_name: 'Phone battery', icon: 'mdi:cellphone' }),
    )
    expect(inheritedName(hass, PHONE)).toBe('Phone battery')
    expect(inheritedIcon(hass, PHONE)).toBe('mdi:cellphone')
  })

  it('answers the id and a battery glyph when the entity says neither', () => {
    const hass = withStates(entity(PHONE, '72'))
    expect(inheritedName(hass, PHONE)).toBe(PHONE)
    expect(inheritedIcon(hass, PHONE)).toBe('mdi:battery')
  })

  /**
   * Not `mdi:battery-70`. Home Assistant computes a battery sensor's own state icon from its
   * level, so the editor cannot borrow that one: it would offer a placeholder the card would
   * not honour, and the level is what the ring is for.
   */
  it('answers the unknown glyph for an entity with no reading behind it', () => {
    expect(inheritedIcon(withStates(), PHONE)).toBe('mdi:battery-unknown')
    expect(inheritedIcon(undefined, PHONE)).toBe('mdi:battery-unknown')
  })
})

describe('a level, as a state', () => {
  const level = (state: string): number | null =>
    readDevice(withStates(entity(PHONE, state)), { entity: PHONE }).level

  it('reads a number, whether or not it came as one', () => {
    expect(level('72')).toBe(72)
    expect(level('72.4')).toBe(72.4)
  })

  it('answers nothing at all for a state that is not a number', () => {
    expect(level('unavailable')).toBe(null)
    expect(level('unknown')).toBe(null)
    // The entity is not in `hass` at all — a config pointing at something deleted.
    expect(readDevice(withStates(), { entity: PHONE }).level).toBe(null)
    // And with no `hass` yet, which is the card's first paint.
    expect(readDevice(undefined, { entity: PHONE }).level).toBe(null)
  })

  /** A sensor that reports 105 after a firmware update: an arc past the circle wraps. */
  it('clamps a reading outside the range a ring can draw', () => {
    expect(level('105')).toBe(100)
    expect(level('-4')).toBe(0)
  })

  it('keeps an unreadable device rather than dropping it', () => {
    const devices = readDevices(withStates(entity(PHONE, 'unavailable')), [PHONE])
    expect(devices).toHaveLength(1)
    expect(devices[0]?.level).toBe(null)
  })
})

describe('charging', () => {
  const charging = (config: Parameters<typeof readDevice>[1], ...states: HassEntity[]): boolean =>
    readDevice(withStates(...states), config).charging

  it('follows a named binary sensor, and only that one, when there is one', () => {
    const config = { entity: PHONE, charging_entity: 'binary_sensor.phone_charging' }
    expect(
      charging(
        config,
        entity(PHONE, '72', { is_charging: true }),
        entity('binary_sensor.phone_charging', 'off'),
      ),
    ).toBe(false)
    expect(
      charging(config, entity(PHONE, '72'), entity('binary_sensor.phone_charging', 'on')),
    ).toBe(true)
  })

  it('reads the two attribute conventions when nothing was named', () => {
    expect(charging({ entity: PHONE }, entity(PHONE, '72', { is_charging: true }))).toBe(true)
    // Integrations write this three ways between them, so the comparison is lower-cased.
    expect(charging({ entity: PHONE }, entity(PHONE, '72', { battery_state: 'Charging' }))).toBe(
      true,
    )
    expect(charging({ entity: PHONE }, entity(PHONE, '72', { battery_state: 'discharging' }))).toBe(
      false,
    )
  })

  /** No bolt is a widget that has not been told; a bolt on a desk is a widget that is wrong. */
  it('says no when there is nothing to go on, including a charging entity that is gone', () => {
    expect(charging({ entity: PHONE }, entity(PHONE, '72'))).toBe(false)
    expect(
      charging({ entity: PHONE, charging_entity: 'binary_sensor.gone' }, entity(PHONE, '72')),
    ).toBe(false)
    expect(charging({ entity: PHONE }, entity(PHONE, '72', { is_charging: 'yes' }))).toBe(false)
  })
})

describe('a device’s name and icon', () => {
  it('prefers the config, then the entity, then a placeholder', () => {
    const state = entity(PHONE, '72', { friendly_name: 'Phone battery', icon: 'mdi:cellphone' })
    expect(readDevice(withStates(state), { entity: PHONE })).toMatchObject({
      name: 'Phone battery',
      icon: 'mdi:cellphone',
    })
    expect(
      readDevice(withStates(state), { entity: PHONE, name: 'Phone', icon: 'mdi:phone-ring' }),
    ).toMatchObject({ name: 'Phone', icon: 'mdi:phone-ring' })
  })

  /**
   * The entity id rather than an empty string, because it is what the user typed — the one
   * name that always identifies the row they meant.
   */
  it('falls back to the entity id, and to a battery glyph', () => {
    expect(readDevice(withStates(entity(PHONE, '72')), { entity: PHONE })).toMatchObject({
      name: PHONE,
      icon: 'mdi:battery',
    })
  })

  /** The one case where a glyph has something to add: there is no reading behind it. */
  it('marks an unreadable device with the unknown glyph', () => {
    expect(readDevice(withStates(entity(PHONE, 'unavailable')), { entity: PHONE }).icon).toBe(
      'mdi:battery-unknown',
    )
    expect(readDevice(withStates(), { entity: PHONE }).icon).toBe('mdi:battery-unknown')
  })
})
