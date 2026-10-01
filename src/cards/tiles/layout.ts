/**
 * How tall a grid of tiles is, and how much box the card must be allowed to have.
 *
 * Small, because `core/wrapping.ts` does the arithmetic and this file only supplies the
 * numbers. That split is the point of the extraction: a tile and a chip wrap by the same rules
 * and differ only in how wide one of them is.
 *
 * Every number is a design unit: pixels at `scale: 1`, matching the stylesheet in
 * `tiles-card.ts` multiplied by `var(--cw-scale)`.
 */

import { columnsFor, gridColumnsToPx, rowsFor, type Floors } from '../../core/floors'
import { groupRows, linesFor, INSET } from '../../core/wrapping'

export { groupRows, INSET }

/**
 * One tile's footprint.
 *
 * A tile does NOT size to its content, which is the one place this card and the chips card
 * genuinely disagree about layout rather than about numbers: a chip is a label and wants to be
 * as wide as its label, and a grid of ragged-width tiles is not a grid.
 *
 * Spec §9 chose 112 x 96 and asked the first render to settle it. It settled the height at 88.
 *
 * The width holds. It is pinned from both sides: four across must fit a 500px section on glass
 * (4 x 112 + 3 gaps = 472), and three across a phone's section of about 360 (352). It fits every
 * two-word name of up to about thirteen characters at footnote size ("Kitchen Lights", "Office
 * Heater"); "Bedroom Lamp" misses by three pixels and ellipsizes, with the full name in the
 * tooltip. Widening to 116 would rescue it and cost the phone its third column, which is the
 * worse trade.
 *
 * The height comes from the sections grid rather than from taste. A grid row is 56 with an 8
 * gap, so two lines of 88-tall tiles are 184, exactly three rows, and one line inside the card
 * container's two 16 insets is 120, exactly two. At 96 both cases spilled into one more row: a
 * glass card of two lines asked for four rows and left 48px of dashboard empty under it, and
 * a one-line card asked for three. The render shows 88 is not cramped: the glyph still clears
 * the name by nine pixels, and the glyph-top, text-bottom split reads as two groups.
 */
export const TILE_WIDTH = 112
export const TILE_HEIGHT = 88

/** The gap between tiles, across and down. Must match `--cw-space-2`. */
export const GAP = 8

/**
 * The fewest tiles the floor pretends fit across, so a multi-tile card cannot be dragged into a
 * single column. Two rather than the chips card's three: a tile is more than twice a chip's
 * width, and a floor of three would make the narrowest reachable card wider than most sections.
 */
const FLOOR_TILES_ACROSS = 2

/** The one thing the floor reads off a tile. A full `TileView` satisfies it structurally. */
export interface TileBand {
  break?: boolean
}

/**
 * The floor: wide enough for two tiles side by side, and tall enough for every line they wrap
 * onto at the width the card actually has.
 *
 * `measured` is the card's own width in design units once the ResizeObserver has reported one.
 * Without it the lines are counted against an assumed section, which is how the chips card spent
 * four releases handing users empty grid rows.
 */
export const floorsFor = (
  tiles: readonly TileBand[],
  measured?: number,
  inset: number = INSET,
): Floors => {
  const across = Math.min(Math.max(tiles.length, 1), FLOOR_TILES_ACROSS)
  const min_columns = columnsFor(across * TILE_WIDTH + (across - 1) * GAP + 2 * inset)

  if (tiles.length === 0) return { min_columns, min_rows: 1 }

  const usable = Math.max(TILE_WIDTH, (measured ?? gridColumnsToPx(min_columns)) - 2 * inset)

  const lines = linesFor(
    tiles.map(tile => ({
      width: TILE_WIDTH,
      ...(tile.break === true ? { break: true } : {}),
    })),
    usable,
    GAP,
  )

  const content = lines * TILE_HEIGHT + (lines - 1) * GAP + 2 * inset

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}
