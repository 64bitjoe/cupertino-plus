/**
 * The mock installation the complication card is shown against, and the named sets the
 * showcase offers.
 *
 * Note where this lives, and why it looks like `battery-devices.ts` rather than
 * `demo-data.ts`: this card has the same relationship with `hass.states` the battery card
 * does. Everything it draws comes off an entity sitting in the state machine, so a fixture
 * here is a mock entity plus the config that points at it, both belonging to the harness and
 * neither shipping in the bundle. What the showcase prints in its Config pane is exactly what
 * it handed the card.
 *
 * Chosen for the branch each entity lands on, not for a plausible household — a rule
 * `battery-devices.ts` states outright and this file follows just as literally:
 *
 *  - **A neutral invented household.** Named the way Home Assistant names them, so the YAML in
 *    the Config pane reads like something a real dashboard would hold.
 *  - **One entity per branch, not one per idea.** A derived range, no range at all, a range
 *    read off the unit alone, a range the entity asserts itself, a state that is not a number,
 *    a name too long to caption, and an entity that has stopped reporting — each appears once.
 */

import type { HassEntity } from '../src/core/types/ha'

const entity = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id: entityId,
  state,
  attributes,
  last_changed: '2026-08-06T09:00:00.000Z',
  last_updated: '2026-08-06T09:00:00.000Z',
})

export const PHONE_BATTERY = 'sensor.demo_phone_battery'
export const LOUNGE_TEMPERATURE = 'sensor.demo_lounge_temperature'
export const LOUNGE_HUMIDITY = 'sensor.demo_lounge_humidity'
export const WATER_TANK = 'sensor.demo_water_tank'
export const OUTSIDE_TEMPERATURE = 'sensor.demo_outside_temperature'
export const PRESSURE = 'sensor.demo_pressure'
export const TARGET = 'number.demo_target'
export const WASHING_MACHINE = 'sensor.demo_washing_machine'
export const LONG_NAME = 'sensor.demo_extremely_long_entity_name'
export const OFFLINE = 'sensor.demo_offline'

/**
 * The mock installation's entities, one per branch `range.ts`, `tint.ts` and `model.ts` can
 * take.
 *
 * `TARGET` is not named by any set below — it exists so a visitor who edits the Config pane's
 * YAML by hand can point the card at a `number` entity and see the one range branch none of
 * the named sets reaches on its own: the entity asserting its own `min`/`max` rather than one
 * being derived or overridden. Every other row here is reachable through `ENTITY_SETS`.
 */
export const COMPLICATION_STATES: readonly HassEntity[] = [
  entity(PHONE_BATTERY, '72', {
    friendly_name: 'Phone battery',
    device_class: 'battery',
    unit_of_measurement: '%',
  }),
  entity(LOUNGE_TEMPERATURE, '21.4', {
    friendly_name: 'Lounge temperature',
    device_class: 'temperature',
    unit_of_measurement: '°C',
  }),
  entity(LOUNGE_HUMIDITY, '46', {
    friendly_name: 'Lounge humidity',
    device_class: 'humidity',
    unit_of_measurement: '%',
  }),
  entity(WATER_TANK, '21', {
    friendly_name: 'Water tank',
    unit_of_measurement: '%',
  }),
  entity(OUTSIDE_TEMPERATURE, '24.0', {
    friendly_name: 'Outside temperature',
    device_class: 'temperature',
  }),
  entity(PRESSURE, '1013', {
    friendly_name: 'Pressure',
    device_class: 'pressure',
    unit_of_measurement: 'hPa',
  }),
  entity(TARGET, '5', {
    friendly_name: 'Target',
    min: 1,
    max: 10,
  }),
  entity(WASHING_MACHINE, 'Running', {
    friendly_name: 'Washing machine',
    icon: 'mdi:washing-machine',
  }),
  entity(LONG_NAME, '12', {
    friendly_name: 'Upstairs landing cupboard humidity sensor',
  }),
  entity(OFFLINE, 'unavailable', {
    friendly_name: 'Offline sensor',
  }),
]

/**
 * The named sets, chosen for the branch each one lands on rather than for realism.
 *
 * `gauge` and `no-range` are the card's two circular outcomes side by side: one entity draws
 * a ring, the other draws icon-and-value with none. `four` and `six` are the same idea `model
 * ../battery-devices.ts` already uses — a set that stays inside a footprint's comfortable row
 * count, and one that does not — except this card has no cap to bump against, so `six` is here
 * to show a card sizing itself up to fit rather than one hiding a device. `word` and
 * `long-name` are this card's two text failure modes: a reading that is not a number, and a
 * name too long to caption. `unavailable` is the card's unhappy path, same as the battery
 * card's `doorbell`.
 */
export const ENTITY_SETS = {
  gauge: [PHONE_BATTERY],
  'no-range': [LOUNGE_TEMPERATURE],
  four: [LOUNGE_TEMPERATURE, LOUNGE_HUMIDITY, WATER_TANK, PHONE_BATTERY],
  six: [
    LOUNGE_TEMPERATURE,
    LOUNGE_HUMIDITY,
    WATER_TANK,
    PHONE_BATTERY,
    OUTSIDE_TEMPERATURE,
    PRESSURE,
  ],
  word: [WASHING_MACHINE],
  'long-name': [LONG_NAME],
  unavailable: [OFFLINE],
} as const

export type EntitySetName = keyof typeof ENTITY_SETS

export const DEFAULT_ENTITY_SET: EntitySetName = 'four'

export const entitySet = (name: string): readonly string[] =>
  ENTITY_SETS[name as EntitySetName] ?? ENTITY_SETS[DEFAULT_ENTITY_SET]
