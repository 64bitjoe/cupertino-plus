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
 * `floorsFor` returns, so a card holding six rings simply cannot be dragged down to a box
 * that holds four. There is no `+2 more` indicator, no scroller, and no truncated state
 * anywhere in this card, and that is not an omission — it is what makes overflow
 * unreachable. A future change that adds one of those would be solving a problem this
 * design already closed off; the fix for a cramped card is `floorsFor` returning a bigger
 * number, not a face that hides what does not fit.
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

import { rowsToPx } from '../../core/size'
import { isRectangular, type ComplicationStyle } from './style'

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
}

export interface Floors {
  min_columns: number
  min_rows: number
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

/**
 * Must match `--cw-comp-gap`: the space between cells, rings across and down or blocks
 * stacked in the rectangular styles. Not spent on `inline`, which is deliberately not one
 * of these — `.grid.inline` overrides the gap to 0 and separates its strips with a
 * `border-top` hairline instead, which is why `floorsFor`'s inline branch below has no
 * gap term in it while the rectangular one does.
 */
const GAP = 14

/**
 * The caption's own line height, and the gap above it.
 *
 * `LABEL` must match `--cw-text-caption-2`'s line height — the caption is a single line,
 * `white-space: nowrap`, so there is no second line to budget for. `LABEL_GAP` must match
 * the `gap` on `.cell`, the flex column that stacks the ring and the caption under it. Named
 * separately, rather than folded into one constant, because each measures a different rule
 * in the stylesheet, and a reader checking one against its CSS twin should not have to
 * subtract the other out first.
 */
const LABEL = 13
const LABEL_GAP = 6

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

/** Must match `.cell.inline`'s `min-height`. The inline grid's own gap is 0 — the hairline
 * between strips is a `border-top`, not a track gap — so this is the whole per-row cost. */
const INLINE_ROW = 44

/** Must match `.cell.block`'s `min-height`, the rectangular family's shared floor. The three
 * rectangular styles differ only in chrome (`isRectangular`), never in how tall a block asks
 * to be, so one constant serves all three. */
const RECT_BLOCK = 104

/**
 * The width a stacking style needs before its single column starts truncating names and
 * readings rather than reading as a deliberately narrow card.
 *
 * A judgement call rather than a derivation, the way the battery card's `LAYOUT_THRESHOLD`
 * is: there is no formula that turns "the type stops looking cramped" into a number, only a
 * width to sanity-check by eye and hold steady once it has been.
 */
const STACK_MIN_WIDTH = 220

/**
 * The section width the floors are computed against.
 *
 * `getGridOptions()` is answered before anything is measured and cannot know how wide the
 * user's section is, so the floors assume the usual one — the same ~500px `core/size.ts`
 * calls typical and `DEFAULT_WIDTH` hard-codes. A narrower section makes the floors slightly
 * generous, which errs the safe way: generous floors mean a card that fits, just possibly
 * with a little more room than it strictly needed.
 */
const ASSUMED_SECTION_WIDTH = 500
const GRID_COLUMNS = 12
const GRID_GAP = 8

/**
 * Named `grid…` rather than `columnsToPx` on purpose: `core/size.ts` exports a function of
 * that name taking the real section width, and this one assumes it instead. Two functions
 * with one name and different signatures is exactly how the wrong one gets imported.
 */
const gridColumnsToPx = (columns: number): number => {
  const columnWidth = (ASSUMED_SECTION_WIDTH - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS
  return columns * columnWidth + (columns - 1) * GRID_GAP
}

/** The fewest whole grid columns whose width covers `px`, floored at the library's 4 —
 * `core/size.ts`'s own `MIN_COLUMNS`, below which the Layout tab does not offer a card. */
const columnsFor = (px: number): number => {
  for (let c = 4; c < GRID_COLUMNS; c++) if (gridColumnsToPx(c) >= px) return c
  return GRID_COLUMNS
}

/** The fewest whole grid rows whose height covers `px`, floored at 1. */
const rowsFor = (px: number): number => {
  for (let r = 1; r < 12; r++) if (rowsToPx(r) >= px) return r
  return 12
}

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

  // The stacking styles: one entity per row, full width, no ring to size. `isRectangular`
  // covers the three block chromes; `inline` stacks the same way for a different reason
  // (a strip meant to sit among other strips, not a cell of its own) but the geometry is
  // identical, so one branch draws both.
  if (isRectangular(style) || style === 'inline') {
    return { columns: 1, rows: n, ring: 0, labels: true }
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
  const labels = cellWidth >= LABEL_WIDTH && cellHeight >= RING_MIN + LABEL_GAP + LABEL
  const caption = labels ? LABEL_GAP + LABEL : 0

  // Floored to a whole design unit: the ring is handed to CSS as a length, and a fraction of
  // a unit multiplied by the scale factor is a row that can round its way over the inset.
  const ring = Math.max(RING_MIN, Math.floor(Math.min(RING_MAX, cellWidth, cellHeight - caption)))

  return { columns, rows, ring, labels }
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
    const content = n * RECT_BLOCK + (n - 1) * GAP + 2 * INSET
    return { min_columns: columnsFor(STACK_MIN_WIDTH), min_rows: Math.max(3, rowsFor(content)) }
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
