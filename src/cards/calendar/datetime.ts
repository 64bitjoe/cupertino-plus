/**
 * Calendar arithmetic, done in the *display* timezone rather than the browser's.
 *
 * Home Assistant lets a user pin the frontend to the server's timezone, so "which day
 * is this event on" and "is that tomorrow" have to be answered in that zone: a
 * `Date` alone cannot answer them. Everything here therefore takes an optional
 * `timeZone`; omitting it means the browser's own zone.
 */

/** `Intl.DateTimeFormat` construction is expensive and this runs per render. */
const dayPartsCache = new Map<string, Intl.DateTimeFormat>()

const dayPartsFormatter = (timeZone?: string): Intl.DateTimeFormat => {
  const key = timeZone ?? ''
  let formatter = dayPartsCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    })
    dayPartsCache.set(key, formatter)
  }
  return formatter
}

/**
 * The calendar day a moment falls on, as a count of days since the epoch.
 *
 * An integer makes the two things the widget needs (grouping and "how many days
 * from today") plain arithmetic, with no DST or month-length traps.
 */
export const dayNumber = (date: Date, timeZone?: string): number => {
  let year = 0
  let month = 0
  let day = 0
  for (const part of dayPartsFormatter(timeZone).formatToParts(date)) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
    else if (part.type === 'day') day = Number(part.value)
  }
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

/** As above, and for the same reason: this one runs per all-day event. */
const wallClockCache = new Map<string, Intl.DateTimeFormat>()

const wallClockFormatter = (timeZone?: string): Intl.DateTimeFormat => {
  const key = timeZone ?? ''
  let formatter = wallClockCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // `hour12: false` is not enough: it prints midnight as hour 24 in some engines,
      // which would put the offset a day out. `h23` is the cycle that cannot say 24.
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    })
    wallClockCache.set(key, formatter)
  }
  return formatter
}

/** How far ahead of UTC the zone is at `instant`, in ms. Negative to the west. */
const zoneOffset = (instant: number, timeZone?: string): number => {
  let year = 0
  let month = 0
  let day = 0
  let hour = 0
  let minute = 0
  let second = 0
  for (const part of wallClockFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type === 'year') year = Number(part.value)
    else if (part.type === 'month') month = Number(part.value)
    else if (part.type === 'day') day = Number(part.value)
    else if (part.type === 'hour') hour = Number(part.value)
    else if (part.type === 'minute') minute = Number(part.value)
    else if (part.type === 'second') second = Number(part.value)
  }
  // Read the wall clock back as though it were UTC: the difference from the instant it
  // was formatted from IS the offset.
  return Date.UTC(year, month - 1, day, hour, minute, second) - instant
}

/**
 * When a calendar day begins in the display timezone: the inverse of `dayNumber`.
 *
 * All-day events arrive from Home Assistant as bare `YYYY-MM-DD`, with no zone on them,
 * and turning one into a `Date` is exactly this question. `new Date('2026-07-26')` is
 * the wrong answer: the ECMAScript grammar reads a date-only string as UTC, so anywhere
 * west of Greenwich that instant is still the 25th, and `dayNumber`, which the flow
 * groups by, would file the event under the wrong day.
 *
 * Solved by guessing and correcting rather than by table lookup, because `Intl` will
 * only map an instant to a wall clock, never back. The correction is what earns its
 * keep: the first guess can land on the far side of a DST change, where the offset it
 * assumed no longer holds. One pass is enough for every real zone: a second could only
 * matter where midnight itself is skipped, and no zone in the tz database does that.
 */
export const dayStart = (day: number, timeZone?: string): Date => {
  // The wall clock being asked for, written as though it were UTC.
  const wanted = day * 86_400_000
  const guess = wanted - zoneOffset(wanted, timeZone)
  return new Date(wanted - zoneOffset(guess, timeZone))
}

// ---- The wire ------------------------------------------------------------------

/**
 * A date with no time on it: `2026-07-26`, as opposed to `2026-07-26T09:30:00+02:00`.
 *
 * Both subscriptions the card reads speak this dialect: a calendar event's `start`/`end`
 * and a to-do item's `due` are each either the bare date or a full ISO datetime, so the
 * test lives here rather than in one of them. Home Assistant's own to-do card asks the
 * same question by looking for a `T` in the string; the year/month/day captures are what
 * `parseWireDate` needs anyway, so it is one regex rather than two tests.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether a wire value carries a day and no time: an all-day event, an undated to-do. */
export const isWireDateOnly = (value: unknown): boolean => DATE_ONLY.test(String(value))

/**
 * One wire date as an instant, or nothing if it cannot be read.
 *
 * The two shapes are resolved differently, and only the first of them needs this module:
 * a bare date is a day in the DISPLAY zone, which is what `dayStart` is for, while a
 * datetime is an instant already and goes to `new Date`.
 *
 * That second branch reads the browser's zone for a datetime with no offset on it, which
 * is the one case where a display zone pinned to the server's would disagree, and there
 * is no better answer available: a naive datetime is a wall clock with no zone attached,
 * and the language's own grammar says local. Calendars are safe from it (Home Assistant
 * requires its `CalendarEvent` datetimes to be aware); a to-do's `due` is not, since
 * `todo/item/subscribe` serialises whatever `datetime` the integration stored. Reading it
 * as the browser's local time is what the frontend's own to-do card does with it.
 */
export const parseWireDate = (value: unknown, timeZone: string | undefined): Date | undefined => {
  if (typeof value !== 'string') return undefined

  const dateOnly = DATE_ONLY.exec(value)
  if (dateOnly) {
    const day = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    return dayStart(day / 86_400_000, timeZone)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
