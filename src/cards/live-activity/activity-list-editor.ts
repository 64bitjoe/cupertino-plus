/**
 * The Live Activity card's list of activities, as one control: a `SortablePanelList`
 * (`core/panel-list.ts`, which has the long arguments) of activity rows.
 *
 * An activity row differs from a tile's by what an activity is. The status entity is the whole point of a row, so there is
 * no blank row to add. And a row has more fields than a tile: the sensors that say how far along
 * the job is, and the state lists that say when it is running. The state lists are behind a
 * switch (`_tuning`), because the defaults are right for most appliances and five extra fields
 * in every panel would make the common case look like work.
 */

import { allActionRows, gestureHelper, gestureLabel } from '../../core/action-form'
import {
  iconSelector,
  SortablePanelList,
  textSelector,
  type PanelSummary,
} from '../../core/panel-list'
import { defineElement } from '../../core/register'
import type {
  EntitySelector,
  HaFormSchema,
  HomeAssistant,
  SelectSelector,
} from '../../core/types/ha'
import { COLOR_CUSTOM, COLOR_SELECTOR } from '../../core/color-form'
import {
  ACTIVITY_FALLBACK_ICON,
  activityFromForm,
  activityIcon,
  activityKeys,
  activityName,
  activityRows,
  activityToForm,
  DEFAULT_DONE_STATES,
  DEFAULT_IDLE_STATES,
  hasTemplates,
  MAX_DONE_MINUTES,
  WHEN_IDLE_INHERIT,
  type ActivityConfig,
} from './model'

export const ACTIVITY_LIST_TAG = 'cupertino-plus-activity-list'

/** The event this element reports with. The detail is the whole list, in order. */
export interface ActivitiesChangedDetail {
  activities: (string | ActivityConfig)[]
}

/**
 * Home Assistant's select selector, with the one key `core/types/ha.ts` does not model:
 * `custom_value`, which lets a value be typed that is not among the options. Declared here as a
 * subtype rather than added to the shared types, because this is the only editor that needs it;
 * it is still a `SelectSelector`, so the form takes it as one.
 */
interface FreeSelectSelector extends SelectSelector {
  select: SelectSelector['select'] & { custom_value: true }
}

/**
 * A state list: the status entity's own states to pick from (an `enum` sensor lists them in
 * `options`, which every appliance this card was built against has), and a free field for the
 * ones it does not list.
 */
const statesSelector = (options: readonly string[]): FreeSelectSelector => ({
  select: {
    multiple: true,
    custom_value: true,
    mode: 'dropdown',
    options: options.map(value => ({ value, label: value })),
  },
})

/** A sensor, any sensor: the shapes are read by `model.ts`, not filtered here. */
const SENSOR: EntitySelector = {
  entity: { filter: { domain: ['sensor', 'input_number', 'number'] } },
}

const WHEN_IDLE_SELECTOR = {
  select: {
    mode: 'dropdown' as const,
    options: [
      { value: WHEN_IDLE_INHERIT, label: 'As the card says' },
      { value: 'hide', label: 'Hide it' },
      { value: 'show', label: 'Show it, dimmed' },
    ],
  },
}

/**
 * One activity's fields, in the order somebody sets one up: what it is (the status entity, and
 * how it looks), then how far along it is (time, progress, phase, steps), then what pressing it
 * does, then, behind the switch, when it counts as running.
 */
const activitySchema = (
  hass: HomeAssistant | undefined,
  config: ActivityConfig,
  data: Record<string, unknown>,
  tuning: boolean,
  templating: boolean,
): readonly HaFormSchema[] => {
  const status = config.entity !== undefined ? hass?.states[config.entity] : undefined
  const options = Array.isArray(status?.attributes.options)
    ? (status.attributes.options as unknown[]).filter((o): o is string => typeof o === 'string')
    : []

  const rows: HaFormSchema[] = [
    { name: 'entity', selector: { entity: {} }, required: true },
    { name: 'name', selector: textSelector(status ? activityName(status) : undefined) },
    // The tiles panel's swap: a template cannot be typed into the icon picker or the colour
    // dropdown, so templating mode makes both plain text boxes.
    templating
      ? { name: 'icon', selector: { text: {} } }
      : { name: 'icon', selector: iconSelector(status ? activityIcon(status) : undefined) },
    templating
      ? { name: 'color', selector: { text: {} } }
      : { name: 'color', selector: COLOR_SELECTOR },
    ...(!templating && data.color === COLOR_CUSTOM
      ? [{ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } }]
      : []),
    { name: 'remaining_entity', selector: SENSOR },
    { name: 'progress_entity', selector: SENSOR },
    { name: 'total_entity', selector: SENSOR },
    { name: 'phase_entity', selector: { entity: {} } },
    { name: 'step_entity', selector: SENSOR },
    ...(typeof data.step_entity === 'string' && data.step_entity !== ''
      ? [
          { name: 'step_total_entity', selector: SENSOR },
          { name: 'step_label', selector: { text: { placeholder: 'Step' } } },
        ]
      : []),
    ...allActionRows(data, templating),
  ]

  // The four fields that only make sense as templates, or as fixed words: they replace what
  // the sensors above would say, so they are offered with the switch rather than beside them.
  if (templating) {
    rows.push(
      { name: 'phase', selector: { text: { placeholder: "{{ states('sensor.stage') }}" } } },
      { name: 'detail', selector: { text: { placeholder: 'Cottons 40°' } } },
      { name: 'remaining', selector: { text: { placeholder: "{{ states('sensor.left') }}" } } },
      {
        name: 'show',
        selector: { text: { placeholder: "{{ is_state('input_boolean.a','on') }}" } },
      },
    )
  }
  rows.push({ name: 'templating', selector: { boolean: {} } })
  rows.push({ name: 'tuning', selector: { boolean: {} } })

  if (tuning) {
    rows.push(
      { name: 'active_states', selector: statesSelector(options) },
      { name: 'idle_states', selector: statesSelector(options) },
      { name: 'done_states', selector: statesSelector(options) },
      {
        name: 'done_minutes',
        selector: { number: { min: 0, max: MAX_DONE_MINUTES, step: 1, mode: 'box' } },
      },
      { name: 'when_idle', selector: WHEN_IDLE_SELECTOR },
    )
  }

  return rows
}

const LABELS: Record<string, string> = {
  entity: 'Status',
  name: 'Name',
  icon: 'Icon',
  color: 'Colour',
  color_custom: 'Custom colour',
  remaining_entity: 'Time left',
  progress_entity: 'Progress',
  total_entity: 'Whole job takes',
  phase_entity: 'Phase',
  step_entity: 'Step',
  step_total_entity: 'Steps in all',
  step_label: 'A step is called',
  action: 'When pressed',
  navigation_path: 'Path',
  url_path: 'Web address',
  service: 'Service',
  tuning: 'Choose which states count',
  templating: 'Use templates',
  phase: 'Phase line',
  detail: 'Supporting text',
  remaining: 'Time left text',
  show: 'Show when',
  active_states: 'Running only in these states',
  idle_states: 'Also idle in these states',
  done_states: 'Also finished in these states',
  done_minutes: 'Show Done for (minutes)',
  when_idle: 'While idle',
}

const HELPERS: Record<string, string> = {
  entity:
    'The sensor that says what the appliance is doing: a washer’s Current status, a printer’s Print status, a litter box’s vacuum entity.',
  name: 'Leave empty for the appliance’s own name.',
  icon: 'Leave empty for a glyph guessed from the appliance.',
  color: 'Tints the glyph, the bar and the ring. Done is always green, a failure always red.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  remaining_entity:
    'How long is left: minutes, hours, 1:05:00, or the time it will finish. Leave empty for no countdown.',
  progress_entity: 'A percentage. Leave empty to work it out from the time left and the whole job.',
  total_entity:
    'How long the whole job takes, for the bar when there is no progress sensor. With neither, there is no bar.',
  phase_entity:
    'A second sensor whose state says more than the status does, such as a printer’s Current stage.',
  step_entity: 'A count of steps done, such as a printer’s current layer.',
  step_total_entity: 'How many steps there are, such as the total layer count.',
  step_label: 'Shown before the number: Layer 120 of 300.',
  action: 'Usually Open more-info. Set to Nothing and the activity is not a button.',
  navigation_path: 'A dashboard path, as the URL bar shows it.',
  url_path: 'Opens in a new tab, or the browser on the companion app.',
  service: 'As domain.service. Its target and data have their own rows below.',
  templating:
    'Swaps the icon and colour pickers for text boxes, and adds four fields, each of which can be a template.',
  phase: 'Replaces the phase line. Until a template answers, the sensors’ own phase shows.',
  detail: 'Replaces the supporting text after the phase, such as the layer.',
  remaining:
    'Replaces the time left. A time (a datetime, 1:05:00, or minutes) is counted down; anything else is printed as written.',
  show: 'Shows the activity while this is true, even when idle, and hides it while false. Until it answers, the activity shows as it would anyway.',
  tuning: 'Most appliances need none of this: off, idle, standby and power off are already idle.',
  active_states:
    'Only these mean running, and everything else is idle. Easier than listing idle states for a device with many, such as a Litter-Robot.',
  idle_states: `Added to the usual: ${DEFAULT_IDLE_STATES.join(', ')}.`,
  done_states: `States that mean it just finished, added to: ${DEFAULT_DONE_STATES.join(', ')}.`,
  done_minutes: 'Leave empty for the card’s own. 0 never shows Done.',
  when_idle: 'Whether this one hides with the rest while it is not running, or stays, dimmed.',
}

const ADD_LABEL = 'Add an activity'

const ADD_HELPER =
  'Pick each appliance’s status sensor, then open its panel to add the time left and the progress. ' +
  'An activity is shown only while its appliance is running, and for a few minutes after.'

class CupertinoActivityList extends SortablePanelList<ActivityConfig> {
  protected readonly eventName = 'activities-changed'
  protected readonly detailKey = 'activities'
  protected readonly addLabel = ADD_LABEL
  protected readonly addHint = ADD_HELPER
  protected readonly emptyText = 'No activities yet. Add an appliance below.'

  /** Which rows show their state lists, by row key: a view of the row, never a config key. */
  private readonly _tuning = new Set<string>()

  /** Open by default for a row that already says something there, so YAML is never hidden. */
  private _isTuning(config: ActivityConfig, key: string): boolean {
    return (
      this._tuning.has(key) ||
      [config.active_states, config.idle_states, config.done_states].some(
        list => list !== undefined && list.length > 0,
      ) ||
      config.done_minutes !== undefined ||
      config.when_idle !== undefined
    )
  }

  protected keysFor(rows: readonly ActivityConfig[]): string[] {
    return activityKeys(rows)
  }

  protected configRows(rows: readonly ActivityConfig[]): (string | ActivityConfig)[] {
    return activityRows(rows)
  }

  /**
   * On by default for a row that already uses any of the four fields or a template, so a config
   * written in YAML opens showing what it says. A plain-text `phase` counts: it is one of the
   * four, and hidden behind a closed switch it would be a field nobody could find to clear.
   */
  protected hasTemplates(config: ActivityConfig): boolean {
    return (
      hasTemplates(config) ||
      [config.phase, config.detail, config.remaining, config.show].some(v => v !== undefined)
    )
  }

  protected toForm(config: ActivityConfig): Record<string, unknown> {
    return activityToForm(config)
  }

  protected fromForm(prior: ActivityConfig, value: Record<string, unknown>): ActivityConfig {
    return activityFromForm(prior, value)
  }

  protected override readViewFields(value: Record<string, unknown>, key: string): void {
    if (typeof value.tuning === 'boolean') {
      if (value.tuning) this._tuning.add(key)
      else this._tuning.delete(key)
    }
    delete value.tuning
  }

  protected override decorateForm(
    data: Record<string, unknown>,
    config: ActivityConfig,
    key: string,
  ): void {
    data.tuning = this._isTuning(config, key)
  }

  /** The state lists and the template switch follow a renamed status entity, as its panel does. */
  protected override renamed(from: string, to: string): void {
    if (this._tuning.delete(from)) this._tuning.add(to)
    if (this._templating.delete(from)) this._templating.add(to)
  }

  /** A copy directly below, its actions and lists cloned so editing one cannot reach the other. */
  protected override clone(source: ActivityConfig): ActivityConfig {
    const copy = super.clone(source)
    if (source.active_states) copy.active_states = [...source.active_states]
    if (source.idle_states) copy.idle_states = [...source.idle_states]
    if (source.done_states) copy.done_states = [...source.done_states]
    return copy
  }

  protected formSchema(
    config: ActivityConfig,
    data: Record<string, unknown>,
    templating: boolean,
  ): readonly HaFormSchema[] {
    return activitySchema(this.hass, config, data, data.tuning === true, templating)
  }

  protected panelSummary(config: ActivityConfig): PanelSummary {
    const status = config.entity !== undefined ? this.hass?.states[config.entity] : undefined
    return {
      header: config.name ?? (status ? activityName(status) : (config.entity ?? 'Activity')),
      secondary: config.entity ?? 'No status entity',
      icon: config.icon ?? (status ? activityIcon(status) : ACTIVITY_FALLBACK_ICON),
    }
  }

  protected fieldLabel(name: string): string {
    return LABELS[name] ?? gestureLabel(name) ?? name
  }

  protected fieldHelper(name: string): string | undefined {
    return HELPERS[name] ?? gestureHelper(name)
  }
}

defineElement(ACTIVITY_LIST_TAG, CupertinoActivityList)

export { CupertinoActivityList }
