/**
 * Whether an entity has a floor and a ceiling an arc can be drawn against, and if so
 * what they are.
 *
 * An arc is a fraction, and a fraction needs both ends. Most entities carry neither: a
 * room at 21.4°C has no ceiling, and drawing one against an invented 0–100 would be a
 * fraction of nothing, which reads worse than no gauge at all. So `null` — "there is no
 * honest range here" — is the common answer this module gives, not the exceptional one,
 * and the styles that consume it (`ring.ts` and the rectangular family) drop their gauge
 * outright when they get it rather than substitute a scale nobody asserted.
 */

import type { HassEntity } from '../../core/types/ha'

export interface Range {
  min: number
  max: number
}

/**
 * `device_class`es whose own unit is a percentage, read without needing
 * `unit_of_measurement` to say so as well: some integrations set the class and leave the
 * unit off, on the (correct) assumption that `battery` already implies `%`.
 */
const PERCENT_DEVICE_CLASSES = new Set(['battery', 'humidity', 'moisture', 'power_factor'])

/**
 * A `HassEntityAttributes` value read as a finite number, or `null`.
 *
 * Attributes are an index-signature bag typed `unknown`, so this is the one place that
 * narrowing happens; everything past it can trust the type. `unavailable`, `unknown` and
 * a missing attribute all fail `Number.isFinite` the same way, which is the point — none
 * of them is a range, and none needs naming separately to be refused.
 */
const asNumber = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * The last gate every candidate range passes through: `max` strictly greater than `min`,
 * or `null`.
 *
 * A range with no room in it is not a smaller gauge, it is a division by zero waiting to
 * happen in `fractionOf` — and `min === max` is a real config, not a hypothetical one: an
 * `min`/`max` override typo'd to the same number, or a `number` entity whose `min` and
 * `max` attributes have not been set to anything yet and both default to the same value.
 * Refusing it here means every other branch below can return its candidate unchecked.
 */
const valid = (range: Range): Range | null => (range.max > range.min ? range : null)

/**
 * The range to draw an arc against, or `null` for "draw no gauge".
 *
 * `override` is checked first and, when given at all, decides the answer outright —
 * config beats derivation, the same way a card's own `name:` beats a friendly name. Both
 * halves are required together: a `min` with no `max` (or the reverse) is not a smaller
 * range, it is one whose other end would have to be invented, which is the exact thing
 * this function exists not to do, so it is refused rather than guessed.
 *
 * Absent an override, the answer is read off what the entity itself asserts. A `number`
 * or `input_number` states its own `min`/`max` as attributes, so those are taken at face
 * value; a `light`'s `brightness` and a `cover`'s `current_position` are ranges implied
 * by the domain rather than declared by it, so those are hard-coded here instead of read
 * off an attribute that may not exist. Everything else that reads as a percentage —
 * `device_class` in `PERCENT_DEVICE_CLASSES`, or a bare `unit_of_measurement: '%'` for
 * the classes not on that list — gets 0–100.
 *
 * `climate` is deliberately not one of these branches, even though a thermostat carries
 * `min_temp`/`max_temp` right there on its attributes. Drawing the current temperature
 * against a thermostat's own limits gives an arc that sits mid-scale and barely moves
 * for the entire time the entity is in view — nobody's living room spends its life near
 * either end of the range the thermostat is willing to accept as a setpoint — so the
 * gauge would be technically present and practically mute. That is a worse outcome than
 * no gauge, not a smaller one, so `climate` falls through to the final `null` along with
 * every other domain this function has no derivation for. The `min`/`max` override above
 * is how somebody who disagrees, and has a range in mind that means something for their
 * thermostat, gets one.
 */
export const rangeFor = (entity: HassEntity, override?: Partial<Range>): Range | null => {
  if (override?.min !== undefined || override?.max !== undefined) {
    if (override.min === undefined || override.max === undefined) return null
    return valid({ min: override.min, max: override.max })
  }

  const { attributes } = entity
  const domain = entity.entity_id.split('.')[0] ?? ''
  const deviceClass = attributes.device_class

  if (domain === 'number' || domain === 'input_number') {
    const min = asNumber(attributes.min)
    const max = asNumber(attributes.max)
    return min === null || max === null ? null : valid({ min, max })
  }

  if (domain === 'light') return valid({ min: 0, max: 255 })
  if (domain === 'cover') return valid({ min: 0, max: 100 })

  if (typeof deviceClass === 'string' && PERCENT_DEVICE_CLASSES.has(deviceClass)) {
    return valid({ min: 0, max: 100 })
  }

  if (attributes.unit_of_measurement === '%') return valid({ min: 0, max: 100 })

  return null
}

/**
 * Where `value` sits in `range`, as 0–1.
 *
 * Clamped at both ends rather than left to run past them, because a reading outside its
 * own declared range is a real thing a gauge has to survive — a battery reporting 104%
 * after a firmware quirk, a cover mid-calibration reporting a position past 100 — and an
 * arc longer than the circle would wrap back over itself and read as nearly empty
 * instead of nearly full.
 *
 * `Range` is a plain interface, not a value only `rangeFor` can produce, so a zero-width
 * or backwards one is still a shape the type system will let through even though
 * `rangeFor` itself never hands one out. Guarded here rather than trusted as a
 * precondition, because the alternative is `NaN` from the division, and `NaN` clamped by
 * `Math.min`/`Math.max` is still `NaN` — it would not stop at this function, it would go
 * on to become an arc drawn to nowhere.
 */
export const fractionOf = (value: number, range: Range): number => {
  const span = range.max - range.min
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (value - range.min) / span))
}
