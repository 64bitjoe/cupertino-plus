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
