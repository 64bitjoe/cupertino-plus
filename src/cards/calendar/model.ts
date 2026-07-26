/**
 * What the calendar widget draws, independent of where it came from.
 *
 * The layout engine (`flow.ts`, `layout.ts`) only ever sees `CalendarItem`, so the data
 * source stays a swappable seam. Two produce these today: `source.ts`, from the
 * `calendar/event/subscribe` websocket, and `demo-data.ts`, for the harness and the card
 * picker. The mapping and the protocol behind it are documented on `source.ts`, which is
 * the only file in the card that knows Home Assistant exists.
 *
 * Still to come: `todo` entities, which is where `kind: 'reminder'` will come from — a
 * to-do item has a `due` and no duration, which is exactly the shape below. Nothing
 * produces one yet, so the reminder rows are reachable only from the fixtures.
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
