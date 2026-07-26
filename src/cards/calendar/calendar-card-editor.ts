import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import { DEFAULT_SIZE, WIDGET_SIZES, type WidgetSize } from '../../core/size'
import type { HaFormSchema } from '../../core/types/ha'
import type { CalendarCardConfig } from './calendar-card'

export const CALENDAR_EDITOR_TAG = 'cupertino-widgets-calendar-editor'

/**
 * What each footprint is for, in the user's words.
 *
 * A `Record` keyed by `WidgetSize` rather than a hand-written list, so adding a size to
 * `core/size.ts` fails the build here instead of quietly shipping an editor that cannot
 * choose it.
 */
const SIZE_COPY: Record<WidgetSize, { label: string; description: string }> = {
  small: { label: 'Small', description: 'A square. Today, and nothing after it.' },
  medium: { label: 'Medium', description: 'Twice as wide. Today and what follows.' },
}

/**
 * Not localised: Home Assistant has a translated string for the calendar list — its own
 * calendar card uses it — and none for anything else here, so the rest is English with
 * this comment on it. `localize` answers an empty string for a key it does not know,
 * which is what the `||` is for.
 */
const CALENDARS_KEY = 'ui.panel.lovelace.editor.card.calendar.calendar_entities'

const SCHEMA: readonly HaFormSchema[] = [
  {
    name: 'size',
    selector: {
      select: {
        /* Two options would otherwise come out as a pair of radio buttons: `ha-form`
           picks `list` below six options and never picks `box` for you. Tiles earn the
           extra space here because each size has a line explaining what it shows. */
        mode: 'box',
        box_max_columns: 2,
        options: WIDGET_SIZES.map(size => ({ value: size, ...SIZE_COPY[size] })),
      },
    },
  },
  {
    name: 'entities',
    /* `filter` is the current spelling. A bare `domain` still works, but only because
       `ha-selector` migrates it on the way in — and it drops a `supported_features`
       sitting beside it while it does, silently. */
    selector: { entity: { multiple: true, filter: { domain: 'calendar' } } },
  },
]

/**
 * The calendar card's visual editor.
 *
 * Two fields, both of them about what the card is rather than how it is drawn: which
 * calendars feed it, and how much room it asks for. Everything else the card decides
 * for itself from the box it ends up in — see `docs/calendar-widget-rules.md`.
 */
class CupertinoCalendarCardEditor extends CupertinoCardEditor<CalendarCardConfig> {
  protected override schema(): readonly HaFormSchema[] {
    return SCHEMA
  }

  protected override defaults(): Partial<CalendarCardConfig> {
    return { size: DEFAULT_SIZE }
  }

  protected override label(schema: HaFormSchema): string {
    switch (schema.name) {
      case 'size':
        return 'Size'
      case 'entities':
        return this.hass?.localize(CALENDARS_KEY) || 'Calendars'
      default:
        return schema.name
    }
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    switch (schema.name) {
      case 'size':
        /* `hui-card` spreads the user's `grid_options` over whatever `getGridOptions()`
           returned, so once the card has been resized by hand the preset stops deciding
           anything. Saying so beats letting the user click Small and watch nothing
           happen. */
        return this._config?.grid_options
          ? 'The Layout tab is overriding this. Reset the size there to use a preset again.'
          : 'The footprint the card starts at in a sections dashboard. Resizing it there wins.'
      case 'entities':
        return 'Leave empty to show every calendar.'
      default:
        return undefined
    }
  }
}

defineElement(CALENDAR_EDITOR_TAG, CupertinoCalendarCardEditor)

export { CupertinoCalendarCardEditor }
