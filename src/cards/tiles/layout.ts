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
 * as wide as its label, and a grid of ragged-width tiles is not a grid. 112 x 96 is wide enough
 * for a two-word name at footnote size and close to the shape of the cards this replaces.
 * Flagged in §9 of the spec as chosen rather than measured — one constant to change.
 */
export const TILE_WIDTH = 112
export const TILE_HEIGHT = 96

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
