/**
 * Calendar arithmetic, done in the *display* timezone rather than the browser's.
 *
 * Home Assistant lets a user pin the frontend to the server's timezone, so "which day
 * is this event on" and "is that tomorrow" have to be answered in that zone — a
 * `Date` alone cannot answer them. Everything here therefore takes an optional
 * `timeZone`; omitting it means the browser's own zone.
 */

import type { FrontendLocaleData } from '../../core/types/ha'

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
 * An integer makes the two things the widget needs — grouping and "how many days
 * from today" — plain arithmetic, with no DST or month-length traps.
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

/** As above, and for the same reason — this one runs per all-day event. */
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
 * When a calendar day begins in the display timezone — the inverse of `dayNumber`.
 *
 * All-day events arrive from Home Assistant as bare `YYYY-MM-DD`, with no zone on them,
 * and turning one into a `Date` is exactly this question. `new Date('2026-07-26')` is
 * the wrong answer: the ECMAScript grammar reads a date-only string as UTC, so anywhere
 * west of Greenwich that instant is still the 25th, and `dayNumber` — which the flow
 * groups by — would file the event under the wrong day.
 *
 * Solved by guessing and correcting rather than by table lookup, because `Intl` will
 * only map an instant to a wall clock, never back. The correction is what earns its
 * keep: the first guess can land on the far side of a DST change, where the offset it
 * assumed no longer holds. One pass is enough for every real zone — a second could only
 * matter where midnight itself is skipped, and no zone in the tz database does that.
 */
export const dayStart = (day: number, timeZone?: string): Date => {
  // The wall clock being asked for, written as though it were UTC.
  const wanted = day * 86_400_000
  const guess = wanted - zoneOffset(wanted, timeZone)
  return new Date(wanted - zoneOffset(guess, timeZone))
}

/**
 * Which locale to format with, and whether that means AM/PM.
 *
 * Mirrors the frontend's own `useAmPm`: `language` follows the user's Home Assistant
 * language, `system` follows the browser, and the other two are explicit. A card that
 * hardcoded 12-hour time would look wrong in half of Europe.
 */
export interface TimePreferences {
  /** `undefined` means "whatever the browser is set to" — the `system` case. */
  locale: string | undefined
  hour12: boolean
}

export const timePreferences = (locale?: FrontendLocaleData): TimePreferences => {
  const format = locale?.time_format ?? 'language'
  // `system` deliberately drops the language, so `Intl` falls back to the browser.
  const language = format === 'system' ? undefined : locale?.language

  if (format === 'language' || format === 'system') {
    // `hourCycle` is what the locale itself prefers — a far steadier signal than
    // formatting a date and looking for the letters "AM" in it, which is what the
    // frontend's own `useAmPm` still does.
    const cycle = new Intl.DateTimeFormat(language, { hour: 'numeric' }).resolvedOptions().hourCycle
    return { locale: language, hour12: cycle === 'h11' || cycle === 'h12' }
  }

  // '12', not 'am_pm': the frontend's enum member is named `am_pm` but its value —
  // the thing that actually arrives in `hass.locale` — is the string "12".
  return { locale: language, hour12: format === '12' }
}
