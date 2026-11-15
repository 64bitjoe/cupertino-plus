/**
 * How the faces sit in the box the card was dragged to, and the footprint the card refuses
 * to go below.
 *
 * The battery card's `gridFor` answers one question the calendar's `gridFor` does not: this
 * card has no stream either, for the same reason as the battery ring's — its content is
 * exactly the entities the config names, and there is nothing arriving that has to be cut
 * for lack of anything better to draw. So `packFor` never drops one. Where this module
 * parts company with the battery card is `floorsFor`: the battery ring caps at four devices
 * and lets the rest go unshown, because a fifth ring would break the watch-face shape it is
 * copying. A complication has no such shape to protect — a sixth ring is still a ring — so
 * instead of capping the count, this card grows the footprint the count needs and tells Home
 * Assistant about it through `min_rows` / `min_columns`.
 *
 * That is the whole of the overflow design, and it is worth saying plainly because it is
 * easy to miss reading the code alone: the Layout tab clamps its own sliders to whatever
 * `floorsFor` returns, so a card holding six rings cannot be *dragged* down to a box that
 * holds four. There is no `+2 more` indicator, no scroller, and no truncated state anywhere
 * in this card, and that is not an omission — for every footprint the Layout tab will let
 * a user choose, it is what makes overflow unreachable. A future change that adds one of
 * those would be solving a problem this design already closed off; the fix for a cramped
 * card is `floorsFor` returning a bigger number, not a face that hides what does not fit.
 *
 * The qualifier matters, and it is a known, disclosed gap rather than a silent one:
 * `config.grid_options` is spread *after* whatever `getGridOptions()` returns
 * (`docs/ha-api-notes.md`), so a `rows` a user already had saved survives a later edit that
 * raises `floorsFor`'s own floor — drag a two-entity `rectangular` card down to its floor,
 * then add a third entity, and the saved `rows` is now below the new floor even though the
 * Layout tab itself would refuse to offer that box today. That is a stale-config window,
 * not a hole in the floors' arithmetic, and closing it would mean the layout yielding to an
 * oversubscribed box — the opposite of the guarantee this module makes everywhere else, and
 * a design change past the scope of a floor. See `docs/complication-widget-rules.md` §5 for
 * where that trade is recorded for a reader who has not opened this file.
 *
 * The priority inside `packFor` is the battery card's, for the battery card's reason: the
 * count decides the grid, the grid decides the cell, the face fits the cell. Nothing here
 * runs the other way — a ring is never the reason an entity is not drawn, because the floor
 * that would have made the box too small for it is exactly what `floorsFor` exists to
 * prevent the Layout tab from offering.
 *
 * Every number below is in **design units**, pixels at `scale: 1`, exactly as in the battery
 * card's geometry section: the measured box is divided by the scale factor once, at the top,
 * and everything after that is priced against the CSS as written. The constants each name
 * their twin in the stylesheet, and a change to one that is not made to the other is a card
 * that draws over its own inset or asks for a floor it does not actually need.
 */

import { columnsFor, rowsFor, type Floors } from '../../core/floors'
import { bentoFloorBox } from './bento'
import { GAP, GRAPH_MIN, INLINE_ROW, LABEL_GAP, RECT_BLOCK } from './metrics'
import { isRectangular, type ComplicationStyle } from './style'

export type { Floors }
export { withFloors } from '../../core/floors'

export interface Box {
  width: number
  height: number
}

export interface Pack {
  columns: number
  rows: number
  /** Ring diameter, in design units. 0 for the styles that draw no ring. */
  ring: number
  /** Whether each cell has room for its name under it. */
  labels: boolean
  /**
   * How many of the entities are drawn. Always all of them, except on the graph face in a box
   * too small for every graph even side by side: there the ones that do not fit are left out
   * whole rather than drawn without their graph. See `packGraph`.
   */
  shown: number
  /** The graph face only: cells too narrow for the high and low beside the reading. */
  compact: boolean
}

// ---- Geometry, in design units. Each names its twin in the stylesheet. ------

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/**
 * The border `ha-card` draws, top and bottom, left and right.
 *
 * Taken off in real pixels before the box is divided by the scale, for the reason the
 * battery card's own `BORDER` gives: Home Assistant draws it at 1px whatever the widget
 * inside is scaled to, so it is not one of the lengths the factor moves.
 */
const BORDER = 1

/*
 * `GAP`, `LABEL_GAP`, `INLINE_ROW`, `RECT_BLOCK` and `GRAPH_MIN` live in `metrics.ts`, which the
 * stylesheet reads too, so the lengths priced here are the lengths drawn. `GAP` is not spent on
 * `inline`: `.grid.inline` overrides the gap to 0 and separates its strips with a `border-top`
 * hairline instead, which is why `floorsFor`'s inline branch below has no gap term in it while
 * the rectangular one does.
 */

/**
 * The caption's own line height, and the gap above it.
 *
 * `LABEL` must match `--cw-text-caption-2`'s line height — the caption is a single line,
 * `white-space: nowrap`, so there is no second line to budget for. `LABEL_GAP` (`metrics.ts`)
 * is the `gap` on `.cell`, the flex column that stacks the ring and the caption under it. Named
 * separately, rather than folded into one constant, because each measures a different rule
 * in the stylesheet, and a reader checking one against its CSS twin should not have to
 * subtract the other out first.
 */
const LABEL = 13

/**
 * The widest name worth captioning: measured, as the battery card's `LABEL_WIDTH` was, in
 * the harness at a device pixel ratio of 1. The caption is short entity names in
 * `--cw-text-caption-2` (11px semibold, uppercase) rather than the battery ring's `100%`, so
 * the number is not the same one — it is the same kind of number, arrived at the same way.
 * Below this a name would either clip or wrap onto a second line the `.caption` rule does
 * not budget height for, so the caption comes off instead of being drawn badly.
 */
const LABEL_WIDTH = 64

/**
 * The ring's legibility floor and its proportion cap.
 *
 * Not imported from the battery card on purpose, even though the numbers happen to match:
 * `RING_MIN` is a statement about how small an `mdi` glyph can get before it stops reading
 * as a shape, and `RING_MAX` is a statement about how big a ring can get before it stops
 * looking like a watch complication and starts looking like a card that filled itself with
 * one shape for lack of anything else to draw. Both statements belong to this card's own
 * ring, not to the battery card's, and the two files agreeing is a coincidence of taste
 * worth leaving as a coincidence — see the task brief's own note that these are defined
 * here, not shared.
 */
const RING_MIN = 40
const RING_MAX = 96

/**
 * The graph face's comfortable block, which `floorsFor` asks for: the name, the reading with its
 * high and low, and a graph tall enough to read a shape in.
 */
const GRAPH_BLOCK = 148

/**
 * A graph block's narrowest cell, beside `GRAPH_MIN` (`metrics.ts`), its least height: the least
 * room a graph block can have and still draw name, reading and a line — the Lock Screen's small
 * rectangular widget, roughly. Below this a block is left out rather than drawn without its graph.
 */
const GRAPH_MIN_WIDTH = 96

/** Narrower than this, a graph cell drops the high and low beside its reading. */
const GRAPH_EXTREMES_WIDTH = 180

/** The corner face's smallest cell: a reading and a quarter-arc need about this much. */
const CORNER_MIN = 72

/** How tall one block of a stacking style asks to be. */
const blockFor = (style: ComplicationStyle): number =>
  style === 'rectangular-graph' ? GRAPH_BLOCK : RECT_BLOCK

/**
 * The width a stacking style needs before its single column starts truncating names and
 * readings rather than reading as a deliberately narrow card.
 *
 * A judgement call rather than a derivation, the way the battery card's `LAYOUT_THRESHOLD`
 * is: there is no formula that turns "the type stops looking cramped" into a number, only a
 * width to sanity-check by eye and hold steady once it has been.
 */
const STACK_MIN_WIDTH = 220

// ---- Packing ------------------------------------------------------------------

/**
 * How the faces sit in the box the card was actually dragged to.
 *
 * The count decides the grid, the grid decides the cell, the face fits the cell — see the
 * module comment. Nothing here can drop an entity: the rectangular and inline styles stack
 * one row per entity unconditionally, and the circular tiling below always chooses a
 * `columns × rows` whose product covers `count`, whatever the box. A box too small to hold
 * that many legible rings is not this function's problem to solve by hiding one — it is
 * `floorsFor`'s problem to have made unreachable in the first place.
 */
export const packFor = (style: ComplicationStyle, count: number, box: Box, scale = 1): Pack => {
  const n = Math.max(1, count)
  const width = Math.max(0, (box.width - 2 * BORDER) / scale - 2 * INSET)
  const height = Math.max(0, (box.height - 2 * BORDER) / scale - 2 * INSET)

  if (style === 'rectangular-graph') return packGraph(n, width, height)

  // The corner face: two across, each entity tucked into the outer corner of its cell.
  if (style === 'corner') {
    const columns = Math.min(n, 2)
    const rows = Math.ceil(n / columns)
    const cell = Math.min(
      (width - (columns - 1) * GAP) / columns,
      (height - (rows - 1) * GAP) / rows,
    )
    return {
      columns,
      rows,
      ring: Math.max(CORNER_MIN, Math.floor(cell)),
      labels: false,
      shown: n,
      compact: false,
    }
  }

  // The stacking styles: one entity per row, full width, no ring to size. `isRectangular`
  // covers the three block chromes; `inline` stacks the same way for a different reason
  // (a strip meant to sit among other strips, not a cell of its own) but the geometry is
  // identical, so one branch draws both.
  if (isRectangular(style) || style === 'inline') {
    return { columns: 1, rows: n, ring: 0, labels: true, shown: n, compact: false }
  }

  // Across before down: the widest row the box can hold at the minimum ring, capped by the
  // count, because two rings in a wide card should not be spread across four empty columns.
  const fits = Math.max(1, Math.floor((width + GAP) / (RING_MIN + GAP)))
  const columns = Math.min(n, fits)
  const rows = Math.ceil(n / columns)

  const cellWidth = (width - (columns - 1) * GAP) / columns
  const cellHeight = (height - (rows - 1) * GAP) / rows

  // Same both-halves test the battery card makes: a name needs a cell wide enough to hold
  // it, and a cell tall enough to have somewhere to put it under the ring.
  // The bezel face carries its name around its own rim, so it never asks for a caption row.
  const labels =
    style !== 'bezel' && cellWidth >= LABEL_WIDTH && cellHeight >= RING_MIN + LABEL_GAP + LABEL
  const caption = labels ? LABEL_GAP + LABEL : 0

  // Floored to a whole design unit: the ring is handed to CSS as a length, and a fraction of
  // a unit multiplied by the scale factor is a row that can round its way over the inset.
  const ring = Math.max(RING_MIN, Math.floor(Math.min(RING_MAX, cellWidth, cellHeight - caption)))

  return { columns, rows, ring, labels, shown: n, compact: false }
}

/**
 * The graph face, which unlike every other face reflows rather than only stacking: a graph is
 * worthless squeezed below `GRAPH_MIN`, so when the box cannot stack every block at that height
 * it puts them side by side — two small Lock Screen-sized graphs per row — and only if even that
 * cannot hold them all does it draw the ones that fit and leave the rest out whole. What it never
 * draws is an entity whose block has been cut off below its name, which is what stacking did.
 *
 * `floorsFor` still asks for the comfortable single column, so in Home Assistant this mostly
 * matters while a card is being dragged, or under a saved size that predates an added entity.
 */
const packGraph = (n: number, width: number, height: number): Pack => {
  const fitsRows = (rows: number) => rows * GRAPH_MIN + (rows - 1) * GAP <= height
  const maxColumns = Math.max(1, Math.min(n, Math.floor((width + GAP) / (GRAPH_MIN_WIDTH + GAP))))

  let columns = maxColumns
  for (let c = 1; c <= maxColumns; c += 1) {
    if (fitsRows(Math.ceil(n / c))) {
      columns = c
      break
    }
  }
  const rowsThatFit = Math.max(1, Math.floor((height + GAP) / (GRAPH_MIN + GAP)))
  const shown = Math.min(n, columns * rowsThatFit)
  const rows = Math.ceil(shown / columns)
  const cellWidth = (width - (columns - 1) * GAP) / columns

  return { columns, rows, ring: 0, labels: true, shown, compact: cellWidth < GRAPH_EXTREMES_WIDTH }
}

// ---- Floors ---------------------------------------------------------------------

/**
 * The smallest footprint the card will admit to, given what it was asked to draw.
 *
 * This is the whole of the overflow design; see the module comment. Home Assistant's Layout
 * tab clamps its own sliders to `min_rows` / `min_columns`, so a card holding six rings
 * simply cannot be dragged down to a box that holds four, and there is no `+2 more`, no
 * scroller and no truncated state to design, document or test. The cost is a card that
 * sometimes insists on being bigger than the user first reached for, which is the honest
 * cost: it is how much room the content actually needs, not a taste the card is imposing.
 */
export const floorsFor = (style: ComplicationStyle, count: number): Floors => {
  const n = Math.max(1, count)

  if (isRectangular(style)) {
    const content = n * blockFor(style) + (n - 1) * GAP + 2 * INSET
    return { min_columns: columnsFor(STACK_MIN_WIDTH), min_rows: Math.max(3, rowsFor(content)) }
  }

  if (style === 'corner') {
    const across = Math.min(n, 2)
    const rows = Math.ceil(n / across)
    return {
      min_columns: columnsFor(across * CORNER_MIN + (across - 1) * GAP + 2 * INSET),
      min_rows: Math.max(3, rowsFor(rows * CORNER_MIN + (rows - 1) * GAP + 2 * INSET)),
    }
  }

  if (style === 'inline') {
    const content = n * INLINE_ROW + 2 * INSET
    // No floor of 3 here, unlike every other style: the whole point of this style is to be
    // the shortest card in the library, and one strip has no business asking for the 184px
    // that floor would impose on it.
    return { min_columns: columnsFor(STACK_MIN_WIDTH), min_rows: Math.max(1, rowsFor(content)) }
  }

  // Circular: lay them out at most four across, which is the widest row that still reads as
  // a widget rather than a strip of icons, then ask for the height that many rows need at
  // the minimum ring. `across` and `rows` mirror `packFor`'s own tiling exactly — see the
  // module comment on why that agreement is load-bearing rather than incidental.
  const across = Math.min(n, 4)
  const rows = Math.ceil(n / across)
  const neededWidth = across * RING_MIN + (across - 1) * GAP + 2 * INSET
  const neededHeight = rows * RING_MIN + (rows - 1) * GAP + 2 * INSET

  return {
    min_columns: columnsFor(neededWidth),
    min_rows: Math.max(3, rowsFor(neededHeight)),
  }
}

/**
 * A bento card's floor: two columns of the minimum square, and rows enough for every entity at
 * Small. No inset term, because a bento card draws no panel — each cell carries its own.
 */
export const bentoFloors = (count: number): Floors => {
  const box = bentoFloorBox(count)
  return {
    min_columns: columnsFor(box.width + 2 * BORDER),
    min_rows: Math.max(2, rowsFor(box.height + 2 * BORDER)),
  }
}
