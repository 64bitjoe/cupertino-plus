import type { LovelaceGridOptions } from './types/ha'

/**
 * The two shapes the content comes in, and the geometry for choosing between them.
 *
 * Note what is NOT here: a configured size. There used to be a `size: small | medium`
 * config key with a preset each, and it earned its keep for about as long as it took to
 * notice that the sections layout already has a **Layout** tab which does the same job
 * better — any footprint, dragged, with a live preview. The card was measuring its own
 * box and picking a layout from that regardless, so the preset was never what decided
 * how the card looked; it only decided where the card started. Two controls for one
 * outcome, and the editor had to carry a helper line apologising for it ("The Layout tab
 * is overriding this").
 *
 * So: Home Assistant owns the footprint, this file owns the arithmetic, and the layout
 * is a consequence of the box rather than a thing the user is asked about twice.
 */
export const WIDGET_LAYOUTS = ['small', 'medium'] as const
export type WidgetLayout = (typeof WIDGET_LAYOUTS)[number]

/**
 * What to draw before the box has been measured.
 *
 * Not a preference — a first frame. `medium` because the default footprint below is the
 * wide one, so this is the answer the measurement is about to confirm in the common case,
 * and a card that guessed `small` would visibly reflow on arrival.
 */
export const DEFAULT_LAYOUT: WidgetLayout = 'medium'

/**
 * Geometry of Home Assistant's sections grid, read out of the shipped frontend:
 * 12 columns, `--ha-section-grid-row-height` 56px, row and column gap 8px.
 */
const COLUMNS = 12
const ROW_HEIGHT = 56
const GAP = 8

/** Rendered height of an N-row card, in px. */
export const rowsToPx = (rows: number): number => rows * ROW_HEIGHT + (rows - 1) * GAP

/** Rendered width of a C-column card inside a section `sectionWidth` px wide. */
export const columnsToPx = (columns: number, sectionWidth: number): number => {
  const columnWidth = (sectionWidth - (COLUMNS - 1) * GAP) / COLUMNS
  return columns * columnWidth + (columns - 1) * GAP
}

/**
 * The footprint a card arrives with, and how far it may be dragged.
 *
 * Full width by 4 rows, which in a section of the usual ~500px is about 500×248 — the 2:1
 * shape Apple's medium widget has, and the one that reads well at any dashboard width.
 * The column floor is what makes the other layout reachable: 4 columns comes to ~150px,
 * well under the threshold below, so a user who wants the square can simply drag to it.
 *
 * The row floor is 3, one short of the default, and what it promises is only that the card
 * fits: whatever cell the Layout tab hands us at that height, the card draws itself inside
 * it rather than over the card below — which is `_applyMinHeight` in `base-card.ts`, and
 * was the whole of why 4 rows used to look like the shortest a card could be.
 *
 * What three rows *holds* is the other question, and it is the row budget's answer rather
 * than this file's. 184px at 100% is one event under the date and two beside it in the wide
 * layout, one event and nothing else in the square; at 80% both columns gain a row, and at
 * 130% the date block takes the short column on its own. Thin at either end, and a widget
 * rather than a ruin only because `scale` exists to be turned down — which is why the floor
 * is worth offering and not a height to trust blindly. Below three the date block alone eats
 * the box at any scale.
 *
 * `max_columns` is deliberately absent. There is nothing to protect against — the flow
 * pours into two columns and the row budget follows the height, so a card dragged wider
 * just gets roomier.
 *
 * The `rows` and `columns` here are only defaults, and the wording matters: `hui-card`
 * spreads the user's `grid_options` AFTER whatever this returns, so anything dragged in
 * the Layout tab wins outright. Which is the point. The two floors are not overridden that
 * way — they are what the Layout tab clamps its own sliders to.
 */
const DEFAULT_COLUMNS = 12
const DEFAULT_ROWS = 4
const MIN_COLUMNS = 4
const MIN_ROWS = 3

export const gridOptions = (): LovelaceGridOptions => ({
  columns: DEFAULT_COLUMNS,
  rows: DEFAULT_ROWS,
  min_columns: MIN_COLUMNS,
  min_rows: MIN_ROWS,
})

/**
 * Legacy masonry sizing, in Home Assistant's ~50px units.
 *
 * Constant because masonry never asks how wide a card wants to be — it uses this only to
 * pick the shortest column to drop the card into.
 */
export const cardSize = (): number => Math.round(rowsToPx(DEFAULT_ROWS) / 50)

/**
 * Height to assume until the ResizeObserver has reported, and the floor a card keeps in
 * the masonry layout, where the cell imposes no height of its own.
 *
 * Not scaled by `config.scale`, and both halves of that are deliberate. As a first guess
 * it must match the box the card is about to be measured in, which in the sections layout
 * is this footprint whatever the type is set to — a scaled guess would budget rows for a
 * box that does not exist and reflow on arrival. As a floor it must not exceed the cell,
 * because `ha-card` takes `min-height` from it and a floor taller than the height the user
 * dragged is a card that spills over the one below it — so the floor is this height
 * clamped to the box actually measured, which `base-card.ts` does and explains.
 */
export const DEFAULT_HEIGHT = rowsToPx(DEFAULT_ROWS)

/**
 * The measured width, in px, at which a card stops being `small` and becomes `medium`.
 *
 * A little under half the ~500px a full-width card gets in a typical section, so the
 * flip lands at roughly 9 of the 12 columns. That is about right: two columns of event
 * rows need real width before they stop truncating every title.
 *
 * Exported because the showcase site starts its resizable box just under it, so that the
 * first drag anybody makes visibly reflows the card. A page that hard-coded that number
 * would go on doing it after this one moved.
 */
export const LAYOUT_THRESHOLD = 340

/**
 * Which layout to render, given the box the card actually ended up in.
 *
 * Only width decides. The two layouts differ in how many columns of content they hold,
 * not in how tall they are — height feeds the row budgets instead, so a card dragged
 * taller shows more rows rather than changing shape.
 *
 * `scale` is the factor from `config.scale`, and the threshold is compared against the
 * width in design units rather than in pixels — which is the only reading of it that
 * stays true. The threshold is a statement about type: two columns of event rows need so
 * much room before every title truncates. Draw that type 20% larger and the room they
 * need grows with it, so a card that was just wide enough is not any more.
 */
export const layoutFromBox = (width: number, scale = 1): WidgetLayout =>
  width / scale < LAYOUT_THRESHOLD ? 'small' : 'medium'
