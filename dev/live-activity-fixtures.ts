/**
 * The mock appliances the Live Activity card is shown against, and the named sets the showcase
 * offers.
 *
 * Shaped exactly like the user's own devices, read from their Home Assistant: an LG ThinQ washer
 * and dryer (an `enum` status, a remaining time that is a TIMESTAMP, a total time in minutes), a
 * Bambu printer (a `print_status`, a `current_stage`, a progress percentage, a remaining time in
 * HOURS, a layer and a layer count), an LG dishwasher with nothing on, and a Litter-Robot's
 * vacuum entity. The ids are the real ones, so the YAML the showcase prints is the YAML the user
 * would paste.
 *
 * Times are relative to when the page loaded, so the washer is always 23 minutes from done and
 * the dryer always finished three minutes ago, whenever the showcase is opened.
 */

import type { HassEntity } from '../src/core/types/ha'

const loaded = Date.now()
const MIN = 60_000

const at = (offset: number): string => new Date(loaded + offset).toISOString()

const state = (
  entityId: string,
  value: string,
  attributes: Record<string, unknown> = {},
  changed = at(-40 * MIN),
): HassEntity => ({
  entity_id: entityId,
  state: value,
  attributes,
  last_changed: changed,
  last_updated: changed,
})

const LG_WASHER_STATES = [
  'power_off',
  'initial',
  'detecting',
  'running',
  'rinsing',
  'spinning',
  'end',
]
const BAMBU_STATES = ['failed', 'finish', 'idle', 'init', 'offline', 'pause', 'prepare', 'running']

export const LIVE_ACTIVITY_STATES: readonly HassEntity[] = [
  // The washer, rinsing, 23 minutes from done on a 58-minute cycle.
  state('sensor.front_load_washer_current_status', 'rinsing', {
    friendly_name: 'Front Load Washer Current status',
    device_class: 'enum',
    options: LG_WASHER_STATES,
  }),
  state('sensor.front_load_washer_remaining_time_2', at(23 * MIN), {
    friendly_name: 'Front Load Washer Remaining time',
    device_class: 'timestamp',
  }),
  state('sensor.front_load_washer_total_time', '58', {
    friendly_name: 'Front Load Washer Total time',
    device_class: 'duration',
    unit_of_measurement: 'min',
  }),

  // The dryer, finished three minutes ago.
  state(
    'sensor.dryer_current_status',
    'end',
    { friendly_name: 'Dryer Current status', device_class: 'enum', options: LG_WASHER_STATES },
    at(-3 * MIN),
  ),
  state('sensor.dryer_remaining_time_2', 'unknown', {
    friendly_name: 'Dryer Remaining time',
    device_class: 'timestamp',
  }),

  // The dishwasher, off.
  state('sensor.dishwasher_current_status', 'power_off', {
    friendly_name: 'Dishwasher Current status',
    device_class: 'enum',
    options: ['power_off', 'initial', 'running', 'rinsing', 'drying', 'night_dry', 'end'],
  }),
  state('sensor.dishwasher_progress', '0', {
    friendly_name: 'Dishwasher Progress',
    unit_of_measurement: '%',
  }),

  // The P1S, printing layer 120 of 300, 40% in, 2.4 hours to go.
  state('sensor.p1s_01p00c5b1502493_print_status', 'running', {
    friendly_name: 'Horatio Print status',
    device_class: 'enum',
    options: BAMBU_STATES,
  }),
  state('sensor.p1s_01p00c5b1502493_current_stage', 'printing', {
    friendly_name: 'Horatio Current stage',
    device_class: 'enum',
  }),
  state('sensor.p1s_01p00c5b1502493_print_progress', '40', {
    friendly_name: 'Horatio Print progress',
    unit_of_measurement: '%',
  }),
  state('sensor.p1s_01p00c5b1502493_remaining_time', '2.4', {
    friendly_name: 'Horatio Remaining time',
    device_class: 'duration',
    unit_of_measurement: 'h',
  }),
  state('sensor.p1s_01p00c5b1502493_current_layer', '120', {
    friendly_name: 'Horatio Current layer',
  }),
  state('sensor.p1s_01p00c5b1502493_total_layer_count', '300', {
    friendly_name: 'Horatio Total layer count',
  }),

  // The A1, whose print failed a minute ago.
  state(
    'sensor.a1_03919a3b2303279_print_status',
    'failed',
    { friendly_name: 'A1 Print status', device_class: 'enum', options: BAMBU_STATES },
    at(-1 * MIN),
  ),

  // An X1 that has sat in `finish` for a week, until Home Assistant restarted two minutes ago:
  // its `last_changed` is fresh, its history (below) passes through `unavailable`, and so it
  // must NOT say Done.
  state(
    'sensor.x1c_restarted_print_status',
    'finish',
    { friendly_name: 'X1C Print status', device_class: 'enum', options: BAMBU_STATES },
    at(-2 * MIN),
  ),

  // A Litter-Robot, docked.
  state('vacuum.vlad_litter_box', 'docked', { friendly_name: 'Vlad Litter box' }),
]

const WASHER = {
  entity: 'sensor.front_load_washer_current_status',
  name: 'Washer',
  remaining_entity: 'sensor.front_load_washer_remaining_time_2',
  total_entity: 'sensor.front_load_washer_total_time',
  color: 'blue',
}

const PRINTER = {
  entity: 'sensor.p1s_01p00c5b1502493_print_status',
  name: 'Horatio',
  phase_entity: 'sensor.p1s_01p00c5b1502493_current_stage',
  progress_entity: 'sensor.p1s_01p00c5b1502493_print_progress',
  remaining_entity: 'sensor.p1s_01p00c5b1502493_remaining_time',
  step_entity: 'sensor.p1s_01p00c5b1502493_current_layer',
  step_total_entity: 'sensor.p1s_01p00c5b1502493_total_layer_count',
  step_label: 'Layer',
  color: 'orange',
}

const DRYER = {
  entity: 'sensor.dryer_current_status',
  name: 'Dryer',
  remaining_entity: 'sensor.dryer_remaining_time_2',
}

const A1 = { entity: 'sensor.a1_03919a3b2303279_print_status', name: 'A1' }

const DISHWASHER = {
  entity: 'sensor.dishwasher_current_status',
  name: 'Dishwasher',
  progress_entity: 'sensor.dishwasher_progress',
}

const LITTER = {
  entity: 'vacuum.vlad_litter_box',
  name: 'Vlad',
  active_states: ['cleaning'],
}

const X1C = { entity: 'sensor.x1c_restarted_print_status', name: 'X1C', when_idle: 'show' }

/**
 * Templates, answered by `ACTIVITY_TEMPLATE_RESULTS` below: an idle dishwasher forced into view
 * by `show`, with its own phase line and words where the countdown would be.
 */
const DELAYED_DISHWASHER = {
  entity: 'sensor.dishwasher_current_status',
  name: "{{ 'Dishes' }}",
  icon: 'mdi:dishwasher',
  phase: "{{ 'Waiting for the cheap rate' }}",
  remaining: "{{ 'Starts 1:00' }}",
  show: "{{ is_state('input_boolean.dishwasher_delay','on') }}",
}

/** What the mock template engine answers for the templates above. */
export const ACTIVITY_TEMPLATE_RESULTS: Record<string, string> = {
  "{{ 'Dishes' }}": 'Dishes',
  "{{ 'Waiting for the cheap rate' }}": 'Waiting for the cheap rate',
  "{{ 'Starts 1:00' }}": 'Starts 1:00',
  "{{ is_state('input_boolean.dishwasher_delay','on') }}": 'True',
}

/**
 * The recorder's answer for the appliances whose endings the card asks about, in Home
 * Assistant's minimal-response shape (`s`, and `lu` in seconds): the dryer and the A1 were
 * running until their end states, and the X1C went `finish`, `unavailable`, `finish` across a
 * restart. The window's first row is the state at its start, as the recorder sends it.
 */
export const activityHistory = (
  entityIds: readonly string[],
  start: number,
): Record<string, { s: string; lu: number }[]> => {
  const rows: Record<string, { s: string; lu: number }[]> = {
    'sensor.dryer_current_status': [
      { s: 'running', lu: start / 1000 },
      { s: 'end', lu: (loaded - 3 * MIN) / 1000 },
    ],
    'sensor.a1_03919a3b2303279_print_status': [
      { s: 'running', lu: start / 1000 },
      { s: 'failed', lu: (loaded - 1 * MIN) / 1000 },
    ],
    'sensor.x1c_restarted_print_status': [
      { s: 'finish', lu: start / 1000 },
      { s: 'unavailable', lu: (loaded - 2.2 * MIN) / 1000 },
      { s: 'finish', lu: (loaded - 2 * MIN) / 1000 },
    ],
  }
  return Object.fromEntries(entityIds.flatMap(id => (rows[id] ? [[id, rows[id]]] : [])))
}

export const ACTIVITY_SETS: Record<string, readonly Record<string, unknown>[]> = {
  running: [WASHER, PRINTER, DISHWASHER],
  finished: [WASHER, DRYER, A1, X1C],
  templates: [DELAYED_DISHWASHER, WASHER],
  idle: [DISHWASHER, LITTER],
}

export const DEFAULT_ACTIVITY_SET = 'running'

export const activitySet = (name: string): readonly Record<string, unknown>[] =>
  ACTIVITY_SETS[name] ?? ACTIVITY_SETS[DEFAULT_ACTIVITY_SET] ?? []
