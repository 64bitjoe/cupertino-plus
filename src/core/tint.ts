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

/**
 * The closed palette a card's `color:` may name. Ten because that is what `tokens.ts` carries
 * under `--cw-*`: nine of Apple's system colours plus `accent`, which is the theme's own
 * primary rather than a fixed hue, for the entity that fits none of the nine.
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
  'accent',
] as const

export type TintName = (typeof TINTS)[number]

/**
 * The tint as a `--cw-*` reference, never a literal.
 *
 * A card that resolved this to a hex value at read time would bake in whichever theme happened
 * to be active when it ran; keeping it a `var()` means the colour keeps tracking `tokens.ts`,
 * and by extension the user's theme, for the whole time the card sits on the dashboard rather
 * than only at the moment it was drawn.
 */
export const tintVar = (tint: TintName): string => `var(--cw-${tint})`

export const isTint = (value: string): value is TintName =>
  (TINTS as readonly string[]).includes(value)

/**
 * A configured colour, resolved.
 *
 * A palette name becomes its token, so it stays theme-correct and dark-mode-correct. Anything
 * else is returned **verbatim** — `#ff8800`, `var(--my-token)`, `rgb(…)` — because parsing CSS
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
  return isTint(trimmed) ? tintVar(trimmed) : trimmed
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
