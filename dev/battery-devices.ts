/**
 * The devices the battery card is developed against, and the sets the harness points it at.
 *
 * Note where this lives. The calendar's fixtures are in `src/`, because they are
 * `CalendarItem`s — data that only exists on the far side of a websocket mapper, so the card
 * itself has to be able to produce them and `demo_scenario` is the door. The battery card has
 * no such door and needs none: everything it draws comes out of `hass.states`, so a fixture
 * here is just a mock entity plus the config that points at it. Both belong to the harness,
 * neither ships in the bundle, and there is no key on the card that a real dashboard could
 * trip over.
 *
 * That also means the sets below are honest configs. What the showcase prints in its Config
 * pane is what it handed the card, entity ids and per-device overrides included.
 *
 * Two rules for anything added here:
 *
 *  - **A neutral invented household**, like `demo-data.ts`'s week: things somebody would
 *    actually have a battery sensor for, named the way Home Assistant names them.
 *  - **One device per branch, not one per idea.** The three ways an integration says
 *    "charging" are all represented once, and the two that cannot be read are one each.
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
  last_changed: '2026-07-24T09:41:00.000Z',
  last_updated: '2026-07-24T09:41:00.000Z',
})

const battery = (
  entityId: string,
  name: string,
  level: string,
  attributes: Record<string, unknown> = {},
): HassEntity =>
  entity(entityId, level, {
    friendly_name: `${name} battery`,
    device_class: 'battery',
    unit_of_measurement: '%',
    ...attributes,
  })

export const PHONE = 'sensor.phone_battery'
export const WATCH = 'sensor.watch_battery'
export const EARBUDS = 'sensor.earbuds_battery'
export const TABLET = 'sensor.tablet_battery'
export const LAPTOP = 'sensor.laptop_battery'
export const REMOTE = 'sensor.remote_battery'
export const DOORBELL = 'sensor.doorbell_battery'

/**
 * The mock installation's battery sensors, spread across every branch of `model.ts`.
 *
 * The charging ones are deliberately not alike: the tablet has the separate binary sensor a
 * config has to name, the laptop puts `is_charging` on its own attributes and the watch puts
 * `battery_state`. Only the first of those needs anything in the config, which is the whole
 * point of reading the other two.
 *
 * The last two are the cards' unhappy paths. The remote publishes no icon at all, so the
 * fallback glyph is on screen somewhere rather than only in a test; the doorbell has stopped
 * reporting, which is a dash and a dimmed ring and is exactly what somebody looks at a battery
 * widget to find out.
 */
export const BATTERY_STATES: readonly HassEntity[] = [
  battery(PHONE, 'Phone', '72', { icon: 'mdi:cellphone' }),
  battery(WATCH, 'Watch', '41', { icon: 'mdi:watch', battery_state: 'Charging' }),
  battery(EARBUDS, 'Earbuds', '8', { icon: 'mdi:headphones' }),
  battery(TABLET, 'Tablet', '100', { icon: 'mdi:tablet' }),
  entity('binary_sensor.tablet_charging', 'on', {
    friendly_name: 'Tablet charging',
    device_class: 'battery_charging',
  }),
  battery(LAPTOP, 'Laptop', '63', { icon: 'mdi:laptop', is_charging: true }),
  battery(REMOTE, 'Remote', '22'),
  battery(DOORBELL, 'Doorbell', 'unavailable', { icon: 'mdi:doorbell-video' }),
]

/** One row of a card's `entities`, in either of the two forms the config takes. */
type Row = string | { entity: string; charging_entity?: string; name?: string; icon?: string }

/**
 * The tablet, with the one thing its state cannot say.
 *
 * Written out rather than folded into the list below, because it is the only row in the whole
 * harness that has to be an object — and it is the row that proves the object form survives a
 * trip through the visual editor.
 */
const TABLET_ROW: Row = { entity: TABLET, charging_entity: 'binary_sensor.tablet_charging' }

/**
 * The named sets, chosen for the layout branch each one lands on rather than for variety.
 *
 * One and two are the captioned row at both footprints; three and four are where the square
 * gives its percentages up and the wide card does not. `awkward` is four again with both
 * unhappy paths in it — a device that has stopped reporting, and one with no icon of its own.
 *
 * `overflow` is six, which is more than either of these footprints draws: four rings and two
 * devices silently undrawn, which is what a config written for the `large` size looks like
 * before that size exists. Worth having on the page precisely because the card is meant to
 * look identical to `four` there.
 */
export const DEVICE_SETS: Record<string, readonly Row[]> = {
  none: [],
  one: [PHONE],
  two: [PHONE, WATCH],
  three: [PHONE, WATCH, EARBUDS],
  four: [PHONE, WATCH, EARBUDS, TABLET_ROW],
  awkward: [PHONE, WATCH, REMOTE, DOORBELL],
  overflow: [PHONE, WATCH, EARBUDS, TABLET_ROW, LAPTOP, DOORBELL],
}

export const DEFAULT_DEVICE_SET = 'four'

export const deviceSet = (name: string): readonly Row[] =>
  DEVICE_SETS[name] ?? DEVICE_SETS[DEFAULT_DEVICE_SET] ?? []
