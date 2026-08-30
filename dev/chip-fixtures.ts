/**
 * The mock entities the chips card is shown against, and the named sets the showcase offers.
 *
 * Note where this lives, and why it looks like `complication-entities.ts` rather than
 * `demo-data.ts`: this card has the same relationship with `hass.states` those cards do.
 * Everything it draws comes off an entity sitting in the state machine, so a fixture here is a
 * mock entity plus the config that points at it, both belonging to the harness and neither
 * shipping in the bundle. What the showcase prints in its Config pane is exactly what it handed
 * the card.
 *
 * Chosen for the branch each one lands on, the rule `complication-entities.ts` and
 * `weather-fixtures.ts` both state outright — a fixture that exercises nothing is a picture
 * nobody learns from:
 *
 *  - **A temperature in `°C`**, which is the visible proof of the unit fix in
 *    `core/entity-view.ts`: it must read `21.4°C`, not `21.4 °C`.
 *  - **A battery percentage**, the other tight unit.
 *  - **A lock**, whose state is a word rather than a number.
 *  - **A person who is `not_home`**, the humanised-state path — it must read `Not home`.
 *  - **A light**, so the showcase has something a `toggle` action would make sense on.
 *  - **A sensor that has stopped reporting**, for the dashed-and-dimmed contract.
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

export const HALL_TEMPERATURE = 'sensor.hall_temperature'
/**
 * Named for its owner, not just for the device, and that is not decoration: the battery card's
 * own fixtures already claim `sensor.phone_battery`, and `mock-hass.ts` merges every fixture
 * file into one state machine. The first version of this file took that id, spread last, and
 * quietly repainted four battery screenshots with this entity's 41% — visible only in the
 * PNGs. `mock-hass.ts` now refuses a duplicate outright rather than resolving it.
 */
export const PHONE_BATTERY = 'sensor.joe_phone_battery'
export const FRONT_DOOR = 'lock.front_door'
export const JOE = 'person.joe'
export const KITCHEN_LIGHT = 'light.kitchen'
export const SHED_TEMPERATURE = 'sensor.shed_temperature'

export const CHIP_STATES: readonly HassEntity[] = [
  entity(HALL_TEMPERATURE, '21.4', {
    friendly_name: 'Hall',
    unit_of_measurement: '°C',
    device_class: 'temperature',
  }),
  entity(PHONE_BATTERY, '41', {
    friendly_name: 'Phone',
    unit_of_measurement: '%',
    device_class: 'battery',
  }),
  entity(FRONT_DOOR, 'locked', { friendly_name: 'Front door' }),
  entity(JOE, 'not_home', { friendly_name: 'Joe' }),
  entity(KITCHEN_LIGHT, 'on', { friendly_name: 'Kitchen' }),
  entity(SHED_TEMPERATURE, 'unavailable', {
    friendly_name: 'Shed',
    device_class: 'temperature',
  }),
]

const ALL = CHIP_STATES.map(one => one.entity_id)

/** Twelve chips out of six entities, so the wrap is forced rather than hoped for. */
const MANY = [...ALL, ...ALL]

/**
 * The named sets, each one named for the branch it lands on rather than for a plausible
 * household.
 *
 * `actions` is the only set whose rows are objects rather than bare ids, and it has to be: a
 * tap action is per chip and YAML-only in this release (`docs/chips-widget-rules.md` §7), so
 * the one place a visitor can see the three interesting outcomes side by side is a fixture that
 * writes them out. The Config pane prints exactly those rows.
 */
/**
 * What the mock installation answers for each template the fixtures use.
 *
 * The showcase cannot run Jinja, so this is a lookup keyed by the exact template string — a
 * stub, and honest about being one in the way `dev/ha-stubs.ts` is about `ha-form`. It is
 * enough to prove the wiring: that a template's result reaches the field, that an unresolved
 * one falls back, and that `show: false` removes a chip from the row.
 */
export const TEMPLATE_RESULTS: Record<string, string> = {
  "{{ 'Home' if is_state('person.joe','home') else 'Out' }}": 'Out',
  "{{ 'mdi:lock-open' if is_state('lock.front_door','unlocked') else 'mdi:lock' }}": 'mdi:lock',
  "{{ 'red' if states('sensor.hall_temperature')|float > 20 else 'blue' }}": 'red',
  "{{ states('sensor.hall_temperature') }}° in the hall": '21.4° in the hall',
  "{{ is_state('light.kitchen','on') }}": 'False',
}

export const CHIP_SETS: Record<string, readonly unknown[]> = {
  mixed: ALL,
  one: [HALL_TEMPERATURE],
  many: MANY,
  actions: [
    { entity: KITCHEN_LIGHT, tap_action: { action: 'toggle' } },
    { entity: FRONT_DOOR, tap_action: { action: 'more-info' } },
    { entity: JOE, tap_action: { action: 'none' } },
  ],
  unavailable: [SHED_TEMPERATURE, HALL_TEMPERATURE],
  templates: [
    {
      entity: HALL_TEMPERATURE,
      color: "{{ 'red' if states('sensor.hall_temperature')|float > 20 else 'blue' }}",
    },
    {
      entity: JOE,
      name: "{{ 'Home' if is_state('person.joe','home') else 'Out' }}",
      content: 'labeled',
    },
    {
      entity: FRONT_DOOR,
      icon: "{{ 'mdi:lock-open' if is_state('lock.front_door','unlocked') else 'mdi:lock' }}",
      color: 'green',
    },
    { entity: HALL_TEMPERATURE, value: "{{ states('sensor.hall_temperature') }}° in the hall" },
    // Hidden: the row draws four chips, not five.
    { entity: KITCHEN_LIGHT, show: "{{ is_state('light.kitchen','on') }}" },
  ],
}

export const DEFAULT_CHIP_SET = 'mixed'

export const chipSet = (name: string): readonly unknown[] =>
  CHIP_SETS[name] ?? CHIP_SETS[DEFAULT_CHIP_SET] ?? []
