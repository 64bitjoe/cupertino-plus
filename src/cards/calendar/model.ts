/**
 * What the calendar widget draws, independent of where it came from.
 *
 * The layout engine (`flow.ts`, `layout.ts`) only ever sees `CalendarItem`, so the data
 * source stays a swappable seam. Three produce these: `source.ts`, from the
 * `calendar/event/subscribe` websocket; `todo-source.ts`, from `todo/item/subscribe`; and
 * `demo-data.ts`, for the harness. The two protocols are documented on those files, which
 * are the only ones in the card that know Home Assistant exists.
 *
 * `kind` is the whole of what the two sources disagree about, and it is a statement about
 * the *thing* rather than about where it came from: an event is a span of a day, a
 * reminder is something you tick off. A to-do item has a `due` and no duration, which is
 * why the shape below fits both without a second interface.
 */

export type CalendarItemKind = 'event' | 'reminder'

export interface CalendarItem {
  /** Stable across re-renders; used as the keyed-render identity. */
  id: string
  /**
   * The `calendar.…` or `todo.…` entity this came out of.
   *
   * Its job is `itemTarget` below: a tap on a reminder opens the list it belongs to, and
   * this is the only thing that says which list that is. It is already the first field of
   * `id` — kept there because the id has to be unique across every subscribed entity — and
   * splitting it back out of that string would mean reading a key for one of its parts,
   * which is the sort of thing that survives until somebody changes the separator.
   */
  entityId: string
  kind: CalendarItemKind
  title: string
  location?: string
  start: Date
  /** Absent for reminders, and for events with no duration. */
  end?: Date
  /**
   * This belongs to a day rather than to a moment: an all-day event, or a to-do due on a
   * date with no time on it. Both print no time and sort to the top of their day.
   */
  allDay?: boolean
  /** The calendar's (or to-do list's) colour, as a CSS colour value. */
  color: string
}

/**
 * Whether an item has been overtaken by the clock.
 *
 * Only a real end time can retire an item. Something without one — a reminder, an
 * all-day entry — stays up for the rest of its day and is dropped by the day filter,
 * not by this: an overdue reminder is still a thing you have to do, and hiding it at
 * the stroke of its due time would be the wrong help.
 */
export const isOver = (item: CalendarItem, now: Date): boolean =>
  item.end !== undefined && item.end.getTime() <= now.getTime()

/**
 * Whether a location line is even on the table for this item.
 *
 * Reminders never get one — a to-do has a place in a list, not a place on a map — so
 * the budget must not reserve a row for one either. Nor does an all-day entry: it is a
 * single line by definition, and there is no expanded form of it to print one on.
 */
export const hasLocation = (item: CalendarItem): boolean =>
  item.kind === 'event' && !item.allDay && Boolean(item.location)

// ---- Where a row goes when it is tapped ------------------------------------

/**
 * The page behind an item: a panel to check for, and a path to go to.
 *
 * `panel` comes back beside the path because a panel only exists while its integration is
 * loaded, and a card has no business landing the user on Home Assistant's not-found page.
 * It is the panel's `url_path`, which is also its key in `hass.panels` — see `PanelInfo` in
 * `core/types/ha.ts` for why presence is asked this way.
 */
export interface ItemTarget {
  panel: string
  path: string
}

/**
 * Two kinds of row, two different things to open.
 *
 * **A reminder opens its own list.** `ha-panel-todo` reads `entity_id` out of the query
 * string on its first update and selects that list, and writes the same parameter back when
 * the user picks one from its menu — so this is the panel's own address for a list rather
 * than a parameter we hope it honours. It also remembers the last list in local storage
 * under `selectedTodoEntity`, which is exactly why the parameter has to be passed: without
 * it the panel opens whichever list the user looked at last, and the row would have been a
 * link to nothing in particular.
 *
 * **An event opens the calendar, and nothing narrower exists.** `ha-panel-calendar` reads
 * nothing at all from the URL — which calendars are shown lives in local storage under
 * `deSelectedCalendars`, and there is no parameter for a date or an event — so `/calendar` is
 * the whole of what can be addressed. It opens on today, which is the day the widget is
 * about, so the gap between this and a deep link is smaller than it looks.
 */
export const itemTarget = (item: CalendarItem): ItemTarget =>
  item.kind === 'reminder'
    ? { panel: 'todo', path: `/todo?entity_id=${encodeURIComponent(item.entityId)}` }
    : { panel: 'calendar', path: '/calendar' }
