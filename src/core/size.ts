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
 * The floor is what makes the other layout reachable: 4 columns comes to ~150px, well
 * under the threshold below, so a user who wants the square can simply drag to it.
 *
 * `max_columns` is deliberately absent. There is nothing to protect against — the flow
 * pours into two columns and the row budget follows the height, so a card dragged wider
 * just gets roomier.
 *
 * These are only defaults, and the wording matters: `hui-card` spreads the user's
 * `grid_options` AFTER whatever this returns, so anything dragged in the Layout tab wins
 * outright. Which is the point.
 */
const DEFAULT_COLUMNS = 12
const DEFAULT_ROWS = 4

export const gridOptions = (): LovelaceGridOptions => ({
  columns: DEFAULT_COLUMNS,
  rows: DEFAULT_ROWS,
  min_columns: 4,
  min_rows: 3,
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
 */
export const DEFAULT_HEIGHT = rowsToPx(DEFAULT_ROWS)

/**
 * Which layout to render, given the box the card actually ended up in.
 *
 * Only width decides. The two layouts differ in how many columns of content they hold,
 * not in how tall they are — height feeds the row budgets instead, so a card dragged
 * taller shows more rows rather than changing shape.
 *
 * 340px is a little under half the ~500px a full-width card gets in a typical section,
 * so the flip lands at roughly 9 of the 12 columns. That is about right: two columns of
 * event rows need real width before they stop truncating every title.
 */
export const layoutFromBox = (width: number): WidgetLayout => (width < 340 ? 'small' : 'medium')
