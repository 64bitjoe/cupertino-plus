/**
 * The library's colour palette, and how a configured colour becomes a CSS value.
 *
 * The ten names were the complication card's alone until the chips card grew a `color:` of
 * its own. Two cards wanting a thing is the point at which where it belongs becomes a question
 * worth answering, which is the note `moveRow` carried in `battery/model.ts` until the chips
 * editor arrived; this is the same move. What stays behind in `complication/tint.ts` is
 * `tintFor`'s device-class guessing, which is that card's own rule — the chips card
 * deliberately does not tint automatically.
 */

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
