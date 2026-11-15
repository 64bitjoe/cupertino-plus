import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import {
  FLOATING_CONTAINER_FIELD,
  FLOATING_CONTAINER_HELPER,
  FLOATING_DEFAULT_CONTAINER,
} from '../../core/container'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import { COLOR_CUSTOM, COLOR_SELECTOR, foldColor, splitColor } from '../../core/color-form'
import type { LiveActivityCardConfig } from './live-activity-card'
// Imported for the side effect as well as the type: the list element has to be defined by the
// time this editor renders it.
import './activity-list-editor'
import type { ActivitiesChangedDetail } from './activity-list-editor'
import {
  activityConfigs,
  ACTIVITY_STYLES,
  ACTIVITY_TIMES,
  DEFAULT_DONE_MINUTES,
  DEFAULT_IDLE_MESSAGE,
  DEFAULT_SECONDS,
  DEFAULT_STYLE,
  DEFAULT_TIME,
  DEFAULT_WHEN_IDLE,
  MAX_DONE_MINUTES,
  SECONDS_MODES,
  WHEN_IDLE,
} from './model'

export const LIVE_ACTIVITY_EDITOR_TAG = 'cupertino-plus-live-activity-editor'

const STYLE_LABELS: Record<string, string> = {
  expanded: 'Lock Screen — large time, a bar across',
  compact: 'Dynamic Island — a slim pill with a ring',
}

const TIME_LABELS: Record<string, string> = {
  remaining: 'Time left',
  finish: 'Time it finishes',
  both: 'Both',
}

const SECONDS_LABELS: Record<string, string> = {
  never: 'Never',
  hour: 'In the last hour',
  ten_minutes: 'In the last 10 minutes',
}

const WHEN_IDLE_LABELS: Record<string, string> = {
  hide: 'Hide the card',
  message: 'Say nothing is running',
  show: 'Show every activity, dimmed',
}

const dropdown = (values: readonly string[], labels: Record<string, string>) => ({
  select: {
    mode: 'dropdown' as const,
    options: values.map(value => ({ value, label: labels[value] ?? value })),
  },
})

/**
 * How the activities look, then what happens when nothing is running, then the colour and the
 * background every card in the library asks about. The message box is offered only when there
 * is a message to show, as the tiles editor offers its custom colour box.
 */
const fields = (data: Record<string, unknown>): readonly HaFormSchema[] => [
  { name: 'style', selector: dropdown(ACTIVITY_STYLES, STYLE_LABELS) },
  { name: 'time', selector: dropdown(ACTIVITY_TIMES, TIME_LABELS) },
  // Seconds are a countdown's, and a card showing finish times has none to show them in.
  ...(data.time === 'finish'
    ? []
    : [{ name: 'seconds', selector: dropdown(SECONDS_MODES, SECONDS_LABELS) }]),
  { name: 'when_idle', selector: dropdown(WHEN_IDLE, WHEN_IDLE_LABELS) },
  ...(data.when_idle === 'message'
    ? [{ name: 'idle_message', selector: { text: { placeholder: DEFAULT_IDLE_MESSAGE } } }]
    : []),
  {
    name: 'done_minutes',
    selector: { number: { min: 0, max: MAX_DONE_MINUTES, step: 1, mode: 'box' as const } },
  },
  { name: 'color', selector: COLOR_SELECTOR },
  ...(data.color === COLOR_CUSTOM
    ? [{ name: 'color_custom', selector: { text: { placeholder: '#ff8800' } } }]
    : []),
  FLOATING_CONTAINER_FIELD,
]

const LABELS: Record<string, string> = {
  style: 'Style',
  time: 'Show',
  seconds: 'Show seconds',
  when_idle: 'When nothing is running',
  idle_message: 'Message',
  done_minutes: 'Show Done for (minutes)',
  color: 'Activity colour',
  color_custom: 'Custom colour',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  style:
    'Lock Screen is a panel per activity with the time set large. Dynamic Island fits one on a line.',
  time: 'What the trailing edge says while a job runs. Both puts the finish time under the countdown.',
  seconds:
    'Counts down as 23:05, second by second, like the Timer. Only while the card is on screen.',
  when_idle:
    'Hiding is what a Live Activity does: the card is there only while something is. It still shows while you edit it.',
  idle_message: 'The quiet line shown in its place.',
  done_minutes:
    'How long a finished job says Done before it goes away. 0 never shows it. An activity can say otherwise.',
  color: 'Tints every activity. An activity can say otherwise in its own panel above.',
  color_custom: 'Any CSS colour: a hex value, an rgb(), or a var() from your theme.',
  container: FLOATING_CONTAINER_HELPER,
}

/**
 * The Live Activity card's visual editor: the activity list, then the card-level questions,
 * then the **Scale** every card shares. The tiles editor's shape, for its reasons; the colour
 * dropdown and its custom box are folded together the way that editor folds them.
 */
class CupertinoLiveActivityCardEditor extends CupertinoCardEditor<LiveActivityCardConfig> {
  /** See the tiles editor's `_colorCustom`. */
  private _colorCustom = false

  protected override fields(): readonly HaFormSchema[] {
    return fields(this._config ? { ...this.defaults(), ...this.toForm(this._config) } : {})
  }

  protected override defaults(): Partial<LiveActivityCardConfig> {
    return {
      style: DEFAULT_STYLE,
      time: DEFAULT_TIME,
      seconds: DEFAULT_SECONDS,
      when_idle: DEFAULT_WHEN_IDLE,
      done_minutes: DEFAULT_DONE_MINUTES,
      container: FLOATING_DEFAULT_CONTAINER,
    }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }

  protected override toForm(config: LiveActivityCardConfig): Record<string, unknown> {
    const data: Record<string, unknown> = { ...config }
    this._colorCustom = splitColor(data, this._colorCustom)
    return data
  }

  protected override fromForm(
    config: LiveActivityCardConfig,
    data: Record<string, unknown>,
    formFields: readonly string[],
  ): LiveActivityCardConfig {
    const folded = { ...data }
    this._colorCustom = foldColor(folded)
    // A message left behind when the choice moves off `message` would be YAML that does nothing.
    const next = super.fromForm(config, folded, formFields)
    if (next.when_idle !== 'message') delete next.idle_message
    return next
  }

  protected override beforeForm(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing
    return html`
      <cupertino-plus-activity-list
        .hass=${this.hass}
        .rows=${activityConfigs(this._config.activities)}
        @activities-changed=${this._activitiesChanged}
      ></cupertino-plus-activity-list>
    `
  }

  /** The list reported. An empty one drops the key rather than writing `activities: []`. */
  private readonly _activitiesChanged = (event: CustomEvent<ActivitiesChangedDetail>): void => {
    event.stopPropagation()
    if (!this._config) return
    const next: LiveActivityCardConfig = { ...this._config }
    if (event.detail.activities.length === 0) delete next.activities
    else next.activities = event.detail.activities
    this.emitConfig(next)
  }
}

defineElement(LIVE_ACTIVITY_EDITOR_TAG, CupertinoLiveActivityCardEditor)

export { CupertinoLiveActivityCardEditor }
