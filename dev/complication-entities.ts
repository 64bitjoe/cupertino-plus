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
export const EV_CHARGER = 'sensor.demo_ev_charger_power'
export const TEA_TIMER = 'timer.demo_tea'
export const DISHWASHER_END = 'sensor.demo_dishwasher_end'
export const ALARM = 'input_datetime.demo_alarm'
export const NEXT_EVENT = 'calendar.demo_dentist'

/**
 * The countdown fixtures are relative to the moment the page loaded, unlike every other
 * fixture here, because a countdown to a fixed date is either finished or days away by the time
 * anybody looks at it. So the screenshots of these show a ring part-way down, every run.
 */
const LOADED = Date.now()
const at = (offsetMinutes: number): string =>
  new Date(LOADED + offsetMinutes * 60_000).toISOString()
/**
 * A naive date-time as Home Assistant writes one: a wall clock in the SERVER's zone, which is
 * the mock's `config.time_zone` (`mock-hass.ts`), not the browser's — the card reads it there.
 */
const SERVER_ZONE = 'Europe/Warsaw'
const localAt = (offsetMinutes: number): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SERVER_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(LOADED + offsetMinutes * 60_000)
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:00`
}
const changed = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown>,
  minutesAgo: number,
): HassEntity => ({
  ...entity(entityId, state, attributes),
  last_changed: at(-minutesAgo),
  last_updated: at(-minutesAgo),
})

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
  // yellow — tint.ts's BY_DEVICE_CLASS maps power/current/voltage/illuminance and the
  // light domain to yellow. None of the branch-chosen states above land there, and
  // yellow is the one tint whose white-on-tint contrast fails hardest (1.4-1.5:1, see
  // onTintVar in tint.ts), so it is worth a fixture of its own to reach it in the
  // showcase and the shipped screenshots rather than leaving it computationally-checked
  // only.
  entity(EV_CHARGER, '7200', {
    friendly_name: 'EV charger power',
    device_class: 'power',
    unit_of_measurement: 'W',
  }),
  // The four kinds of moment `countdown.ts` counts down to, one each.
  changed(
    TEA_TIMER,
    'active',
    {
      friendly_name: 'Tea',
      icon: 'mdi:timer-outline',
      duration: '0:05:00',
      remaining: '0:05:00',
      finishes_at: at(3.4),
    },
    1.6,
  ),
  changed(
    DISHWASHER_END,
    at(80),
    { friendly_name: 'Dishwasher', icon: 'mdi:dishwasher', device_class: 'timestamp' },
    40,
  ),
  changed(
    ALARM,
    '07:00:00',
    { friendly_name: 'Alarm', icon: 'mdi:alarm', has_date: false, has_time: true },
    600,
  ),
  changed(
    NEXT_EVENT,
    'off',
    {
      friendly_name: 'Personal',
      message: 'Dentist',
      start_time: localAt(135),
      end_time: localAt(180),
    },
    120,
  ),
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
 * card's `doorbell`. `yellow` exists for one reason only: it is the single entity in this
 * file that tints yellow, the worst of the four contrast cases `onTintVar` (`tint.ts`)
 * routes around — nothing else here carries a `power`/`current`/`voltage`/`illuminance`
 * device class or sits in the `light` domain.
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
  yellow: [EV_CHARGER],
  countdowns: [TEA_TIMER, DISHWASHER_END, ALARM, NEXT_EVENT],
  bento: [
    LOUNGE_TEMPERATURE,
    TEA_TIMER,
    PHONE_BATTERY,
    LOUNGE_HUMIDITY,
    OUTSIDE_TEMPERATURE,
    WATER_TANK,
    EV_CHARGER,
    DISHWASHER_END,
    PRESSURE,
    NEXT_EVENT,
  ],
} as const

export type EntitySetName = keyof typeof ENTITY_SETS

export const DEFAULT_ENTITY_SET: EntitySetName = 'four'

export const entitySet = (name: string): readonly string[] =>
  ENTITY_SETS[name as EntitySetName] ?? ENTITY_SETS[DEFAULT_ENTITY_SET]

/**
 * A made-up history for any numeric fixture, in the compressed shape
 * `history/history_during_period` answers with under `minimal_response` (`s` and `lu`, in
 * seconds), so the sparkline has something to draw in the showcase.
 *
 * Deterministic rather than random, so a screenshot is the same on every run: two slow waves
 * per entity, phased by its id, every ten minutes across the window, ending on the entity's
 * live state so the line meets the dot. A temperature drifts by a couple of degrees, a
 * percentage by a few points, a big number by a few per cent of itself.
 */
export const fixtureHistory = (
  states: Record<string, HassEntity>,
  entityIds: readonly string[],
  start: number,
  end: number,
): Record<string, { s: string; lu: number }[]> => {
  const out: Record<string, { s: string; lu: number }[]> = {}
  const step = 10 * 60_000
  for (const id of entityIds) {
    const live = Number(states[id]?.state)
    if (!Number.isFinite(live)) continue
    const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0)
    const swing = Math.max(1.5, Math.abs(live) * 0.06)
    const rows: { s: string; lu: number }[] = []
    for (let t = start; t <= end; t += step) {
      const p = (t - start) / Math.max(1, end - start)
      const wave =
        Math.sin(p * Math.PI * 2 + seed) * 0.7 + Math.sin(p * Math.PI * 5 + seed / 3) * 0.3
      // Fades to zero at the end, so the last point is the live reading.
      const value = live + wave * swing * (1 - p)
      rows.push({ s: value.toFixed(1), lu: t / 1000 })
    }
    out[id] = rows
  }
  return out
}

/**
 * The same made-up history as `recorder/statistics_during_period` answers it: one row per
 * period, its `start` and `end` in epoch milliseconds (a current core's shape) and the mean of
 * the readings inside it. Only entities with a `state_class` have statistics, as in Home
 * Assistant, so the others get nothing and the card falls back to the raw history.
 */
export const fixtureStatistics = (
  states: Record<string, HassEntity>,
  entityIds: readonly string[],
  start: number,
  end: number,
  period: string,
): Record<string, { start: number; end: number; mean: number }[]> => {
  const width = period === 'hour' ? 3_600_000 : 5 * 60_000
  const withClass = entityIds.filter(id => typeof states[id]?.attributes.state_class === 'string')
  const history = fixtureHistory(states, withClass, start, end)
  const out: Record<string, { start: number; end: number; mean: number }[]> = {}
  for (const [id, rows] of Object.entries(history)) {
    const buckets = new Map<number, number[]>()
    for (const row of rows) {
      const from = Math.floor((row.lu * 1000) / width) * width
      buckets.set(from, [...(buckets.get(from) ?? []), Number(row.s)])
    }
    out[id] = [...buckets].map(([from, values]) => ({
      start: from,
      end: from + width,
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    }))
  }
  return out
}
