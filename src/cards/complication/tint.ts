/**
 * The colour a complication draws in, and how an entity decides it.
 *
 * The battery ring's rule is that colour never carries the reading — `core/ring.ts`
 * argues that at length, because a ring that turned amber at 20% would be answering
 * the same question its arc already answered, just more coarsely. A complication has
 * no arc to defer to for most entities (an `inline` humidity reading is a number, not
 * a gauge), so the tint has to mean something else instead: not "how is this device
 * doing" but "what kind of thing is this at all". A temperature complication is
 * orange whether it reads 40°F or 90°F, for the same reason a thermometer icon does
 * not change shape between them. That is what `tintFor` computes — a property of the
 * entity, fixed the moment it is chosen, and not of whatever `state` happens to hold
 * this update. A tint that moved with the number would be a second opinion dressed up
 * as decoration, and on a dashboard of a dozen complications it would turn a glance
 * into a colour-by-numbers puzzle.
 */

import type { HassEntity } from '../../core/types/ha'

/**
 * The closed palette a complication's `color:` option chooses from, and the only
 * colours `tintFor` may return. Ten names because that is what `tokens.ts` carries
 * under `--cw-*`: nine of Apple's system colours plus `accent`, which is the theme's
 * own primary rather than a fixed hue, for the entity that fits none of the nine.
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

/**
 * The tint as a `--cw-*` reference, never a literal.
 *
 * A card that resolved this to a hex value at read time would bake in whichever
 * theme happened to be active when it ran; keeping it a `var()` means the colour
 * keeps tracking `tokens.ts`, and by extension the user's theme, for the whole time
 * the complication sits on the dashboard rather than only at the moment it was drawn.
 */
export const tintVar = (tint: TintName): string => `var(--cw-${tint})`

/**
 * White text over the tint, except where the tint is too light for white to sit on.
 *
 * Two faces paint content straight onto `tintVar(tint)` rather than drawing it as a thin
 * arc or an icon: `rectangular-header`'s strip and `rectangular-bleed`'s whole card. Both
 * need an ink that stays legible on every one of the ten tints, in both themes, and white
 * is not that ink for all ten. Checked against WCAG's contrast formula rather than by eye,
 * against both the light and dark value of every tint in `tokens.ts`: white on
 * `--cw-yellow` comes out at 1.4-1.5:1 (light/dark), which fails even the 3:1 floor a
 * large glyph is held to, and `--cw-orange`, `--cw-green` and `--cw-teal` are not far
 * behind at 2.0-2.6:1. The other six tints -- `red` clears 3:1 by a hair at 3.41-3.55:1,
 * `blue`/`indigo`/`purple`/`pink` clear it comfortably, and `accent` is the theme's own
 * colour and unknowable here -- keep white.
 *
 * The four that don't get `#1d1d1f`, a fixed near-black, rather than `var(--cw-label)`:
 * `--cw-label` is white in dark mode, which is exactly the failure this function exists
 * to route around, and unlike the label these four tint values barely move between themes
 * (`--cw-yellow` is #ffcc00 light, #ffd60a dark) -- a hue that stays light in both themes
 * needs a fix that stays dark in both themes, not one that tracks the theme.
 */
const NEEDS_DARK_ON_TINT = new Set<TintName>(['yellow', 'orange', 'green', 'teal'])
export const onTintVar = (tint: TintName): string =>
  NEEDS_DARK_ON_TINT.has(tint) ? '#1d1d1f' : '#fff'
