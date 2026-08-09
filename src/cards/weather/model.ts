/**
 * What the weather card draws, and how a Home Assistant `weather` entity and its two
 * forecast subscriptions become it.
 *
 * The card element only ever sees a `WeatherView`, the same shape whether the entity
 * behind it is reporting live or has gone quiet — this is the whole of the card's
 * contact with `hass`, the sibling of `complication/model.ts` for a single entity
 * instead of a row of them. Three things are worth stating up front, because the rest
 * of the file exists to enforce them:
 *
 *  - **`temperature` is a daily entry's HIGH, `templow` its low.** `ForecastItem`'s own
 *    comment already names this as the easiest mistake the card can make; this module
 *    is where the mistake would actually land, so every read of a daily item's
 *    `temperature` below is a `high`, never a "current" reading, and every `templow`
 *    is a `low`.
 *  - **Units come off the entity, never off an assumption.** A weather entity's
 *    `temperature_unit` is `°F` on the reference installation this card was checked
 *    against; nothing here converts it, and nothing hardcodes `°C`.
 *  - **A `weather` entity's `state` IS the condition.** Unlike a sensor, there is no
 *    separate `attributes.condition` to read — `sunny`, `cloudy`, `partlycloudy` and
 *    the rest of `condition.ts`'s fifteen arrive as the bare state string, and an
 *    entity that has gone `unavailable`/`unknown` reports that same fact the same way,
 *    which is why `conditionIcon`/`conditionLabel` are handed `entity.state` directly
 *    below rather than a separately-guarded field: their own fallback (the alert glyph,
 *    a humanised label) already draws an unreadable entity rather than a blank one, with
 *    no special-casing needed here to get that.
 *
 * One thing this module does NOT do, unlike `complication/model.ts`: an entity absent
 * from `hass.states` entirely answers `null`, not a dashed placeholder. A complication
 * row still has an id and a config-supplied name to draw a dashed cell for; a weather
 * card has nothing of its own to show at all without the entity — no location, no unit,
 * nothing `readWeather` could put in a `WeatherNow` that would not be a lie. `unavailable`
 * on `WeatherView` is for the entity that exists but is not currently reporting
 * (`state` of `unavailable`/`unknown`), which is the case this module *does* draw rather
 * than drop, in keeping with the rest of the library.
 */

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { dayNumber, timePreferences } from '../calendar/datetime'
import { itemTime, type FormatContext, type TimeToken } from '../calendar/format'
import { conditionIcon, conditionLabel } from './condition'
import type { ForecastItem } from './source'

/** Current conditions: the entity's own state and attributes, formatted. */
export interface WeatherNow {
  location: string
  /** Formatted, unit included. An em dash when the entity has no numeric reading. */
  temperature: string
  condition: string
  /** An MDI path. */
  icon: string
  /** From the daily forecast's first entry, never from attributes — see the module doc. */
  high: string | null
  low: string | null
}

/** One column of the hourly strip. */
export interface WeatherHour {
  /** `"4AM"`, or `"Now"` for the first column once past hours are dropped. */
  label: string
  icon: string
  temperature: string
}

/**
 * One row of the daily forecast.
 *
 * `low`/`high` are carried twice on purpose — once as the raw number, once as the
 * formatted label. Task 5's range bar places every day of a week on one shared scale, so
 * it needs the numbers back to compare and interpolate; parsing `highLabel` to get them
 * would work in `en-US` and quietly break the first time somebody's locale wrote a
 * decimal with a comma. Keeping both means neither side of the card has to know the
 * other's job: the label is for reading, the number is for arithmetic.
 */
export interface WeatherDay {
  /** `"Mon"`, or `"Today"`. */
  label: string
  icon: string
  low: number
  high: number
  lowLabel: string
  highLabel: string
}

export interface WeatherView {
  now: WeatherNow
  hours: WeatherHour[]
  days: WeatherDay[]
  /** The entity's own `state` is `unavailable`/`unknown` — drawn, not dropped. */
  unavailable: boolean
}

const UNAVAILABLE = new Set(['unavailable', 'unknown'])

/** Not localised, like the rest of the library's own marks. Matches the battery card's. */
const VALUE_DASH = '—'

/** A millisecond, named, for the hourly-strip filter below to read as a sentence. */
const HOUR_MS = 60 * 60 * 1000

/**
 * The coarse day/night split used when nothing better is available: see `isNightAt`.
 * Not a sunrise/sunset table — the card has no such data — just a wide, symmetrical
 * window that only gets the two icons that actually change (see `condition.ts`)
 * visibly wrong near the summer/winter extremes of a high latitude, which is an
 * acceptable trade for not needing a location or a sun almanac to draw an icon.
 */
const DAY_START_HOUR = 6
const DAY_END_HOUR = 20

/**
 * The display timezone, mirroring `calendar-card.ts`'s identical `_timeZone` getter:
 * the browser's own zone unless the user has explicitly pinned the frontend to the
 * server's. Inlined rather than imported because that getter lives on a `LitElement`
 * and reads `this.hass`/`this.config`; this module has no element to be one.
 */
const displayTimeZone = (hass: HomeAssistant): string | undefined =>
  hass.locale?.time_zone === 'server' ? hass.config?.time_zone : undefined

/** A numeric attribute, or `null` for anything that is not one (including `undefined`). */
const numberAttr = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * A temperature, formatted through `Intl.NumberFormat` in the user's language and
 * suffixed with the entity's own unit — tight against the numeral, because Home
 * Assistant's `temperature_unit` already carries the degree glyph (`°F`, `°C`), unlike
 * `hPa` or `mph`-shaped units elsewhere in the library that need a space of their own.
 * A missing unit gets no glyph invented for it: appending a bare `°` would still be a
 * guess about what the number means, which is exactly what `readWeather`'s module
 * comment promises not to do.
 */
const formatTemperature = (
  hass: HomeAssistant,
  value: number,
  unit: string | undefined,
): string => {
  const formatted = new Intl.NumberFormat(hass.locale?.language, {
    maximumFractionDigits: 1,
  }).format(value)
  return typeof unit === 'string' && unit !== '' ? `${formatted}${unit}` : formatted
}

// ---- Time labels, reusing the calendar module's own Intl machinery ---------------

/**
 * An hourly forecast column's label combines `itemTime`'s digits and meridiem into one
 * string (`"4PM"`), because the card draws one compact cell rather than the calendar's
 * two-line time-range layout that keeps them apart. `itemTime` (already exported, and
 * already the library's answer to "how does one instant read on the card") is asked for
 * a `point` reading by giving it a bare `start` — an hourly entry has no natural end —
 * and its `TimeToken` is what gets recombined here.
 */
const timeLabel = (token: TimeToken): string => {
  if (!token.meridiem) return token.text
  return token.meridiemFirst ? `${token.meridiem}${token.text}` : `${token.text}${token.meridiem}`
}

/**
 * An hour's label off its own instant: `itemTime` given only a `start` (no `end`, no
 * `allDay`) always answers its `point` case — see `itemTime`'s own branches — so the
 * `''` below is unreachable in practice. It stays rather than a cast past the union: a
 * cast would keep compiling, silently wrong, the day `itemTime` grows a reason to answer
 * `none`/`range` for a bare `start`; this reads the tag instead and degrades to an
 * absent label rather than to a lie about what `itemTime` returned.
 */
const hourLabel = (at: Date, ctx: FormatContext): string => {
  const time = itemTime({ start: at }, ctx)
  return time.kind === 'point' ? timeLabel(time.at) : ''
}

const hourFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * The numeric hour of `date` in `timeZone`, for `isNightAt` below. Neither
 * `calendar/format.ts` nor `calendar/datetime.ts` exposes this — the closest,
 * `dayNumber`, answers "which day", not "which hour" — so this is a small formatter of
 * its own, cached the same way theirs are, rather than a duplicate of either.
 */
const hourOf = (date: Date, timeZone: string | undefined): number => {
  const key = timeZone ?? ''
  let fmt = hourFormatters.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    })
    hourFormatters.set(key, fmt)
  }
  return Number(fmt.format(date))
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>()

/** `"Mon"`, `"Tue"`, … — short, unlike `sectionHeading`'s long weekday. */
const weekdayShort = (
  date: Date,
  locale: string | undefined,
  timeZone: string | undefined,
): string => {
  const key = `${locale}|${timeZone}`
  let fmt = weekdayFormatters.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', ...(timeZone ? { timeZone } : {}) })
    weekdayFormatters.set(key, fmt)
  }
  return fmt.format(date)
}

/**
 * Whether `date` reads as night, purely from the clock — this is the card's own
 * inference, not anything the weather data says (see `condition.ts`'s comment on
 * `NIGHT_ICONS` for why one is needed at all). It is deliberately the only signal used
 * for a forecast hour: `sun.sun`'s `state` is a snapshot of right now and says nothing
 * about whether 2PM tomorrow will be light or dark, so every hourly column — including
 * the current one — reads its own day/night split off its own timestamp rather than off
 * a sun position that cannot answer for it.
 */
const isNightAt = (date: Date, timeZone: string | undefined): boolean => {
  const hour = hourOf(date, timeZone)
  return hour < DAY_START_HOUR || hour >= DAY_END_HOUR
}

/**
 * Whether it is night *right now*, for the current-conditions row only.
 *
 * `sun.sun` is preferred when it exists in `hass.states`, because it is Home
 * Assistant's own answer to exactly this question and is right at every latitude and
 * season the clock-based fallback above is only approximately right at. It is not used
 * for `isNightAt` because it cannot be: `state` is `above_horizon`/`below_horizon` for
 * this instant alone, with no forecast of its own. Absent `sun.sun` (not every
 * installation runs the integration), this falls back to the same clock heuristic every
 * hourly column already uses, so "now" and "the current hour's column" never disagree
 * for the one reason that would be confusing — using two different rules.
 */
const isNightNow = (hass: HomeAssistant, timeZone: string | undefined): boolean => {
  const sun = hass.states['sun.sun']
  if (sun) return sun.state === 'below_horizon'
  return isNightAt(new Date(), timeZone)
}

// ---- The read ----------------------------------------------------------------------

/**
 * The whole of the card's contact with `hass`: everything past this function reads a
 * `WeatherView` and nothing else, the same shape whether `entityId` is happily reporting
 * or has not posted an update in an hour.
 *
 * `daily`/`hourly` are handed in already fetched (`source.ts`'s subscriptions, held and
 * kept fresh by the card element) rather than looked up here, for the same reason
 * `source.ts` never imports this file back: a websocket subscription's lifecycle has
 * nothing in common with turning one snapshot of state into a view, and mixing them
 * would make this function asynchronous for no benefit to anything it actually computes.
 */
export const readWeather = (
  hass: HomeAssistant,
  entityId: string,
  daily: ForecastItem[],
  hourly: ForecastItem[],
): WeatherView | null => {
  const entity: HassEntity | undefined = hass.states[entityId]
  if (!entity) return null

  const unavailable = UNAVAILABLE.has(entity.state)
  const unit =
    typeof entity.attributes.temperature_unit === 'string'
      ? entity.attributes.temperature_unit
      : undefined
  const timeZone = displayTimeZone(hass)
  const { locale, hour12 } = timePreferences(hass.locale)
  const ctx: FormatContext = { locale, timeZone, hour12 }

  const currentTemperature = numberAttr(entity.attributes.temperature)
  const today = daily[0]

  const now: WeatherNow = {
    location: entity.attributes.friendly_name ?? entity.entity_id,
    temperature:
      currentTemperature !== null ? formatTemperature(hass, currentTemperature, unit) : VALUE_DASH,
    condition: conditionLabel(entity.state),
    icon: conditionIcon(entity.state, isNightNow(hass, timeZone)),
    high: today ? formatTemperature(hass, today.temperature, unit) : null,
    low: today?.templow !== undefined ? formatTemperature(hass, today.templow, unit) : null,
  }

  // Past hours are dropped so the strip reads forward from right now rather than from
  // whatever hour the forecast happened to start publishing at (midnight, typically).
  // Compared as instants rather than in any particular timezone's wall clock: an hour
  // boundary is the same instant everywhere, and `datetime` already carries its own
  // offset, so there is no timezone question here at all — only for how the survivors
  // are later labelled.
  const currentHourStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS
  const upcoming = hourly.filter(item => new Date(item.datetime).getTime() >= currentHourStart)

  const hours: WeatherHour[] = upcoming.map((item, index) => {
    const at = new Date(item.datetime)
    const label = index === 0 ? 'Now' : hourLabel(at, ctx)
    return {
      label,
      icon: conditionIcon(item.condition, isNightAt(at, timeZone)),
      temperature: formatTemperature(hass, item.temperature, unit),
    }
  })

  const todayNumber = dayNumber(new Date(), timeZone)
  const days: WeatherDay[] = daily.map(item => {
    const at = new Date(item.datetime)
    const high = item.temperature
    // A daily entry with no `templow` is not one this card has actually seen on a real
    // installation (see `source.ts`'s comment on `ForecastItem`), but the type allows
    // it, and falling back to `high` rather than to `0` or throwing gives exactly the
    // flat, zero-width day `layout.ts`'s `spanFor` already has a floor for — the same
    // degradation a day that is genuinely a single temperature all day would produce.
    const low = item.templow ?? high
    return {
      label: dayNumber(at, timeZone) === todayNumber ? 'Today' : weekdayShort(at, locale, timeZone),
      // Always the daytime glyph: a daily row summarises the whole day, and drawing the
      // moon on it — which `isNightAt` would do for any entry timestamped overnight —
      // would read as "this day is dark", not "here is Tuesday's forecast".
      icon: conditionIcon(item.condition, false),
      low,
      high,
      lowLabel: formatTemperature(hass, low, unit),
      highLabel: formatTemperature(hass, high, unit),
    }
  })

  return { now, hours, days, unavailable }
}
