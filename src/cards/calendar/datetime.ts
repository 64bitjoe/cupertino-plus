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
