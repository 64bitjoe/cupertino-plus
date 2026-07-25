import type { LovelaceGridOptions } from './types/ha'

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const
export type WidgetSize = (typeof WIDGET_SIZES)[number]

/** Zero-config default: the 2:1 shape reads well in every dashboard width. */
export const DEFAULT_SIZE: WidgetSize = 'medium'

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
 * Size presets chosen so that, in a section of the usual ~500px, the cards land on
 * Apple's widget proportions:
 *
 *   small   6 x 4  -> ~246 x 248  square
 *   medium 12 x 4  -> ~500 x 248  2:1
 *   large  12 x 8  -> ~500 x 504  square
 *
 * These are only defaults. Home Assistant spreads the user's `grid_options` *after*
 * whatever we return, so a card dragged to another size keeps the user's dimensions —
 * which is why layout is driven by measurement (see `layoutFromBox`) rather than by
 * the configured size.
 */
const GRID_OPTIONS: Record<WidgetSize, LovelaceGridOptions> = {
  small: { columns: 6, rows: 4, min_columns: 4, min_rows: 3 },
  medium: { columns: 12, rows: 4, min_columns: 6, min_rows: 3 },
  large: { columns: 12, rows: 8, min_columns: 6, min_rows: 5 },
}

export const gridOptionsFor = (size: WidgetSize): LovelaceGridOptions => ({ ...GRID_OPTIONS[size] })

/** Legacy masonry sizing, expressed in HA's ~50px units. */
export const cardSizeFor = (size: WidgetSize): number =>
  Math.round(rowsToPx(GRID_OPTIONS[size].rows as number) / 50)

export const isWidgetSize = (value: unknown): value is WidgetSize =>
  typeof value === 'string' && (WIDGET_SIZES as readonly string[]).includes(value)

export const resolveSize = (value: unknown): WidgetSize =>
  isWidgetSize(value) ? value : DEFAULT_SIZE

/**
 * Which layout to actually render, given the box the card ended up with.
 *
 * Thresholds sit halfway between the presets above, so a card resized by hand still
 * picks the layout that fits rather than the one it was configured with.
 */
export const layoutFromBox = (width: number, height: number): WidgetSize => {
  if (width < 340) return 'small'
  return height >= 380 ? 'large' : 'medium'
}
