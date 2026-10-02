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
import type { TileFlow } from './model'

export { groupRows, INSET }

/**
 * One tile's footprint: a minimum width, and a fixed height.
 *
 * A tile does NOT size to its content, which is the one place this card and the chips card
 * genuinely disagree about layout rather than about numbers: a chip is a label and wants to be
 * as wide as its label, and a grid of ragged-width tiles is not a grid.
 *
 * Nor is it a fixed width any more. v1.13.0 drew every tile 112 wide, and on the first live
 * dashboard (a glass column of about 425) three fitted and the fourth wrapped onto a line of
 * its own, with a third of the column empty beside it. Apple Home does not do that: its tiles
 * share the row. So a tile now stretches to an equal share of its row and wraps only once that
 * share would fall below this minimum, which makes the minimum the one number the floor needs:
 * it is exactly where the grid wraps (`tiles-card.ts` lays each row out with CSS grid's
 * auto-fill, which counts columns the same way `linesFor` counts tiles).
 *
 * 96 is pinned from both sides. Four across has to fit the user's 425 column on glass with
 * room to spare for a slightly narrower one (4 x 96 + 3 gaps = 408), and four across has to
 * fit a 500 section in card mode inside its two 16 insets (468), which 112 never did and the
 * rules doc carried as an open item; a phone's section of about 360 still takes three. Below
 * it, a two-word name stops reading: the name gets the tile less its two 12 paddings, 72 at
 * the minimum, which holds "Hall Lamp" and "Front Door" at footnote size and ellipsizes
 * "Living Room" and "Kitchen Lights", with the full name in the tooltip. That is only at the
 * wrap point itself, though. Above it the share is wider: at the user's 425 a tile is 100 and
 * "Living Room" reads whole, and in card mode across 500 a tile is 110 and all four do.
 *
 * The height comes from the sections grid rather than from taste. A grid row is 56 with an 8
 * gap, so two lines of 88-tall tiles are 184, exactly three rows, and one line inside the card
 * container's two 16 insets is 120, exactly two. At 96 both cases spilled into one more row: a
 * glass card of two lines asked for four rows and left 48px of dashboard empty under it, and
 * a one-line card asked for three. The render shows 88 is not cramped: the glyph still clears
 * the name by nine pixels, and the glyph-top, text-bottom split reads as two groups.
 */
export const TILE_MIN_WIDTH = 96
export const TILE_HEIGHT = 88

/**
 * The narrowest a tile is priced at under `flow: row`, where a row never wraps and its tiles
 * narrow to share the line instead. Only the width floor reads it; nothing in the stylesheet
 * stops a tile at it, because a row that refused to narrow past it would have to overflow the
 * card, and the one promise `row` makes is that it does not.
 *
 * 64 because it is where a tile stops reading as a tile. The glyph and the two 12 paddings are
 * 48, the width at which the glyph itself stops fitting; 64 leaves the name 40, which in the
 * render is "Gara..." and "Clim...": short, but a word's start beside a glyph that says the rest.
 * It also clears the case that asked for the option: four of them and three gaps are 280, well
 * inside the 396 column where the wrapping grid's four 96s (408) did not fit.
 */
export const TILE_ROW_MIN_WIDTH = 64

/** The gap between tiles, across and down. Must match `--cw-space-2`. */
export const GAP = 8

/**
 * The fewest tiles the floor pretends fit across, so a multi-tile card cannot be dragged into a
 * single column. Two rather than the chips card's three: a tile is about twice a chip's width,
 * and a floor of three would make the narrowest reachable card wider than many sections.
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
 * Every tile is priced at `TILE_MIN_WIDTH`, not at the width it is drawn: a stretched tile is
 * wider only because the line had room to spare, so the line count at the minimum is the line
 * count the grid draws.
 *
 * `measured` is the card's own width in design units once the ResizeObserver has reported one.
 * Without it the lines are counted against an assumed section, which is how the chips card spent
 * four releases handing users empty grid rows.
 */
export const floorsFor = (
  tiles: readonly TileBand[],
  measured?: number,
  inset: number = INSET,
  flow: TileFlow = 'wrap',
): Floors => {
  if (flow === 'row') return rowFloorsFor(tiles, inset)

  const across = Math.min(Math.max(tiles.length, 1), FLOOR_TILES_ACROSS)
  const min_columns = columnsFor(across * TILE_MIN_WIDTH + (across - 1) * GAP + 2 * inset)

  if (tiles.length === 0) return { min_columns, min_rows: 1 }

  const usable = Math.max(TILE_MIN_WIDTH, (measured ?? gridColumnsToPx(min_columns)) - 2 * inset)

  const lines = linesFor(
    tiles.map(tile => ({
      width: TILE_MIN_WIDTH,
      ...(tile.break === true ? { break: true } : {}),
    })),
    usable,
    GAP,
  )

  const content = lines * TILE_HEIGHT + (lines - 1) * GAP + 2 * inset

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}

/**
 * The floor under `flow: row`, where each configured row is exactly one line: the height is the
 * row count whatever the width, so the measurement is not read at all, and the width is the
 * longest row with every tile at `TILE_ROW_MIN_WIDTH`, since that row cannot wrap to fit a
 * narrower card. Not floored at two tiles across, as the wrapping floor is: there is no
 * wrapping for a narrow card to cause, so a row of one asks only for the library minimum.
 *
 * A column count, so a promise about the 500 section `gridColumnsToPx` assumes and no more: in
 * a narrower section the same columns are narrower, and the stylesheet narrows the tiles below
 * the minimum rather than overflow.
 */
const rowFloorsFor = (tiles: readonly TileBand[], inset: number): Floors => {
  const rows = groupRows(tiles)
  const across = Math.max(1, ...rows.map(row => row.length))
  const min_columns = columnsFor(across * TILE_ROW_MIN_WIDTH + (across - 1) * GAP + 2 * inset)

  if (tiles.length === 0) return { min_columns, min_rows: 1 }

  const lines = rows.length
  const content = lines * TILE_HEIGHT + (lines - 1) * GAP + 2 * inset

  return { min_columns, min_rows: Math.max(1, rowsFor(content)) }
}
