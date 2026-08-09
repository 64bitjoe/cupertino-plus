/**
 * A Home Assistant weather `condition` to the glyph and the word it reads as.
 *
 * Home Assistant defines exactly fifteen conditions and treats them as a closed set —
 * every weather integration is expected to report one of these fifteen strings and
 * nothing else. `conditionIcon` and `conditionLabel` still take a plain `string` rather
 * than the union, because the guarantee is Home Assistant's to keep, not this card's:
 * an integration that drifts from the platform's own enum should get a visible "we
 * don't recognise this" glyph on the dashboard, not a crash in the render loop.
 */

import {
  mdiAlertCircleOutline,
  mdiWeatherCloudy,
  mdiWeatherFog,
  mdiWeatherHail,
  mdiWeatherLightning,
  mdiWeatherLightningRainy,
  mdiWeatherNight,
  mdiWeatherNightPartlyCloudy,
  mdiWeatherPartlyCloudy,
  mdiWeatherPouring,
  mdiWeatherRainy,
  mdiWeatherSnowy,
  mdiWeatherSnowyRainy,
  mdiWeatherSunny,
  mdiWeatherWindy,
  mdiWeatherWindyVariant,
} from '@mdi/js'

/**
 * The fifteen conditions Home Assistant's weather integrations are contracted to emit,
 * carried as a runtime array — rather than just the type below — because Task 4's model
 * needs something it can iterate or validate against, and a `type` alone gives it
 * nothing to check a live string against at runtime.
 */
export const CONDITIONS = [
  'clear-night',
  'cloudy',
  'exceptional',
  'fog',
  'hail',
  'lightning',
  'lightning-rainy',
  'partlycloudy',
  'pouring',
  'rainy',
  'snowy',
  'snowy-rainy',
  'sunny',
  'windy',
  'windy-variant',
] as const

export type WeatherCondition = (typeof CONDITIONS)[number]

/**
 * The daytime glyph for every condition Home Assistant defines. `exceptional` has no
 * sensible pictogram — it is the integration's own escape hatch for "something outside
 * this enum happened" — so it shares the alert glyph with conditions this table has
 * never heard of at all, rather than inventing a false sense of "we drew something for
 * this" that isn't backed by an actual reading.
 */
const ICONS: Record<WeatherCondition, string> = {
  'clear-night': mdiWeatherNight,
  cloudy: mdiWeatherCloudy,
  exceptional: mdiAlertCircleOutline,
  fog: mdiWeatherFog,
  hail: mdiWeatherHail,
  lightning: mdiWeatherLightning,
  'lightning-rainy': mdiWeatherLightningRainy,
  partlycloudy: mdiWeatherPartlyCloudy,
  pouring: mdiWeatherPouring,
  rainy: mdiWeatherRainy,
  snowy: mdiWeatherSnowy,
  'snowy-rainy': mdiWeatherSnowyRainy,
  sunny: mdiWeatherSunny,
  windy: mdiWeatherWindy,
  'windy-variant': mdiWeatherWindyVariant,
}

/**
 * The conditions that actually change glyph after dark, which is not the same set as
 * "every condition the card might render at night". `clear-night` is the only string
 * Home Assistant itself varies by time of day — a sunny noon and a clear midnight are
 * two different `state` values on the wire. Everything else, including `partlycloudy`,
 * is reported identically at 2pm and 2am; the integration has no notion of a night
 * version of "cloudy" or "rainy" to report. So the day/night split below is the card's
 * own inference, drawn from the sun's position (`isNight`, computed elsewhere from
 * `sun.sun` or a similar entity) rather than from anything `condition` says, and it is
 * only worth drawing for the two glyphs where day and night look visibly different: a
 * sun swaps for a moon, and a cloud with a sun behind it swaps for a cloud with a moon
 * behind it. A rainy cloud looks like a rainy cloud regardless of the hour, so `rainy`
 * has no entry here and correctly falls through to its one daytime glyph.
 */
const NIGHT_ICONS: Partial<Record<WeatherCondition, string>> = {
  sunny: mdiWeatherNight,
  partlycloudy: mdiWeatherNightPartlyCloudy,
}

/**
 * The glyph for a condition, swapping in the night form where the card has one and the
 * sun says it should. Takes a plain `string`, not `WeatherCondition`, so a value an
 * integration invents beyond Home Assistant's fifteen still resolves to the alert
 * glyph instead of taking the render down with it.
 */
export const conditionIcon = (condition: string, isNight = false): string => {
  if (isNight) {
    const nightIcon = NIGHT_ICONS[condition as WeatherCondition]
    if (nightIcon) return nightIcon
  }
  return ICONS[condition as WeatherCondition] ?? mdiAlertCircleOutline
}

/**
 * The word Apple's Weather app would use, not the one Home Assistant's enum spells.
 * `pouring` reads as "Heavy Rain" and `lightning-rainy` as "Thunderstorms" because
 * that is the vocabulary this card is imitating throughout — a user should not be able
 * to tell, from the label alone, that there was an enum behind it. `clear-night` reads
 * as plain "Clear": the card already draws the moon, so the word does not need to
 * repeat "night" back at someone who can see it is dark outside.
 */
const LABELS: Record<WeatherCondition, string> = {
  'clear-night': 'Clear',
  cloudy: 'Cloudy',
  exceptional: 'Severe Weather',
  fog: 'Fog',
  hail: 'Hail',
  lightning: 'Thunderstorms',
  'lightning-rainy': 'Thunderstorms',
  partlycloudy: 'Partly Cloudy',
  pouring: 'Heavy Rain',
  rainy: 'Rain',
  snowy: 'Snow',
  'snowy-rainy': 'Wintry Mix',
  sunny: 'Sunny',
  windy: 'Windy',
  'windy-variant': 'Windy',
}

/**
 * A raw string made readable: hyphens and underscores become spaces, and only the
 * first letter is capitalised, matching how the fifteen known labels above read as
 * sentence fragments rather than as Title Case. This is what an integration's condition
 * gets when it falls outside Home Assistant's own fifteen — a readable guess rather
 * than the enum spelling, so the card degrades gracefully instead of visibly breaking
 * character the one time a value it does not recognise shows up.
 */
const humanize = (value: string): string => {
  const spaced = value.replace(/[-_]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * The label for a condition, in Apple's vocabulary where the card knows the word and
 * humanised raw text where it does not.
 */
export const conditionLabel = (condition: string): string =>
  LABELS[condition as WeatherCondition] ?? humanize(condition)
