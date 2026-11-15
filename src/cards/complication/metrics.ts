/**
 * The lengths the stylesheet and the layout arithmetic both depend on, in design units.
 *
 * Each used to be written twice — once in `layout.ts` (or `bento.ts`) and once as a pixel
 * literal in the card's CSS, with a "Must match" comment on each side. Now there is one number:
 * `layout.ts` and `bento.ts` import it, and `styles.ts` interpolates it into the stylesheet
 * (`calc(${GAP}px * var(--cw-scale))`), so the two halves cannot drift.
 */

/**
 * The space between cells — rings across and down, blocks stacked in the rectangular styles,
 * and the bento gutter. Not spent on `inline`, whose strips are separated by a hairline border.
 */
export const GAP = 14

/** The gap above a ring's caption: `.cell`'s flex `gap`. */
export const LABEL_GAP = 6

/** `.cell.inline`'s `min-height`: an inline strip's whole height, the grid's gap being 0. */
export const INLINE_ROW = 44

/** `.cell.block`'s `min-height`, the rectangular family's shared floor. */
export const RECT_BLOCK = 104

/** `.cell.rectangular-graph`'s `min-height`: the least a graph block may be. */
export const GRAPH_MIN = 96
