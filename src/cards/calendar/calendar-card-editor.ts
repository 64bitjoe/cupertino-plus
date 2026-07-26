import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { CalendarCardConfig } from './calendar-card'
import { TIME_FORMAT_OPTIONS } from './datetime'

export const CALENDAR_EDITOR_TAG = 'cupertino-widgets-calendar-editor'

/**
 * Not localised: Home Assistant has a translated string for the calendar list — its own
 * calendar card uses it — and none for anything else here, so the rest is English with
 * this comment on it. `localize` answers an empty string for a key it does not know,
 * which is what the `||` is for.
 */
const CALENDARS_KEY = 'ui.panel.lovelace.editor.card.calendar.calendar_entities'

/**
 * Two rows, and it took a detour to get here.
 *
 * There was a `size` row as well: two tiles, Small and Medium, each with a line of copy.
 * It looked like the more helpful editor and was the less helpful one. The sections layout
 * already has a **Layout** tab that sets any footprint by dragging, with the card redrawing
 * as you go; the preset could only offer two of those footprints, it lost to the tab the
 * moment the tab was touched, and the card was choosing its layout from the measured box
 * either way. So the tiles were a second control for something Home Assistant already does
 * better, and the honest fix was to delete them rather than to keep explaining them in a
 * helper line.
 *
 * What remains is the two questions the card cannot answer for itself. The clock is here
 * for a narrower reason than the calendars are — see `TIME_FORMAT_OPTIONS`.
 */
const CLOCK_LABELS: Record<string, string> = {
  system: 'System',
  '12': '12-hour',
  '24': '24-hour',
}

const SCHEMA: readonly HaFormSchema[] = [
  {
    name: 'entities',
    /* `filter` is the current spelling. A bare `domain` still works, but only because
       `ha-selector` migrates it on the way in — and it drops a `supported_features`
       sitting beside it while it does, silently. */
    selector: { entity: { multiple: true, filter: { domain: 'calendar' } } },
  },
  {
    name: 'time_format',
    /* Three options, so `ha-selector` renders radio buttons rather than a dropdown —
       under six is its own threshold, not ours. */
    selector: {
      select: {
        options: TIME_FORMAT_OPTIONS.map(value => ({
          value,
          label: CLOCK_LABELS[value] ?? value,
        })),
      },
    },
  },
]

/**
 * The calendar card's visual editor.
 *
 * Which calendars feed the card, and which clock it draws them on. The footprint belongs
 * to the Layout tab, and everything else about how the card is drawn it works out from the
 * box it ends up in — see `docs/calendar-widget-rules.md`.
 */
class CupertinoCalendarCardEditor extends CupertinoCardEditor<CalendarCardConfig> {
  protected override schema(): readonly HaFormSchema[] {
    return SCHEMA
  }

  /**
   * `system` shown rather than nothing, because that is what a card with no `time_format`
   * actually does — and an unset radio group reads as broken rather than as a default.
   */
  protected override defaults(): Partial<CalendarCardConfig> {
    return { time_format: 'system' }
  }

  protected override label(schema: HaFormSchema): string {
    switch (schema.name) {
      case 'entities':
        return this.hass?.localize(CALENDARS_KEY) || 'Calendars'
      case 'time_format':
        return 'Clock'
      default:
        return schema.name
    }
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    switch (schema.name) {
      case 'entities':
        return 'Leave empty to show every calendar.'
      case 'time_format':
        // Worth spelling out: "System" is the Home Assistant profile setting, not the
        // operating system's — and the profile's own detection cannot see, for instance,
        // macOS's 24-hour switch, which is exactly when the other two earn their place.
        return 'System follows your Home Assistant time format. Pick one to override it.'
      default:
        return undefined
    }
  }
}

defineElement(CALENDAR_EDITOR_TAG, CupertinoCalendarCardEditor)

export { CupertinoCalendarCardEditor }
