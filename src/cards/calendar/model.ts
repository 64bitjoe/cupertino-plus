/**
 * What the calendar widget draws, independent of where it came from.
 *
 * The layout engine (`flow.ts`, `layout.ts`) only ever sees `CalendarItem`, so the
 * data source stays a swappable seam: today it is `demo-data.ts`, next it will be the
 * `calendar/event/subscribe` websocket (see `docs/ha-api-notes.md`) plus `todo`
 * entities for reminders.
 *
 * Mapping notes for when that lands:
 *  - a Home Assistant calendar event has `summary` / `location` / `start` / `end`,
 *    where an all-day event carries plain `YYYY-MM-DD` dates and `end` is exclusive;
 *  - a `todo` item has `due` and no duration — that is exactly `kind: 'reminder'`;
 *  - `color` is resolved per calendar entity, the way the frontend's own helper does
 *    it: the registry colour if the user set one, else a palette colour by index.
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
 * the budget must not reserve a row for one either.
 */
export const hasLocation = (item: CalendarItem): boolean =>
  item.kind === 'event' && Boolean(item.location)
