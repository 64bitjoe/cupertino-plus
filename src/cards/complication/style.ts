/**
 * The five ways a complication can be drawn, and the one distinction the rest of the
 * card's layout actually needs to make about them.
 *
 * `circular` is the watch-face complication proper: a ring, tiling like the battery
 * card's. The other four are its rectangular family — a block that grows to whatever
 * width the grid gives it rather than tiling at a fixed size — and they differ from
 * each other only in chrome: `rectangular` is bare, `rectangular-header` adds a label
 * row above the value, and `rectangular-bleed` drops the card's own inset so the tint
 * fills the box edge to edge. `inline` is the odd one out again: a single line meant
 * to sit among other inline complications rather than to occupy a cell of its own.
 *
 * Kept as five flat strings rather than, say, a `shape` plus a `chrome` pair, because
 * nothing downstream needs to interrogate the chrome in isolation — only whether the
 * style belongs to the rectangular family at all, which `isRectangular` answers.
 * Splitting the type now would be modelling a distinction the layout code never asks.
 */
export const COMPLICATION_STYLES = [
  'circular',
  'rectangular',
  'rectangular-header',
  'rectangular-bleed',
  'inline',
] as const

export type ComplicationStyle = (typeof COMPLICATION_STYLES)[number]

/**
 * What a freshly dropped complication draws before anyone has opened the editor.
 *
 * The watch-face default, and the shape this card is named for: a single ring reads
 * as a complication anywhere it lands, tiling or full width, where a rectangular
 * block wants a wide cell to look intentional in and looks like an accident in a
 * square one.
 */
export const DEFAULT_STYLE: ComplicationStyle = 'circular'

/** Editor copy for the `style:` select. Kept beside the values themselves so a new
 * style cannot be added to `COMPLICATION_STYLES` without this record failing to
 * typecheck until a label is written for it. */
export const STYLE_LABELS: Record<ComplicationStyle, string> = {
  circular: 'Circular',
  rectangular: 'Rectangular',
  'rectangular-header': 'Rectangular with header',
  'rectangular-bleed': 'Rectangular, full-bleed',
  inline: 'Inline',
}

/**
 * The three that stack full-width rather than tiling.
 *
 * The one question layout code actually asks of a style: whether it claims a whole
 * row of the grid or a fixed-size cell within one. `inline` is deliberately not in
 * this set even though it also runs full width — it stacks by the line, not by the
 * block, so a layout that branched on width alone would place it wrong.
 */
export const isRectangular = (style: ComplicationStyle): boolean => style.startsWith('rectangular')
