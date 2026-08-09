/**
 * The mock installation the weather card is shown against, and the named sets the
 * showcase offers.
 *
 * Note where this lives, and why it looks like `complication-entities.ts` rather than
 * `demo-data.ts`: this card's own data is a `hass.states` entity PLUS a websocket
 * subscription (`weather/subscribe_forecast`), never a `CalendarItem`-style fixture the
 * card itself could produce, so a fixture here is a mock entity, its forecast, and the
 * config that points at it — all three belonging to the harness, none of it shipping in
 * the bundle.
 *
 * The field names below are the real ones, not a guess: `datetime` (ISO, with an explicit
 * offset — a real push carries `+00:00`, not `Z`), `condition`, `temperature`, `templow`,
 * `precipitation_probability`, `humidity`. See `docs/ha-api-notes.md`'s "Weather
 * forecasts" entry for where they were checked against a live installation, and
 * `docs/weather-widget-rules.md` §1 for the one mistake this shape invites: `temperature`
 * is a daily entry's HIGH, `templow` its low, and an hourly entry carries no `templow` at
 * all — every hourly object below is built without the key, not with it set to
 * `undefined`, so a card that read it anyway would see exactly what a real hourly push
 * gives it: nothing.
 *
 * Chosen for the branch each entity lands on, the same rule `complication-entities.ts`
 * and `battery-devices.ts` state outright:
 *
 *  - **A full week with real spread**, so a warm day's bar sits visibly right of a cold
 *    one — the single most important check `docs/weather-widget-rules.md` §2 explains.
 *  - **A flat week**, every day the same low and high, so the range bar's zero-spread
 *    guard (`layout.ts`'s `spanFor`) draws a visible mark rather than nothing.
 *  - **A daily-only entity** (`supported_features: 1`), so the hourly strip is absent
 *    rather than empty.
 *  - **A night-time reading** (`state: 'clear-night'`), the one condition Home Assistant
 *    marks explicitly rather than leaving to the card's own inference.
 *  - **An entity that has stopped reporting.**
 */

import type { HassEntity } from '../src/core/types/ha'
import type { ForecastItem } from '../src/cards/weather/source'

const entity = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id: entityId,
  state,
  attributes,
  last_changed: '2026-08-06T09:00:00.000Z',
  last_updated: '2026-08-06T09:00:00.000Z',
})

export const WEATHER_HOME = 'weather.demo_home'
export const WEATHER_CABIN = 'weather.demo_cabin'
export const WEATHER_OFFICE = 'weather.demo_office'
export const WEATHER_LAKE_HOUSE = 'weather.demo_lake_house'
export const WEATHER_OFFLINE = 'weather.demo_offline'

const FORECAST_DAILY = 1
const FORECAST_HOURLY = 2

// ---- Time helpers, relative to whenever the harness happens to run ----------------------

const HOUR_MS = 60 * 60 * 1000

/**
 * ISO-8601 WITH AN EXPLICIT OFFSET, mirroring the wire shape a real forecast push uses
 * (`+00:00`, never `Z`) — see the sample entry in `docs/ha-api-notes.md`'s "Weather
 * forecasts" section. `Date#toISOString` would parse identically, but it writes `Z`,
 * which is not what was seen on the wire.
 */
const isoAt = (date: Date): string => `${date.toISOString().slice(0, 19)}+00:00`

/**
 * The top of the current hour, `hours` forward — exactly the instant `model.ts`'s own
 * `currentHourStart` floors to, so an hourly item built with `hoursFromNow(0)` always
 * survives that filter and lands as the strip's "Now" column, whichever real minute the
 * harness happens to be running in.
 */
const hoursFromNow = (hours: number): Date =>
  new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS + hours * HOUR_MS)

/**
 * A LOCAL day, `days` forward, anchored to a fixed local hour rather than to "now plus
 * N×24h" — a real daily forecast is anchored to a calendar day, not to the moment
 * something happened to ask for it. Local, not UTC, and that is load-bearing: `model.ts`
 * decides which row reads "Today" by comparing this instant's calendar day (in the
 * display timezone) against the browser's own today, and a UTC anchor a few hours either
 * side of midnight would land on the wrong day for a timezone far enough from UTC.
 */
const daysFromNow = (days: number, hour = 4): Date => {
  const at = new Date()
  at.setHours(hour, 0, 0, 0)
  at.setDate(at.getDate() + days)
  return at
}

// ---- Forecasts, one generator per branch --------------------------------------------------

/**
 * A full week, real spread: the week's low is 57° (day 4's low) and its high is 90°
 * (day 0's high), so `weekRange`/`spanFor` have something to actually place a warm day
 * to the right of a cold one against — see `docs/weather-widget-rules.md` §2.
 */
const homeDaily = (): ForecastItem[] => {
  const week = [
    { condition: 'sunny', high: 90, low: 67, precip: 0, humidity: 48 },
    { condition: 'partlycloudy', high: 84, low: 63, precip: 10, humidity: 55 },
    { condition: 'cloudy', high: 78, low: 60, precip: 20, humidity: 64 },
    { condition: 'rainy', high: 71, low: 58, precip: 80, humidity: 88 },
    { condition: 'pouring', high: 68, low: 57, precip: 95, humidity: 92 },
    { condition: 'partlycloudy', high: 75, low: 59, precip: 15, humidity: 66 },
    { condition: 'sunny', high: 88, low: 65, precip: 0, humidity: 50 },
  ] as const

  return week.map((day, offset) => ({
    datetime: isoAt(daysFromNow(offset)),
    condition: day.condition,
    temperature: day.high,
    templow: day.low,
    precipitation_probability: day.precip,
    humidity: day.humidity,
  }))
}

const homeHourly = (): ForecastItem[] => {
  const hours: readonly { condition: string; temperature: number; precip?: number }[] = [
    { condition: 'sunny', temperature: 74, precip: 0 },
    { condition: 'sunny', temperature: 77 },
    { condition: 'sunny', temperature: 81 },
    { condition: 'partlycloudy', temperature: 84 },
    { condition: 'partlycloudy', temperature: 85 },
    { condition: 'cloudy', temperature: 82 },
    { condition: 'cloudy', temperature: 78, precip: 20 },
    { condition: 'rainy', temperature: 74, precip: 60 },
  ]

  return hours.map((hour, index) => ({
    datetime: isoAt(hoursFromNow(index)),
    condition: hour.condition,
    temperature: hour.temperature,
    precipitation_probability: hour.precip ?? 5,
    humidity: 55 + index,
  }))
}

/**
 * Every day the same low AND the same high — the flat-week case `spanFor`'s zero-spread
 * guard exists for (`weekRange` answers a spread of exactly 0), and simultaneously the
 * flat-DAY case its floor-width guard exists for (`high === low` on every row). One
 * fixture reaches both, which is exactly the point: a "flat week" is not a week of
 * distinct-but-similar days, it is a week that gives the bar nothing to measure at all.
 */
const cabinDaily = (): ForecastItem[] =>
  Array.from({ length: 7 }, (_, offset) => ({
    datetime: isoAt(daysFromNow(offset)),
    condition: 'partlycloudy',
    temperature: 72,
    templow: 72,
    precipitation_probability: 0,
    humidity: 58,
  }))

const cabinHourly = (): ForecastItem[] =>
  Array.from({ length: 6 }, (_, index) => ({
    datetime: isoAt(hoursFromNow(index)),
    condition: 'partlycloudy',
    temperature: 72,
    precipitation_probability: 0,
    humidity: 58,
  }))

/** A modest work-week spread — enough that the daily rows (were they ever drawn) would
 * still differ, though this entity's whole point is that they never are: it reports
 * `supported_features: 1`, so nothing subscribes it to `forecast_type: 'hourly'` at all. */
const officeDaily = (): ForecastItem[] => {
  const week = [
    { condition: 'cloudy', high: 73, low: 61, precip: 10, humidity: 60 },
    { condition: 'partlycloudy', high: 76, low: 62, precip: 5, humidity: 56 },
    { condition: 'sunny', high: 80, low: 64, precip: 0, humidity: 50 },
    { condition: 'sunny', high: 82, low: 65, precip: 0, humidity: 48 },
    { condition: 'partlycloudy', high: 77, low: 63, precip: 10, humidity: 58 },
  ] as const

  return week.map((day, offset) => ({
    datetime: isoAt(daysFromNow(offset)),
    condition: day.condition,
    temperature: day.high,
    templow: day.low,
    precipitation_probability: day.precip,
    humidity: day.humidity,
  }))
}

/**
 * A night-time reading. `clear-night` is the one condition Home Assistant marks
 * explicitly (`docs/weather-widget-rules.md` §5) — `conditionIcon` resolves it to the
 * moon glyph directly, with no dependency on `sun.sun` or the clock, so this fixture
 * reads as night in the showcase whatever hour it happens to be built at. The hourly
 * strip carries the same condition for its first couple of columns, then clears to
 * `sunny` — a small dawn, and a chance to see the hourly strip's OWN night inference
 * (`isNightAt`, the clock heuristic future hours use) rather than the shared "Now"
 * boolean the first column always takes.
 */
const lakeHouseDaily = (): ForecastItem[] => {
  const week = [
    { condition: 'clear-night', high: 61, low: 46, precip: 0, humidity: 70 },
    { condition: 'sunny', high: 66, low: 44, precip: 0, humidity: 62 },
    { condition: 'partlycloudy', high: 64, low: 47, precip: 5, humidity: 68 },
    { condition: 'cloudy', high: 59, low: 45, precip: 20, humidity: 75 },
    { condition: 'clear-night', high: 63, low: 43, precip: 0, humidity: 60 },
  ] as const

  return week.map((day, offset) => ({
    datetime: isoAt(daysFromNow(offset)),
    condition: day.condition,
    temperature: day.high,
    templow: day.low,
    precipitation_probability: day.precip,
    humidity: day.humidity,
  }))
}

const lakeHouseHourly = (): ForecastItem[] => {
  const hours = [
    { condition: 'clear-night', temperature: 47 },
    { condition: 'clear-night', temperature: 46 },
    { condition: 'clear-night', temperature: 45 },
    { condition: 'sunny', temperature: 48 },
    { condition: 'sunny', temperature: 54 },
    { condition: 'sunny', temperature: 59 },
  ] as const

  return hours.map((hour, index) => ({
    datetime: isoAt(hoursFromNow(index)),
    condition: hour.condition,
    temperature: hour.temperature,
    precipitation_probability: 0,
    humidity: 65 - index,
  }))
}

/**
 * The mock installation's weather entities.
 *
 * `WEATHER_OFFLINE` carries no `temperature_unit`/`supported_features` at all, the same
 * call `complication-entities.ts`'s `OFFLINE` makes: an entity that has stopped
 * reporting has nothing else to say about itself either.
 */
export const WEATHER_STATES: readonly HassEntity[] = [
  entity(WEATHER_HOME, 'sunny', {
    friendly_name: 'Home',
    temperature: 78,
    temperature_unit: '°F',
    humidity: 52,
    wind_speed: 8,
    supported_features: FORECAST_DAILY | FORECAST_HOURLY,
  }),
  entity(WEATHER_CABIN, 'partlycloudy', {
    friendly_name: 'Cabin',
    temperature: 72,
    temperature_unit: '°F',
    humidity: 58,
    wind_speed: 3,
    supported_features: FORECAST_DAILY | FORECAST_HOURLY,
  }),
  entity(WEATHER_OFFICE, 'partlycloudy', {
    friendly_name: 'Office',
    temperature: 75,
    temperature_unit: '°F',
    humidity: 55,
    wind_speed: 6,
    // Daily only — no bit for hourly, so `supportsForecast` refuses that subscription
    // before it is ever attempted (`docs/weather-widget-rules.md` §3), and the strip is
    // absent rather than empty.
    supported_features: FORECAST_DAILY,
  }),
  entity(WEATHER_LAKE_HOUSE, 'clear-night', {
    friendly_name: 'Lake House',
    temperature: 46,
    temperature_unit: '°F',
    humidity: 71,
    wind_speed: 2,
    supported_features: FORECAST_DAILY | FORECAST_HOURLY,
  }),
  entity(WEATHER_OFFLINE, 'unavailable', {
    friendly_name: 'Garden Sensor',
  }),
]

/** One generator per kind, per entity — `mock-hass.ts` answers `weather/subscribe_forecast`
 * out of these two maps, the same shape its calendar/todo subscriptions already use. */
export const WEATHER_DAILY_FORECASTS: Record<string, () => ForecastItem[]> = {
  [WEATHER_HOME]: homeDaily,
  [WEATHER_CABIN]: cabinDaily,
  [WEATHER_OFFICE]: officeDaily,
  [WEATHER_LAKE_HOUSE]: lakeHouseDaily,
}

export const WEATHER_HOURLY_FORECASTS: Record<string, () => ForecastItem[]> = {
  [WEATHER_HOME]: homeHourly,
  [WEATHER_CABIN]: cabinHourly,
  [WEATHER_LAKE_HOUSE]: lakeHouseHourly,
  // No entry for WEATHER_OFFICE: it never asks (`supported_features` has no hourly bit),
  // so there is nothing here for that request to find even if it somehow did.
}

/**
 * The named sets, chosen for the branch each one lands on rather than for a plausible
 * household — the same rule `complication-entities.ts`'s own `ENTITY_SETS` states.
 * Unlike that card, a weather card only ever points at one entity, so a "set" here is a
 * single id rather than a list.
 */
export const WEATHER_SETS = {
  'full-week': WEATHER_HOME,
  'flat-week': WEATHER_CABIN,
  'daily-only': WEATHER_OFFICE,
  night: WEATHER_LAKE_HOUSE,
  unavailable: WEATHER_OFFLINE,
} as const

export type WeatherSetName = keyof typeof WEATHER_SETS

export const DEFAULT_WEATHER_SET: WeatherSetName = 'full-week'

export const weatherEntity = (name: string): string =>
  WEATHER_SETS[name as WeatherSetName] ?? WEATHER_SETS[DEFAULT_WEATHER_SET]
