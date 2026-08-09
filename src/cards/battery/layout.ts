/**
 * How many rings, how big, and whether they get a percentage under them.
 *
 * The calendar's equivalent is a *budget*: a stream of rows arriving to be cut somewhere,
 * priced against the box. This card has no stream. Its content is exactly the devices the
 * config names, so nothing is ever cut for lack of anything better to draw, and the
 * questions the box settles are different ones:
 *
 *   how many columns    from `cwLayout`, so the same measured width that gives the calendar
 *                       one column or two gives this card two rings across or four;
 *   how many rows       from the count, as many as the devices need, bounded by the rows
 *                       the height can hold at a ring still worth looking at;
 *   which view          `labeled` while the devices fit on one row and there is width under
 *                       each of them for `100%`, `compact` otherwise;
 *   how big a ring is   the cell it landed in, capped.
 *
 * The order matters, and it is a priority: the count decides the grid, the grid decides the
 * cell, and the ring fits the cell. Nothing goes the other way: a ring is never the reason
 * a device is not drawn, until the box is too small to hold the row it would be in.
 *
 * Every number below is in **design units**, pixels at `scale: 100`, exactly as in the
 * calendar's geometry section: `gridFor` divides the measured box by the factor once and
 * the rest is priced against the CSS as written. The constants each name their twin in the
 * stylesheet, and a change to one that is not made to the other is a card that draws over
 * its own inset.
 */

import type { WidgetLayout } from '../../core/size'

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/**
 * The border `ha-card` draws, top and bottom, left and right.
 *
 * Taken off in real pixels before the box is divided by the scale, for the reason the
 * calendar spells out on its own `BORDER`: Home Assistant draws it at 1px whatever the
 * widget inside is scaled to, so it is not one of the lengths the factor moves.
 */
const BORDER = 1

/** Must match `--cw-ring-gap`: the space between two rings, across and down. */
const GAP = 14

/** Must match `--cw-ring-label-gap`, between a ring and the percentage under it. */
const LABEL_GAP = 8

/** The percentage's line box: the `line-height` of the `.level` rule. */
const LABEL = 28

/**
 * How wide `100%` needs to be.
 *
 * Measured rather than reasoned about, in the harness at a device pixel ratio of 1: the
 * `.level` rule's 22px semibold sets `100%` at 61.0 design units against `72%` at 47.3 and
 * `0%` at 33.6. 64 is that rounded up with a unit or two for a font stack that is not the
 * one it was measured in: the type here is San Francisco where it can be had and whatever
 * the theme asked for where it cannot, and the fallback is not guaranteed to be narrower.
 *
 * It is the widest reading that has to fit, which is the point: the type does not shrink for
 * it (§6), so a cell measured against `72%` would clip only on the day the device was full.
 * Below this the percentages come off altogether rather than being set in a size of their
 * own; a widget with two type sizes for one number is a worse answer than a widget that
 * admits the column is too narrow to caption.
 */
const LABEL_WIDTH = 64

/**
 * The largest a ring is ever drawn, and it is a proportion rather than a taste.
 *
 * The widget being copied draws a 62pt ring in a 158pt square with 16pt of inset: 39% of
 * the widget's width, two of them nearly filling the space between the insets. Home
 * Assistant's small footprint is a ~246px square rather than 158pt, and 39% of that is
 * this, so a card at the design footprint reproduces the reference's proportion, and the
 * cap only starts to bite on a card dragged wider than the shape the rings were laid out
 * for. Which is what a cap is for: past that the rings would grow to fill a box that no
 * longer looks like a widget.
 */
export const RING_MAX = 96

/**
 * The smallest, and this one is a legibility floor.
 *
 * An icon is drawn at 45% of the ring, so this is a 18px glyph, about where an `mdi`
 * outline stops being a silhouette you can name. It is a floor in two senses: no row is
 * added whose cell could not hold a ring this big, and a box too small even for one row of
 * them gets the ring anyway and is clipped by `ha-card`. Clipping is the right failure
 * there: `min_rows` and `min_columns` keep the Layout tab well clear of it, and a card
 * that answered a squashed box by drawing nothing would be a card that looked broken
 * rather than cramped.
 */
export const RING_MIN = 40

/**
 * Rings across, from the layout the measured width implies.
 *
 * Two and four rather than a number worked out from the width, and that is the same choice
 * `core/size.ts` makes for the whole library: there are two column counts, the square and
 * the 2:1, and a third arriving somewhere between them would be a shape nobody designed.
 * `large` is the 2:1 grown downwards rather than sideways, so it shares medium's four
 * rather than earning a column count of its own; what changes for it is the row cap below.
 * What the in-between footprints get instead of a third count is a ring that grows with
 * the box.
 */
const COLUMNS: Record<WidgetLayout, number> = { small: 2, medium: 4, large: 4 }

/**
 * Rings down, and it is a cap on the shape rather than on the height.
 *
 * Four devices is what small and medium draw, and that number is the design rather than an
 * arithmetic consequence: the square holds its 2 × 2, and the wide card holds one row of
 * four and does **not** stack a second under it. A wide card with 4 + 2 fits perfectly well
 * and looks wrong: a full row with a stub centred beneath it reads as a card that ran out of
 * something, where one row of four reads as the widget it is.
 *
 * `large` is the exception, and it is the reason six devices were ever worth configuring: it
 * is a medium grown downwards rather than sideways, so the second row it gained is exactly
 * where a second row of four belongs, without the stub problem a wide card has. Two rows of
 * four is the cap there, not because eight is a round number, but because a third row would
 * repeat the same argument that stops medium at one: a card that keeps growing a grid every
 * time it is given more devices is a table, not a widget.
 *
 * The other direction (fewer rows than this when the box is too short for them) is still
 * the measurement's call, below.
 */
const MAX_ROWS: Record<WidgetLayout, number> = { small: 2, medium: 1, large: 2 }

export type BatteryView = 'labeled' | 'compact'

export interface Box {
  width: number
  height: number
}

export interface BatteryGrid {
  view: BatteryView
  columns: number
  rows: number
  /** How many of the configured devices are drawn, from the front of the list. */
  visible: number
  /** Ring diameter, in design units. */
  ring: number
  /**
   * Where an incomplete last row sits.
   *
   * `start` in two columns, `center` in four, and the asymmetry is deliberate. Centring a
   * lone ring between two columns parks it exactly over the gap in the row above, which
   * reads as a pyramid rather than as a grid with a corner missing, so the two-column
   * grid stays a grid and the odd ring keeps the left column. In four columns there is no
   * such alignment to lose, and a pair packed left under a full row of four reads as
   * lopsided instead.
   */
  tail: 'start' | 'center'
}

/**
 * The grid for `count` devices in the box the card was measured in.
 *
 * `scale` is the factor from `config.scale`, and it is divided out of the box exactly once,
 * as the module comment explains. Everything returned is either a count or a design unit.
 */
export const gridFor = (mode: WidgetLayout, count: number, box: Box, scale = 1): BatteryGrid => {
  const columns = COLUMNS[mode]
  const width = Math.max(0, (box.width - 2 * BORDER) / scale - 2 * INSET)
  const height = Math.max(0, (box.height - 2 * BORDER) / scale - 2 * INSET)

  // The cells a row actually holds, not the columns it could: one device in a narrow card
  // has the whole width to itself, and pricing it against a column it does not share
  // would deny it a percentage it has ample room for.
  const across = Math.min(Math.max(count, 1), columns)
  const cellWidth = (width - (across - 1) * GAP) / across

  // How many rows the height holds, priced at a compact cell. The last row has no gap under
  // it, hence the `+ GAP`, the same shape as the calendar's `rowsIn`. At least one row
  // always, so a box too short to be honest about still draws something and is clipped
  // rather than left blank.
  //
  // Priced without the caption on purpose, which is what keeps this out of a circle: the
  // caption depends on how many rings are drawn, which depends on the rows, which would then
  // depend on the caption. It is safe because a captioned grid is one row by definition and
  // one captioned row fits every footprint the Layout tab offers: the shortest is 3 grid
  // rows, which is 108 design units even at the largest scale, against the 76 a ring and its
  // caption need.
  const fits = Math.max(1, Math.floor((height + GAP) / (RING_MIN + GAP)))
  const rows = Math.max(1, Math.min(Math.ceil(count / columns), fits, MAX_ROWS[mode]))
  const visible = Math.min(count, columns * rows)

  // Both halves are required, and they fail differently. More rings than one row holds is
  // the reference's own rule: the percentages come off and the grid closes up. Too little
  // width is this card's addition, for the footprints Home Assistant permits and a phone has
  // no equivalent of: `100%` clipped in half is worse than no caption at all.
  //
  // `visible` rather than `count`, and that is what makes the wide card always captioned: it
  // draws four rings whether it was given four devices or six, and four rings are one row.
  // Reading `count` there would take the percentages off a card that looks identical to one
  // that keeps them, on the strength of two devices nobody can see.
  const labeled = visible <= columns && cellWidth >= LABEL_WIDTH
  const caption = labeled ? LABEL_GAP + LABEL : 0

  const cellHeight = (height - (rows - 1) * GAP) / rows
  // Floored to a whole design unit: the ring is handed to CSS as a length, and a fraction
  // of a unit multiplied by the scale factor is a row that can round its way over the inset.
  const ring = Math.max(RING_MIN, Math.floor(Math.min(RING_MAX, cellWidth, cellHeight - caption)))

  return {
    view: labeled ? 'labeled' : 'compact',
    columns,
    rows,
    visible,
    ring,
    tail: columns > 2 ? 'center' : 'start',
  }
}
