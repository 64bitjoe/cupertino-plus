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
 *
 * `tintFor` and the palette now live in `core/tint.ts`, shared with the other cards; what
 * stays here is `onTintVar`, the ink for content drawn on a tint, which only this card does.
 */

import type { TintName } from '../../core/tint'

// The palette and `tintFor` live in `core/` because the chips card and the tiles card share
// them with this one; re-exported rather than relocated in every caller, because `TINTS` is
// this card's `color:` option and every complication file that names it is naming that option,
// not the shared palette.
export { TINTS, tintFor, tintVar, type TintName } from '../../core/tint'

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
