/**
 * The mock entities the tiles card is shown against, and the named sets the showcase offers.
 *
 * `chip-fixtures.ts`'s sibling, and mostly its borrower: the entities a tile and a chip both
 * point at are imported from there rather than declared again. A second `sensor.hall_temperature`
 * with a different reading is how the showcase starts lying — the two cards would disagree about
 * the same thermometer, and `mock-hass.ts` would refuse to start rather than pick one.
 *
 * What this file adds is the one entity the chips never needed: a garage door, because the
 * default set reproduces the four cards the tiles card is replacing, and the first of those is a
 * garage. A `cover` is also the domain whose automatic tint (indigo) §9 of the spec flagged as a
 * guess, so the default set photographs exactly the case in question.
 */

import type { HassAreaRegistryEntry, HassEntity } from '../src/core/types/ha'
import { FRONT_DOOR, HALL_TEMPERATURE, JOE, KITCHEN_LIGHT, SHED_TEMPERATURE } from './chip-fixtures'

export const GARAGE = 'cover.garage'

function room(
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes,
    last_changed: '2026-08-06T09:00:00.000Z',
    last_updated: '2026-08-06T09:00:00.000Z',
  }
}

export const TILE_STATES: readonly HassEntity[] = [
  {
    entity_id: GARAGE,
    state: 'closed',
    attributes: { friendly_name: 'Garage', device_class: 'garage' },
    last_changed: '2026-08-06T09:00:00.000Z',
    last_updated: '2026-08-06T09:00:00.000Z',
  },
  ...[
    room('binary_sensor.kitchen_window', 'on', { device_class: 'window' }),
    room('light.den_lamp', 'on'),
    room('light.den_ceiling', 'on'),
    room('binary_sensor.den_presence', 'on', { device_class: 'occupancy' }),
    room('media_player.den_tv', 'playing', { friendly_name: 'Den TV' }),
    room('sensor.den_temperature', '20.6', {
      device_class: 'temperature',
      unit_of_measurement: '°C',
    }),
    room('light.bedroom_lamp', 'off'),
    room('light.kitchen_pendants', 'on'),
    room('light.kitchen_counter', 'on'),
    // The Hall and the Bath, so a `summary_style: icons` row has every kind of glyph to draw:
    // an unlocked lock and an open door, and a leak, which is red and goes first.
    room('lock.hall_door', 'unlocked', { friendly_name: 'Hall Door' }),
    room('binary_sensor.hall_door', 'on', { device_class: 'door' }),
    room('binary_sensor.hall_motion', 'on', { device_class: 'motion' }),
    room('binary_sensor.bath_leak', 'on', { device_class: 'moisture' }),
    room('light.bath_mirror', 'on'),
    room('sensor.bin_day', 'today', { friendly_name: 'Bin Day' }),
    room('sensor.bath_humidity', '64.38', { device_class: 'humidity', unit_of_measurement: '%' }),
  ],
]

/**
 * The rooms the `rooms` set summarises, and which entity sits in which. `mock-hass.ts` builds
 * `hass.areas` and each entity's `area_id` from these, which is all a room summary reads.
 */
export const FIXTURE_AREAS: Record<string, HassAreaRegistryEntry> = {
  kitchen: {
    area_id: 'kitchen',
    name: 'Kitchen',
    icon: 'mdi:fridge-outline',
    temperature_entity_id: HALL_TEMPERATURE,
  },
  den: {
    area_id: 'den',
    name: 'Den',
    icon: 'mdi:television',
    temperature_entity_id: 'sensor.den_temperature',
  },
  bedroom: { area_id: 'bedroom', name: 'Bedroom', icon: 'mdi:bed-outline' },
  hall: { area_id: 'hall', name: 'Hall', icon: 'mdi:door-open' },
  bath: {
    area_id: 'bath',
    name: 'Bathroom',
    icon: 'mdi:water-percent',
    humidity_entity_id: 'sensor.bath_humidity',
  },
}

export const ENTITY_AREAS: Record<string, string> = {
  [KITCHEN_LIGHT]: 'kitchen',
  'binary_sensor.kitchen_window': 'kitchen',
  'light.den_lamp': 'den',
  'light.den_ceiling': 'den',
  'binary_sensor.den_presence': 'den',
  'media_player.den_tv': 'den',
  'sensor.den_temperature': 'den',
  'light.bedroom_lamp': 'bedroom',
  'light.kitchen_pendants': 'kitchen',
  'light.kitchen_counter': 'kitchen',
  'lock.hall_door': 'hall',
  'binary_sensor.hall_door': 'hall',
  'binary_sensor.hall_motion': 'hall',
  'binary_sensor.bath_leak': 'bath',
  'light.bath_mirror': 'bath',
  'sensor.bath_humidity': 'bath',
}

/**
 * The named sets, each named for what it is there to show.
 *
 * `shortcuts` is the four cards being replaced, written the way a user would write them: one
 * entity tile whose reading is a fixed phrase, and three navigation tiles with no entity at all,
 * each coloured by hand because a navigation tile has no entity to guess a colour from. The whole
 * point of the default is comparing against those cards, so it is theirs rather than a set built
 * to hit branches. `entities` is the opposite case — bare ids, every tint automatic — and
 * `unavailable` is the dimmed-and-untinted contract beside a live tile for contrast.
 */
export const TILE_SETS: Record<string, readonly unknown[]> = {
  shortcuts: [
    { entity: GARAGE, name: 'Garage', icon: 'mdi:garage', value: 'All Closed' },
    {
      name: 'Climate',
      icon: 'mdi:snowflake',
      color: 'blue',
      tap_action: { action: 'navigate', navigation_path: '/cat-climate' },
    },
    {
      name: 'Scenes',
      icon: 'mdi:party-popper',
      color: 'purple',
      tap_action: { action: 'navigate', navigation_path: '/scenes' },
    },
    {
      name: 'Cats',
      icon: 'mdi:cat',
      color: 'orange',
      tap_action: { action: 'navigate', navigation_path: '/cat-pets' },
    },
  ],
  entities: [HALL_TEMPERATURE, KITCHEN_LIGHT, FRONT_DOOR, JOE],
  // Room tiles: everything on the state line comes from the area, bar the Bedroom's reading.
  rooms: [
    // The kitchen shows the customising keys: the counter light never counts, the hall lock
    // counts as the kitchen's, and the bins are an icon of the user's own on bin day.
    {
      area: 'kitchen',
      color: 'pink',
      exclude: ['light.kitchen_counter'],
      include: ['lock.hall_door'],
      extras: [
        {
          entity: 'sensor.bin_day',
          state: 'today',
          icon: 'mdi:trash-can',
          color: 'green',
          name: 'Bins Out',
        },
      ],
    },
    { area: 'den', color: 'yellow', summary: ['occupancy', 'temperature', 'lights', 'media'] },
    { area: 'bedroom', color: 'blue', value: 'Asleep', break: true },
    { area: 'hall', color: 'orange' },
    { area: 'bath', color: 'teal', summary: ['alerts', 'humidity', 'lights'] },
  ],
  unavailable: [SHED_TEMPERATURE, HALL_TEMPERATURE],
}

export const DEFAULT_TILE_SET = 'shortcuts'

export const tileSet = (name: string): readonly unknown[] =>
  TILE_SETS[name] ?? TILE_SETS[DEFAULT_TILE_SET] ?? []
