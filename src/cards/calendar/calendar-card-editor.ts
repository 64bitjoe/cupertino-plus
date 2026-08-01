import { CupertinoCardEditor } from '../../core/card-editor'
import { defineElement } from '../../core/register'
import type { HaFormSchema } from '../../core/types/ha'
import type { CalendarCardConfig } from './calendar-card'
import { TIME_FORMAT_OPTIONS } from './datetime'
import { remindersEnabled } from './todo-source'

export const CALENDAR_EDITOR_TAG = 'cupertino-widgets-calendar-editor'

/**
 * Partly localised: Home Assistant has a translated string for the calendar list — its own
 * calendar card uses it — and one for the to-do lists, which is the name of its own to-do
 * panel rather than a card label, but it is the same words in the user's language and the
 * alternative is English. There is nothing for the other two rows. `localize` answers an
 * empty string for a key it does not know, which is what the `||`s are for.
 */
const CALENDARS_KEY = 'ui.panel.lovelace.editor.card.calendar.calendar_entities'
const TODO_LISTS_KEY = 'panel.todo'

/**
 * Four rows of the card's own, and it took a detour to get here. (A fifth, **Scale**,
 * arrives from `CupertinoCardEditor` — it belongs to every card in the library, not to
 * this one.)
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
 * What remains is the questions the card cannot answer for itself: where its rows come
 * from, and which clock to print them on. The clock is here for a narrower reason than the
 * entities are — see `TIME_FORMAT_OPTIONS`.
 */
const CLOCK_LABELS: Record<string, string> = {
  system: 'System',
  '12': '12-hour',
  '24': '24-hour',
}

const CALENDARS_ROW: HaFormSchema = {
  name: 'entities',
  /* `filter` is the current spelling. A bare `domain` still works, but only because
     `ha-selector` migrates it on the way in — and it drops a `supported_features`
     sitting beside it while it does, silently. */
  selector: { entity: { multiple: true, filter: { domain: 'calendar' } } },
}

const REMINDERS_ROW: HaFormSchema = {
  name: 'show_reminders',
  selector: { boolean: {} },
}

const TODO_LISTS_ROW: HaFormSchema = {
  name: 'todo_entities',
  selector: { entity: { multiple: true, filter: { domain: 'todo' } } },
}

const CLOCK_ROW: HaFormSchema = {
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
}

/**
 * The calendar card's visual editor.
 *
 * Where the card's rows come from and which clock it draws them on — plus the library-wide
 * **Scale** the base adds. The footprint belongs to the Layout tab, and everything else
 * about how the card is drawn it works out from the box it ends up in and that one factor
 * — see `docs/calendar-widget-rules.md`.
 */
class CupertinoCalendarCardEditor extends CupertinoCardEditor<CalendarCardConfig> {
  /**
   * The to-do picker is only drawn while reminders are on, and being *absent* rather than
   * disabled is the useful half of that.
   *
   * `_valueChanged` writes back exactly the fields the schema names, so a hidden row is a
   * key `applyFormData` does not touch: switching reminders off leaves the lists the user
   * picked sitting in the config, and switching them back on finds them still there. A
   * disabled row would have looked the same and reported `undefined` on the next keystroke
   * anywhere else in the form, quietly emptying the picker it was greying out.
   */
  protected override fields(): readonly HaFormSchema[] {
    return remindersEnabled(this._config?.show_reminders)
      ? [CALENDARS_ROW, REMINDERS_ROW, TODO_LISTS_ROW, CLOCK_ROW]
      : [CALENDARS_ROW, REMINDERS_ROW, CLOCK_ROW]
  }

  /**
   * What a config that says nothing actually does, shown rather than left blank: an unset
   * radio group reads as broken rather than as a default, and a switch parked at off would
   * be saying the opposite of what the card is doing.
   */
  protected override defaults(): Partial<CalendarCardConfig> {
    return { time_format: 'system', show_reminders: true }
  }

  /** The default branches hand the shared rows back to the base — see `CupertinoCardEditor`. */
  protected override label(schema: HaFormSchema): string {
    switch (schema.name) {
      case 'entities':
        return this.hass?.localize(CALENDARS_KEY) || 'Calendars'
      case 'show_reminders':
        return 'Reminders'
      case 'todo_entities':
        return this.hass?.localize(TODO_LISTS_KEY) || 'To-do lists'
      case 'time_format':
        return 'Clock'
      default:
        return super.label(schema)
    }
  }

  protected override helper(schema: HaFormSchema): string | undefined {
    switch (schema.name) {
      case 'entities':
        return 'Leave empty to show every calendar.'
      case 'show_reminders':
        // What "reminder" means here, in the one line there is room for it: a to-do item
        // with a due date. An item with no due date has no day to be drawn on, so a list
        // being shown is not the same as all of it being shown.
        return 'Draw to-do items that have a due date alongside your events.'
      case 'todo_entities':
        return 'Leave empty to read every to-do list.'
      case 'time_format':
        // Worth spelling out: "System" is the Home Assistant profile setting, not the
        // operating system's — and the profile's own detection cannot see, for instance,
        // macOS's 24-hour switch, which is exactly when the other two earn their place.
        return 'System follows your Home Assistant time format. Pick one to override it.'
      default:
        return super.helper(schema)
    }
  }
}

defineElement(CALENDAR_EDITOR_TAG, CupertinoCalendarCardEditor)

export { CupertinoCalendarCardEditor }
