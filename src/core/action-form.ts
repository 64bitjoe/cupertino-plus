/**
 * The rows an editor panel draws for an action, shared by the chip, tile and badge panels.
 *
 * Three copies of the same dropdown and its argument rows lived in three editors until the hold
 * and double tap made it six. The config side of the translation (`actionToForm` and
 * `actionFromForm`) lives in `cards/chips/model.ts`, where a node test can reach it; this is
 * only the drawing, and the two meet on the field names, which a prefix keeps apart: the tap's
 * fields are bare (`action`, `service`), a hold's are `on_hold_action`, `on_hold_service`.
 */

import { ACTION_NAMES } from './actions'
import type { HaFormSchema } from './types/ha'

/**
 * Not `hold_` and `double_tap_`: those would make the hold's dropdown a field called
 * `hold_action`, the same key as the config object it stands for, and a form row holding a
 * string under an object's name is a bug waiting for the first `{ ...config, ...toForm() }`.
 */
export const HOLD_PREFIX = 'on_hold_'
export const DOUBLE_TAP_PREFIX = 'on_double_tap_'

const ACTION_LABELS: Record<string, string> = {
  'more-info': 'Open more-info',
  toggle: 'Toggle it',
  navigate: 'Go to a view',
  back: 'Go back',
  url: 'Open a web page',
  'call-service': 'Call a service',
  assist: 'Open Assist',
  none: 'Nothing',
}

/**
 * A dropdown rather than the radio list `select` would choose for itself: under six options
 * `ha-selector-select` renders radios, and eight of them inside an accordion row is a lot of
 * room. The mode is a statement about the room a control is in.
 */
const ACTION_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: ACTION_NAMES.map(value => ({ value, label: ACTION_LABELS[value] ?? value })),
  },
}

/**
 * One action's dropdown and the argument its chosen action takes, at most one: an action that
 * needs nothing gets no field, and a path is never shown beside a toggle, because a control
 * offering an argument that will be ignored is a control that lies.
 *
 * `templating` swaps the view picker for a text box, because a template cannot be typed into a
 * picker.
 */
export const actionRows = (
  data: Record<string, unknown>,
  templating: boolean,
  prefix = '',
): HaFormSchema[] => {
  const action = data[`${prefix}action`]
  const rows: HaFormSchema[] = [{ name: `${prefix}action`, selector: ACTION_SELECTOR }]
  if (action === 'navigate') {
    rows.push({
      name: `${prefix}navigation_path`,
      selector: templating ? { text: { placeholder: '/lovelace/0' } } : { navigation: {} },
    })
  }
  if (action === 'url') {
    rows.push({
      name: `${prefix}url_path`,
      selector: { text: { placeholder: 'https://example.com' } },
    })
  }
  if (action === 'call-service') {
    rows.push({ name: `${prefix}service`, selector: { text: { placeholder: 'script.goodnight' } } })
  }
  return rows
}

/** The tap's rows, then the hold's, then the double tap's. */
export const allActionRows = (data: Record<string, unknown>, templating: boolean) => [
  ...actionRows(data, templating),
  ...actionRows(data, templating, HOLD_PREFIX),
  ...actionRows(data, templating, DOUBLE_TAP_PREFIX),
]

const ARGUMENT_LABELS: Record<string, string> = {
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
}

const GESTURE_LABELS: Record<string, string> = {
  [HOLD_PREFIX]: 'When held',
  [DOUBLE_TAP_PREFIX]: 'When double-tapped',
}

/**
 * The label for a gesture's field, or undefined for any other field. A hold's argument rows say
 * whose they are ("Path when held"), since three Path boxes in one panel would otherwise read as
 * the same box three times.
 */
export const gestureLabel = (name: string): string | undefined => {
  for (const prefix of [HOLD_PREFIX, DOUBLE_TAP_PREFIX]) {
    if (!name.startsWith(prefix)) continue
    const rest = name.slice(prefix.length)
    if (rest === 'action') return GESTURE_LABELS[prefix]
    const argument = ARGUMENT_LABELS[rest]
    const when = GESTURE_LABELS[prefix]?.replace(/^When /, '')
    return argument && when ? `${argument} when ${when}` : undefined
  }
  return undefined
}

/** Helper text for the two gesture dropdowns, or undefined for any other field. */
export const gestureHelper = (name: string): string | undefined => {
  if (name === `${HOLD_PREFIX}action`) {
    return 'Held for half a second. Leave at Nothing for a press that only ever taps.'
  }
  if (name === `${DOUBLE_TAP_PREFIX}action`) {
    return 'Setting this delays a single tap by a quarter of a second, while it waits for a second.'
  }
  return undefined
}
