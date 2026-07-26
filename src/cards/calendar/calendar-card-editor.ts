import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { CalendarCardConfig } from './calendar-card'

export const CALENDAR_EDITOR_TAG = 'cupertino-widgets-calendar-editor'

/**
 * Not localised: Home Assistant has a translated string for the calendar list — its own
 * calendar card uses it — and none for anything else here, so the rest is English with
 * this comment on it. `localize` answers an empty string for a key it does not know,
 * which is what the `||` is for.
 */
const CALENDARS_KEY = 'ui.panel.lovelace.editor.card.calendar.calendar_entities'

/**
 * One row, and it took a detour to get here.
 *
 * There was a `size` row above this: two tiles, Small and Medium, each with a line of
 * copy. It looked like the more helpful editor and was the less helpful one. The sections
 * layout already has a **Layout** tab that sets any footprint by dragging, with the card
 * redrawing as you go; the preset could only offer two of those footprints, it lost to
 * the tab the moment the tab was touched, and the card was choosing its layout from the
 * measured box either way. So the tiles were a second control for something Home
 * Assistant already does better, and the honest fix was to delete them rather than to
 * keep explaining them in a helper line.
 *
 * What remains is the only question the card cannot answer for itself.
 */
const SCHEMA: readonly HaFormSchema[] = [
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
 * Which calendars feed the card, and nothing else: the footprint belongs to the Layout
 * tab, and everything about how the card is drawn it works out from the box it ends up
 * in — see `docs/calendar-widget-rules.md`.
 */
class CupertinoCalendarCardEditor extends CupertinoCardEditor<CalendarCardConfig> {
  protected override schema(): readonly HaFormSchema[] {
    return SCHEMA
  }

  protected override label(schema: HaFormSchema): string {
    switch (schema.name) {
      case 'entities':
        return this.hass?.localize(CALENDARS_KEY) || 'Calendars'
      default:
        return schema.name
    }
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    switch (schema.name) {
      case 'entities':
        return 'Leave empty to show every calendar.'
      default:
        return undefined
    }
  }
}

defineElement(CALENDAR_EDITOR_TAG, CupertinoCalendarCardEditor)

export { CupertinoCalendarCardEditor }
