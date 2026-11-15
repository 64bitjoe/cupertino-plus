/**
 * Which locale and clock a card formats times in, from the user's Home Assistant profile.
 *
 * Born in the calendar card; here because the weather, complication and live-activity cards
 * print times by the same rule and should not reach into the calendar to do it.
 */

import type { FrontendLocaleData } from './types/ha'

/**
 * Which locale to format with, and whether that means AM/PM.
 *
 * Mirrors the frontend's own `useAmPm`: `language` follows the user's Home Assistant
 * language, `system` follows the browser, and the other two are explicit. A card that
 * hardcoded 12-hour time would look wrong in half of Europe.
 */
export interface TimePreferences {
  /** `undefined` means "whatever the browser is set to": the `system` case. */
  locale: string | undefined
  hour12: boolean
}

/**
 * What a card may say about its clock, over the top of the profile setting.
 *
 * `system` is the default and means "do not interfere": the card follows whatever the
 * Home Assistant profile is set to, which is what every card did before this key existed.
 *
 * The other two exist because the profile's own `system` cannot always be trusted, and
 * not through any fault of ours: the only channel a browser gives us is the resolved
 * locale, and Chrome does not fold macOS's separate "24-Hour Time" switch into it. A user
 * whose browser speaks British English while their Mac is set to AM/PM has no way to be
 * shown AM/PM by detection alone, and this is how they say so.
 */
export const TIME_FORMAT_OPTIONS = ['system', '12', '24'] as const
export type TimeFormatOption = (typeof TIME_FORMAT_OPTIONS)[number]

/**
 * `unknown` rather than `TimeFormatOption`, because YAML is not TypeScript.
 *
 * `time_format: 24` without quotes parses to the NUMBER 24, which is exactly what a user
 * copying the option out of the README would write; comparing that against the string
 * `'24'` fails, so the card would quietly go on using the profile's clock. Coerced instead,
 * which is also what makes a stray `null` from a bare `time_format:` harmless.
 */
export const timePreferences = (
  locale?: FrontendLocaleData,
  override?: unknown,
): TimePreferences => {
  const wanted = override === undefined || override === null ? undefined : String(override)
  const profile = locale?.time_format ?? 'language'
  // The card's own key wins over the profile, and only ever to pin the clock down:
  // `system` is the absence of an opinion rather than an opinion about the browser.
  const format = wanted === '12' || wanted === '24' ? wanted : profile
  /*
   * Which locale to format in is the PROFILE's question, never the override's.
   *
   * Read it off `format` instead and an override stops pinning only the clock: a profile
   * set to `system` hands `Intl` the browser's locale, so the moment a card says `24` the
   * language it is drawn in jumps from the browser's to Home Assistant's; `locale`
   * reaches `widgetDate` and the section headings, not only the times. On a German browser
   * with an English Home Assistant that turns "make this card 24-hour" into SONNTAG
   * becoming SUNDAY and MORGEN becoming TOMORROW, with every printed time identical: a
   * clock control whose only visible effect is to re-language the card.
   */
  const language = profile === 'system' ? undefined : locale?.language

  if (format === 'language' || format === 'system') {
    // `hourCycle` is what the locale itself prefers: a far steadier signal than
    // formatting a date and looking for the letters "AM" in it, which is what the
    // frontend's own `useAmPm` still does. Verified equivalent to it across en-US, en-GB,
    // de-DE, ru-RU, pl-PL and the `-u-hc-` overrides of each, so the two agree on the one
    // thing that could differ: a locale carrying an explicit hour-cycle extension.
    const cycle = new Intl.DateTimeFormat(language, { hour: 'numeric' }).resolvedOptions().hourCycle
    return { locale: language, hour12: cycle === 'h11' || cycle === 'h12' }
  }

  // '12', not 'am_pm': the frontend's enum member is named `am_pm` but its value (the
  // thing that actually arrives in `hass.locale`) is the string "12".
  return { locale: language, hour12: format === '12' }
}
