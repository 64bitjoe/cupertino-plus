/**
 * The rows an editor panel draws for an action, shared by the chip, tile and badge panels.
 *
 * Three copies of the same dropdown and its argument rows lived in three editors until the hold
 * and double tap made it six. The config side of the translation (`actionToForm` and
 * `actionFromForm`, at the bottom of this file) is plain data a node test can reach; the two
 * meet on the field names, which a prefix keeps apart: the tap's
 * fields are bare (`action`, `service`), a hold's are `on_hold_action`, `on_hold_service`.
 */

import {
  ACTION_NAMES,
  DEFAULT_ACTION,
  serviceOf,
  type ActionConfig,
  type ActionName,
} from './actions'
import { text } from './rows'
import type { HaFormSchema } from './types/ha'
import { isOneOf } from './one-of'

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
    rows.push(
      { name: `${prefix}service`, selector: { text: { placeholder: 'script.goodnight' } } },
      { name: `${prefix}action_target`, selector: { target: {} } },
      { name: `${prefix}action_data`, selector: { object: {} } },
    )
  }
  if (action === 'more-info' || action === 'toggle') {
    rows.push({ name: `${prefix}action_entity`, selector: { entity: {} } })
  }
  if (action === 'assist') {
    rows.push(
      { name: `${prefix}pipeline_id`, selector: { assist_pipeline: {} } },
      { name: `${prefix}start_listening`, selector: { boolean: {} } },
    )
  }
  // Every action that does something can ask first; Home Assistant's own dialog does the asking.
  if (action !== undefined && action !== 'none') {
    rows.push({ name: `${prefix}confirm`, selector: { boolean: {} } })
    if (data[`${prefix}confirm`] === true) {
      rows.push({ name: `${prefix}confirm_text`, selector: { text: {} } })
    }
  }
  return rows
}

/** The tap's rows, then the hold's, then the double tap's. */
export const allActionRows = (data: Record<string, unknown>, templating: boolean) => [
  ...actionRows(data, templating),
  ...actionRows(data, templating, HOLD_PREFIX),
  ...actionRows(data, templating, DOUBLE_TAP_PREFIX),
]

/**
 * Every action field's label, for the tap's rows and, suffixed with whose they are, a hold's and
 * a double tap's ("Path when held").
 */
const ARGUMENT_LABELS: Record<string, string> = {
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
  action_target: 'Target',
  action_data: 'Data',
  action_entity: 'Entity',
  pipeline_id: 'Assistant',
  start_listening: 'Start listening',
  confirm: 'Ask before doing it',
  confirm_text: 'Question',
}

/**
 * The tap's own rows that are left to each editor's words: older than the table above, and every
 * editor already names them.
 */
const EDITOR_NAMED = new Set(['navigation_path', 'url_path', 'service'])

const TAP_HELPERS: Record<string, string> = {
  action_target: 'The entities, devices or areas the service acts on.',
  action_data: 'What the service is given, in YAML. Templates work where the service allows.',
  action_entity: 'Leave empty for its own entity.',
  confirm_text: 'Leave empty for Home Assistant’s own wording.',
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
  return EDITOR_NAMED.has(name) ? undefined : ARGUMENT_LABELS[name]
}

/** Helper text for the two gesture dropdowns, or undefined for any other field. */
export const gestureHelper = (name: string): string | undefined => {
  if (name === `${HOLD_PREFIX}action`) {
    return 'Held for half a second. Leave at Nothing for a press that only ever taps.'
  }
  if (name === `${DOUBLE_TAP_PREFIX}action`) {
    return 'Setting this delays a single tap by a quarter of a second, while it waits for a second.'
  }
  for (const prefix of ['', HOLD_PREFIX, DOUBLE_TAP_PREFIX]) {
    if (name.startsWith(prefix) && TAP_HELPERS[name.slice(prefix.length)]) {
      return TAP_HELPERS[name.slice(prefix.length)]
    }
  }
  return undefined
}

/**
 * An action's form fields, from the config. `prefix` names the gesture (see `HOLD_PREFIX`).
 *
 * `perform-action` shows as Call a service, the same action under Home Assistant's newer name,
 * with its `perform_action` in the Service field; `actionFromForm` writes it back under the name
 * it came in with, so opening the panel does not rename a key nobody touched.
 */
export const actionToForm = (
  action: ActionConfig | undefined,
  entity: string | undefined,
  prefix = '',
): Record<string, unknown> => ({
  [`${prefix}action`]:
    action?.action === 'perform-action'
      ? 'call-service'
      : (action?.action ?? (entity === undefined ? 'none' : DEFAULT_ACTION.action)),
  [`${prefix}navigation_path`]: action?.navigation_path,
  [`${prefix}url_path`]: action?.url_path,
  [`${prefix}service`]: action ? serviceOf(action) : undefined,
  [`${prefix}action_target`]: action?.target,
  [`${prefix}action_data`]: action?.data ?? action?.service_data,
  [`${prefix}action_entity`]: action?.entity,
  [`${prefix}pipeline_id`]: action?.pipeline_id,
  [`${prefix}start_listening`]: action?.start_listening,
  // Undefined rather than false when unset, as every other field of an action that says nothing.
  [`${prefix}confirm`]:
    action?.confirmation !== undefined && action.confirmation !== false ? true : undefined,
  [`${prefix}confirm_text`]:
    typeof action?.confirmation === 'object' ? action.confirmation.text : undefined,
})

/**
 * The hold and double tap, as the panel's fields. Both default to Nothing whatever the entity,
 * because that is what an unconfigured gesture does: neither has a more-info fallback.
 */
export const gesturesToForm = (row: {
  hold_action?: ActionConfig
  double_tap_action?: ActionConfig
}): Record<string, unknown> => ({
  ...actionToForm(row.hold_action, undefined, HOLD_PREFIX),
  ...actionToForm(row.double_tap_action, undefined, DOUBLE_TAP_PREFIX),
})

/**
 * The hold and double tap, folded back. A gesture whose dropdown the form did not draw at all
 * keeps what it had, so a caller passing a partial answer (a test, or an editor without the
 * fields) cannot drop a gesture written in YAML. One left at Nothing writes no key.
 */
export const gesturesFromForm = (
  prior: { hold_action?: ActionConfig; double_tap_action?: ActionConfig },
  data: Record<string, unknown>,
): { hold_action?: ActionConfig; double_tap_action?: ActionConfig } => {
  const gesture = (action: ActionConfig | undefined, prefix: string) =>
    data[`${prefix}action`] === undefined ? action : actionFromForm(action, data, 'none', prefix)
  const hold = gesture(prior.hold_action, HOLD_PREFIX)
  const doubleTap = gesture(prior.double_tap_action, DOUBLE_TAP_PREFIX)
  return {
    ...(hold !== undefined ? { hold_action: hold } : {}),
    ...(doubleTap !== undefined ? { double_tap_action: doubleTap } : {}),
  }
}

/**
 * The three action fields, gathered back into one `tap_action` — or into nothing at all.
 *
 * Two decisions worth stating. **The argument fields are read only for the action that owns
 * them**: a `navigation_path` left over from a row that used to navigate does not ride along
 * inside a `toggle`, because a config carrying an argument its action cannot use is a config
 * that reads as a bug the next time somebody opens the YAML tab.
 *
 * And **a bare action matching `bareDefault` is written as no `tap_action` at all**, because
 * that is what leaving the row unconfigured already means — `DEFAULT_ACTION` (more-info) for a
 * chip with an entity, `NO_TARGET_ACTION` (none, via `chipFromForm`'s own `bareDefault`) for
 * one without. The alternative — showing that default in the dropdown, as we must, and then
 * writing it through on the first unrelated edit — would put a `tap_action` on every chip in a
 * config the moment its owner touched one name.
 */
/** A non-empty plain object, or undefined: an emptied YAML box or target picker writes nothing. */
const objectOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as object).length > 0
    ? (value as Record<string, unknown>)
    : undefined

/**
 * The Ask-first switch and its Question, folded back. Off writes nothing; on with no question is
 * `true`, Home Assistant's own wording; a question keeps the rest of a prior dialog (its title,
 * button words and exemptions), which the panel does not draw but must not lose.
 */
const confirmationFrom = (
  prior: ActionConfig['confirmation'],
  data: Record<string, unknown>,
  prefix: string,
): ActionConfig['confirmation'] => {
  if (data[`${prefix}confirm`] !== true) return undefined
  const question = text(data[`${prefix}confirm_text`])
  const rest = typeof prior === 'object' ? prior : {}
  const { text: _old, ...others } = rest
  if (question !== undefined) return { ...others, text: question }
  return Object.keys(others).length > 0 ? others : true
}

export const actionFromForm = (
  prior: ActionConfig | undefined,
  data: Record<string, unknown>,
  bareDefault: ActionName,
  prefix = '',
): ActionConfig | undefined => {
  const field = (name: string) => text(data[`${prefix}${name}`])
  const named = field('action')
  // An action the dropdown does not offer (`fire-dom-event`, or one a later Home Assistant adds)
  // shows as itself and comes back as itself: the panel cannot edit it, so it must not replace it.
  if (prior && named === prior.action && !isOneOf(ACTION_NAMES, named)) {
    return prior
  }
  const action: ActionName = isOneOf(ACTION_NAMES, named ?? '')
    ? (named as ActionName)
    : bareDefault

  // Written back under the name it came in with: see `actionToForm`.
  const renamed = action === 'call-service' && prior?.action === 'perform-action'
  const next: ActionConfig = { action: renamed ? 'perform-action' : action }

  // Each field is read only for the actions `actionRows` draws it beside, since the form always
  // carries the key; for any other action the config's own value rides through untouched.
  const picksEntity = action === 'more-info' || action === 'toggle'
  const entity = picksEntity ? field('action_entity') : prior?.entity
  if (entity !== undefined) next.entity = entity
  if (action !== 'none') {
    const confirmation = confirmationFrom(prior?.confirmation, data, prefix)
    if (confirmation !== undefined) next.confirmation = confirmation
  }

  if (action === 'navigate') {
    const path = field('navigation_path')
    if (path !== undefined) next.navigation_path = path
  }

  if (action === 'url') {
    const url = field('url_path')
    if (url !== undefined) next.url_path = url
  }

  if (action === 'call-service') {
    const service = field('service')
    if (service !== undefined) {
      if (renamed) next.perform_action = service
      else next.service = service
    }
    const target = objectOf(data[`${prefix}action_target`])
    if (target !== undefined) next.target = target
    // Back under the name it came in with: `actionToForm` shows `service_data` in the same box.
    const payload = objectOf(data[`${prefix}action_data`])
    if (payload !== undefined) {
      if (prior?.data === undefined && prior?.service_data !== undefined) {
        next.service_data = payload
      } else next.data = payload
    }
    // The box shows `data` when a config has both; the older key rides through, unseen but kept.
    if (prior?.data !== undefined && prior.service_data !== undefined) {
      next.service_data = prior.service_data
    }
  }

  if (action === 'assist') {
    const pipeline = field('pipeline_id')
    if (pipeline !== undefined) next.pipeline_id = pipeline
    if (data[`${prefix}start_listening`] === true) next.start_listening = true
  }

  return action === bareDefault && Object.keys(next).length === 1 ? undefined : next
}
