import { html, nothing, type TemplateResult } from 'lit'

import { CupertinoCardEditor } from '../../core/card-editor'
import { PANEL_DEFAULT_CONTAINER } from '../../core/container'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { ComplicationCardConfig } from './complication-card'
// Imported for the side effect as well as the type: the list element has to be defined by the
// time this editor renders it.
import './complication-list-editor'
import type { ComplicationsChangedDetail } from './complication-list-editor'
import { entityConfigs } from './model'
import { complicationFields } from './fields'
import { DEFAULT_SPARKLINE_HOURS, sparklineHoursFor } from './history'
import { DEFAULT_STYLE } from './style'
import { DEFAULT_LAYOUT, layoutFor } from './bento'

export const COMPLICATION_EDITOR_TAG = 'cupertino-plus-complication-editor'

/** The card's on/off rows, which write nothing when off. */
const SWITCHES = ['sparkline', 'countdown'] as const

const LABELS: Record<string, string> = {
  entities: 'Entities',
  style: 'Style',
  layout: 'Layout',
  sparkline: 'Show recent history',
  sparkline_hours: 'History to show',
  countdown: 'Count down to times',
  countdown_hours: 'Drain the ring over',
  min: 'Minimum',
  max: 'Maximum',
  color: 'Colour',
  container: 'Background',
}

const HELPERS: Record<string, string> = {
  layout:
    'Bento gives each entity a rounded cell of its own: the first large, the rest small, unless you choose a size in its row above.',
  style:
    'Circular faces tile like watch complications; rectangular ones stack full width, and inline is one line each. In bento, this is the face small cells wear.',
  sparkline:
    'A small line of how each reading has moved, beside it, like the Stocks widget. Only for readings that are numbers.',
  sparkline_hours: 'How far back the line reaches, in hours.',
  countdown:
    'Timers, timestamp sensors, date-and-time helpers and calendars show the time left, with a ring that drains like the Timer complication. Other entities are unchanged.',
  countdown_hours:
    'Leave blank to drain from when the time was set. A timer always drains over its own duration.',
  min: 'Leave blank and the range comes from the entity. Fill both in to gauge something with no natural range, like room temperature.',
  max: 'Leave blank and the range comes from the entity. Fill both in to gauge something with no natural range, like room temperature.',
  color: 'From what the entity measures. Set one only to overrule it.',
}

/**
 * The complication card's visual editor.
 *
 * Above the form, the entity list (`complication-list-editor.ts`): one panel per entity with its
 * name, icon, colour and range overrides, what a tap, a hold and a double tap do, and — behind
 * **Use templates** — Jinja templates for the name, icon, reading and supporting line. Below it,
 * the card's own rows (`fields.ts`): the face, the history sparkline and its hours, counting down
 * and its span, a card-wide range and colour, the background, and the library-wide **Scale**.
 * A row appears only where it does something, so the sparkline's hours show only once a line
 * will actually be drawn. There is deliberately no `size` row: the Layout tab sets the footprint
 * by dragging, with `getGridOptions()` setting the floor beneath it.
 */
class CupertinoComplicationCardEditor extends CupertinoCardEditor<ComplicationCardConfig> {
  /** Read off the config `render` is about to hand `ha-form`, so schema and data agree. */
  protected override fields(): readonly HaFormSchema[] {
    return complicationFields(this._config ?? {})
  }

  /**
   * A style shown rather than an empty dropdown: an unset control reads as broken, not as a
   * default. The first edit writes it through, which is what HA's own editors do.
   */
  protected override defaults(): Partial<ComplicationCardConfig> {
    return {
      layout: DEFAULT_LAYOUT,
      style: DEFAULT_STYLE,
      container: PANEL_DEFAULT_CONTAINER,
      sparkline: false,
      countdown: false,
      sparkline_hours: DEFAULT_SPARKLINE_HOURS,
    }
  }

  protected override label(schema: HaFormSchema): string {
    return LABELS[schema.name] ?? super.label(schema)
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    return HELPERS[schema.name] ?? super.helper(schema)
  }

  /**
   * The form's answer, with a switch left off written as no key: `sparkline: false` says what
   * its absence says, and a config should not grow keys because somebody opened the dialog.
   */
  protected override fromForm(
    config: ComplicationCardConfig,
    data: Record<string, unknown>,
    fields: readonly string[],
  ): ComplicationCardConfig {
    const next = super.fromForm(config, data, fields)
    for (const key of SWITCHES) if (next[key] === false) delete next[key]
    // One panel is what a config without the key already draws.
    if (next.layout === DEFAULT_LAYOUT) delete next.layout
    return next
  }

  /**
   * The entity list, drawn above the form as a control of its own: each row is a small config
   * (name, icon, colour, range, templates and three gestures) that `ha-entities-picker` could
   * only ever report as a bare id. The same answer the tiles and battery editors reach.
   */
  protected override beforeForm(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing
    return html`
      <cupertino-plus-complication-list
        .hass=${this.hass}
        .rows=${entityConfigs(this._config.entities)}
        .card=${{
          layout: layoutFor(this._config.layout),
          style: this._config.style ?? DEFAULT_STYLE,
          sparkline: this._config.sparkline === true,
          sparklineHours: sparklineHoursFor(this._config.sparkline_hours),
          countdown: this._config.countdown === true,
        }}
        @complications-changed=${this._entitiesChanged}
      ></cupertino-plus-complication-list>
    `
  }

  /** The list reported. An empty one drops the key rather than writing `entities: []`. */
  private readonly _entitiesChanged = (event: CustomEvent<ComplicationsChangedDetail>): void => {
    event.stopPropagation()
    if (!this._config) return
    const next: ComplicationCardConfig = { ...this._config }
    if (event.detail.entities.length === 0) delete next.entities
    else next.entities = event.detail.entities
    this.emitConfig(next)
  }
}

defineElement(COMPLICATION_EDITOR_TAG, CupertinoComplicationCardEditor)

export { CupertinoComplicationCardEditor }
