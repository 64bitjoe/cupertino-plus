/**
 * The library's colour palette, and how a configured colour becomes a CSS value.
 *
 * The ten names were the complication card's alone until the chips card grew a `color:` of
 * its own. Two cards wanting a thing is the point at which where it belongs becomes a question
 * worth answering, which is the note `moveRow` carried in `battery/model.ts` until the chips
 * editor arrived; this is the same move. `tintFor`, which guesses a tint from what an entity is,
 * lives here too: the complication and tiles cards call it, and the chips card deliberately does
 * not, which is what keeps chips monochrome unless they are told otherwise. What stays behind in
 * `complication/tint.ts` is `onTintVar`, the ink for content drawn on a tint.
 */

import type { HassEntity } from './types/ha'
import { isOneOf } from './one-of'

/**
 * The closed palette a card's `color:` may name. Eleven because that is what `tokens.ts` carries
 * under `--cw-*`: ten of Apple's system colours plus `accent`, which is the theme's own primary
 * rather than a fixed hue, for the entity that fits none of the ten.
 *
 * `grey` is the newest, and the one that is not a hue at all. It arrived with the Mushroom
 * migration, where it is how every "off" template on the dashboard says off: twelve oven,
 * dishwasher and litter-box cards colour an idle state grey. Without a token it fell through to
 * CSS's own `grey`, a fixed #808080 that ignores the theme; Apple's systemGray has a dark
 * variant of its own, and sits on the same footing as the other ten.
 */
export const TINTS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'grey',
  'accent',
] as const

export type TintName = (typeof TINTS)[number]

export const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

/** `accent` reads as a word rather than a colour, so it is spelt out rather than capitalised. */
export const TINT_LABELS: Record<string, string> = {
  accent: 'Accent — your theme’s own',
}

/** A palette name as every colour dropdown lists it. */
export const tintLabel = (value: string): string => TINT_LABELS[value] ?? titleCase(value)

/**
 * The tint as a `--cw-*` reference, never a literal.
 *
 * A card that resolved this to a hex value at read time would bake in whichever theme happened
 * to be active when it ran; keeping it a `var()` means the colour keeps tracking `tokens.ts`,
 * and by extension the user's theme, for the whole time the card sits on the dashboard rather
 * than only at the moment it was drawn.
 */
export const tintVar = (tint: TintName): string => `var(--cw-${tint})`

export const isTint = (value: string): value is TintName => isOneOf(TINTS, value)

/**
 * Other cards' colour names, mapped onto this palette.
 *
 * Mushroom, and Home Assistant's own tile card after it, take a palette of Material names
 * (`amber`, `deep-orange`, `blue-grey`, `disabled` …), and a config moved over from either kept
 * them. Without this table each one fell through to CSS: `grey` and `white` became fixed colours
 * that ignore the theme (white on a light dashboard is nothing at all), and `amber`, which is not
 * a CSS colour, was dropped without a word. So a name from that set lands on the nearest of ours
 * instead, and stays a token: it follows the theme and dark mode exactly as the palette does.
 *
 * Nearest by eye rather than by a colour-distance formula, against Mushroom's own values: its
 * amber (#ffc107) is Apple's yellow to within a few degrees, its cyan is our teal, its
 * deep-purple our indigo. Three are worth stating. `white` and `black` become the label ink,
 * because a tint that is white in a dark theme should not be white on a light one, where it
 * would vanish into the card; the label is white in dark and near-black in light, which is what
 * a user writing `white` on a dark dashboard was actually looking at. `disabled` and `blue-grey`
 * are grey. `primary` is the theme's primary, which is what `accent` already means here.
 *
 * Not in `TINTS`, and not offered by the editors: these are for reading a config somebody else
 * wrote, not for writing a new one. A name a user picks from the dropdown is one of ours.
 */
const ALIASES: Record<string, string> = {
  gray: 'var(--cw-grey)',
  'blue-grey': 'var(--cw-grey)',
  'blue-gray': 'var(--cw-grey)',
  'dark-grey': 'var(--cw-grey)',
  'dark-gray': 'var(--cw-grey)',
  disabled: 'var(--cw-grey)',
  amber: 'var(--cw-yellow)',
  lime: 'var(--cw-green)',
  'light-green': 'var(--cw-green)',
  'deep-orange': 'var(--cw-orange)',
  brown: 'var(--cw-orange)',
  cyan: 'var(--cw-teal)',
  'light-blue': 'var(--cw-blue)',
  'deep-purple': 'var(--cw-indigo)',
  primary: 'var(--cw-accent)',
  white: 'var(--cw-label)',
  black: 'var(--cw-label)',
}

/**
 * A configured colour, resolved.
 *
 * A palette name becomes its token, so it stays theme-correct and dark-mode-correct, and so does
 * one of another card's names that `ALIASES` maps onto the palette. Anything else is returned
 * **verbatim** — `#ff8800`, `var(--my-token)`, `rgb(…)` — because parsing CSS
 * is not this library's job and the CSSOM already does it: the caller hands the result to
 * `element.style.setProperty`, which validates and silently drops what it cannot read. That is
 * why a bad colour is a chip with no tint rather than a broken rule, and why a config value
 * never becomes CSS text.
 *
 * Answers `undefined` for a blank, so a card can call it without checking first.
 */
export const colorValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  // Lower-cased before either lookup: a template often builds the name (`{{ 'Amber' if … }}`),
  // and a CSS colour keyword is case-insensitive anyway, so `Grey` meaning grey surprises nobody.
  const name = trimmed.toLowerCase()
  if (isTint(name)) return tintVar(name)
  return ALIASES[name] ?? trimmed
}

/**
 * `device_class` to tint, for the entities that carry one. Grouped by what the class
 * measures rather than by the class name, so that classes which are really the same
 * kind of reading under a different label (`moisture` and `water`, `current` and
 * `voltage`) land on the same colour without the table having to say so twice.
 */
const BY_DEVICE_CLASS: Record<string, TintName> = {
  temperature: 'orange',
  humidity: 'blue',
  moisture: 'blue',
  water: 'blue',
  precipitation: 'blue',
  battery: 'green',
  energy: 'green',
  power: 'yellow',
  current: 'yellow',
  voltage: 'yellow',
  illuminance: 'yellow',
  pressure: 'teal',
  atmospheric_pressure: 'teal',
  carbon_dioxide: 'indigo',
  carbon_monoxide: 'indigo',
  aqi: 'indigo',
  door: 'red',
  window: 'red',
  safety: 'red',
  problem: 'red',
}

/**
 * Domain to tint, for the entities `device_class` says nothing about: a `light` has
 * no device class to read, but "which kind of thing is this" is still answerable from
 * the domain alone. Only consulted once `BY_DEVICE_CLASS` has had first refusal, so an
 * entity that sets both (a `light` reporting `device_class: temperature`, say, from a
 * combined sensor) is coloured by what it measures rather than by what it is.
 */
const BY_DOMAIN: Record<string, TintName> = {
  lock: 'red',
  media_player: 'pink',
  light: 'yellow',
  cover: 'indigo',
  climate: 'orange',
  fan: 'teal',
  vacuum: 'purple',
  person: 'blue',
}

/**
 * The tint for an entity, fixed by what it is rather than by what it currently reads.
 *
 * `device_class` first because it is the more specific claim — a `sensor.hallway`
 * could be measuring anything, but a `device_class: temperature` sensor is a
 * thermometer regardless of its domain. The domain is the fallback for the entities
 * with no device class to consult, and `accent` — the theme's own primary colour
 * rather than a system hue — is what is left for everything neither table recognises,
 * so an unrecognised entity still tints coherently with the rest of the dashboard
 * instead of falling back to some arbitrary system colour that was never chosen for it.
 */
export const tintFor = (entity: HassEntity): TintName => {
  const deviceClass = entity.attributes.device_class
  if (typeof deviceClass === 'string' && BY_DEVICE_CLASS[deviceClass]) {
    return BY_DEVICE_CLASS[deviceClass]
  }

  const domain = entity.entity_id.split('.')[0] ?? ''
  return BY_DOMAIN[domain] ?? 'accent'
}
