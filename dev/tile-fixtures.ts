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

import type { HassEntity } from '../src/core/types/ha'
import { FRONT_DOOR, HALL_TEMPERATURE, JOE, KITCHEN_LIGHT, SHED_TEMPERATURE } from './chip-fixtures'

export const GARAGE = 'cover.garage'

export const TILE_STATES: readonly HassEntity[] = [
  {
    entity_id: GARAGE,
    state: 'closed',
    attributes: { friendly_name: 'Garage', device_class: 'garage' },
    last_changed: '2026-08-06T09:00:00.000Z',
    last_updated: '2026-08-06T09:00:00.000Z',
  },
]

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
  unavailable: [SHED_TEMPERATURE, HALL_TEMPERATURE],
}

export const DEFAULT_TILE_SET = 'shortcuts'

export const tileSet = (name: string): readonly unknown[] =>
  TILE_SETS[name] ?? TILE_SETS[DEFAULT_TILE_SET] ?? []
