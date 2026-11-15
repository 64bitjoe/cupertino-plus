/**
 * Bento: the card's entities as separate rounded cells of different sizes, packed into one grid
 * with even gutters — the feature grids of Apple's keynotes, and the widget stacks of macOS and
 * iPadOS, where a large widget sits beside two small ones. Each cell is its own surface and can
 * wear its own face.
 *
 * Pure, like `layout.ts`: the grid a footprint affords, the sizes and faces chosen for rows that
 * do not say, and the packing, are all node tests. The card only draws what this decides.
 *
 * ## The rules
 *
 *  - **The footprint sets the grid.** As many columns as fit at `BENTO_MIN` design units each
 *    (two at the Small footprint, four at Medium), between `BENTO_MIN_COLUMNS` and
 *    `BENTO_MAX_COLUMNS`; as many rows as fit at the same minimum height.
 *  - **A row's own size is honoured where it fits.** Absent, the first entity is Large when the
 *    grid has room for it and everything else, then Wide, then Small, and every other entity is
 *    Small — the keynote grid's one hero and its supporting tiles.
 *  - **Packed densely, top to bottom.** Each cell takes the first place it fits, scanning rows
 *    then columns, so a Small after a Large fills the hole beside it (CSS's `dense`, decided
 *    here so the card knows what fits).
 *  - **Shrunk before it is dropped, and dropped whole.** A cell that does not fit tries the next
 *    size down (Large, Wide or Tall, then Small); one that fits at no size is left out entirely.
 *    Nothing is ever drawn cut off at the card's edge.
 */

import { GAP } from './metrics'
import { isCircular, isRectangular, type ComplicationStyle } from './style'
import { isOneOf } from '../../core/one-of'

export const COMPLICATION_LAYOUTS = ['panel', 'bento'] as const
export type ComplicationLayout = (typeof COMPLICATION_LAYOUTS)[number]
export const DEFAULT_LAYOUT: ComplicationLayout = 'panel'

export const layoutFor = (value: unknown): ComplicationLayout =>
  value === 'bento' ? 'bento' : DEFAULT_LAYOUT

export const BENTO_SIZES = ['small', 'wide', 'tall', 'large'] as const
export type BentoSize = (typeof BENTO_SIZES)[number]

export const BENTO_SIZE_LABELS: Record<BentoSize, string> = {
  small: 'Small — one square',
  wide: 'Wide — two squares across',
  tall: 'Tall — two squares down',
  large: 'Large — two by two',
}

export const SPANS: Record<BentoSize, { columns: number; rows: number }> = {
  small: { columns: 1, rows: 1 },
  wide: { columns: 2, rows: 1 },
  tall: { columns: 1, rows: 2 },
  large: { columns: 2, rows: 2 },
}

export const isBentoSize = (value: unknown): value is BentoSize => isOneOf(BENTO_SIZES, value)

/** The smallest a bento square may be, in design units: a 40-unit ring with its caption. */
export const BENTO_MIN = 96
export const BENTO_MIN_COLUMNS = 2
export const BENTO_MAX_COLUMNS = 6
/** The gutter between cells: the panel's own gap (`metrics.ts`), which the stylesheet reads too. */
export const BENTO_GAP = GAP

export interface BentoGrid {
  columns: number
  rows: number
}

/** The grid a box of `width` × `height` design units affords. */
export const bentoGrid = (width: number, height: number): BentoGrid => {
  const fit = (length: number) => Math.floor((length + BENTO_GAP) / (BENTO_MIN + BENTO_GAP))
  return {
    columns: Math.min(BENTO_MAX_COLUMNS, Math.max(BENTO_MIN_COLUMNS, fit(width))),
    rows: Math.max(1, fit(height)),
  }
}

const area = (size: BentoSize): number => SPANS[size].columns * SPANS[size].rows

/**
 * Every row's size: its own where it set one, otherwise the hero rule — the first entity Large
 * if the grid holds it beside everything else at their sizes, else Wide, else Small; the rest
 * Small.
 */
export const bentoSizes = (
  explicit: readonly (BentoSize | undefined)[],
  grid: BentoGrid,
): BentoSize[] => {
  const capacity = grid.columns * grid.rows
  const others = explicit.slice(1).reduce((sum, size) => sum + area(size ?? 'small'), 0)
  return explicit.map((size, index) => {
    if (size !== undefined) return size
    if (index > 0) return 'small'
    for (const hero of ['large', 'wide'] as const) {
      const span = SPANS[hero]
      if (
        span.columns <= grid.columns &&
        span.rows <= grid.rows &&
        area(hero) + others <= capacity
      ) {
        return hero
      }
    }
    return 'small'
  })
}

export interface BentoPlacement {
  /** The entity's index in the configured list. */
  index: number
  size: BentoSize
  column: number
  row: number
  columns: number
  rows: number
}

export interface BentoPack {
  placements: BentoPlacement[]
  /** The rows actually used; the card divides its height between these. */
  rows: number
  /** Indices left out because they fit nowhere at any size. */
  dropped: number[]
}

/** The sizes a cell tries, in order, when its own does not fit. */
const FALLBACKS: Record<BentoSize, BentoSize[]> = {
  large: ['large', 'wide', 'tall', 'small'],
  wide: ['wide', 'small'],
  tall: ['tall', 'small'],
  small: ['small'],
}

/** Dense first-fit packing into `grid`; see the module comment for the rules. */
export const packBento = (sizes: readonly BentoSize[], grid: BentoGrid): BentoPack => {
  const taken: boolean[][] = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.columns }, () => false),
  )
  const free = (row: number, column: number, rows: number, columns: number): boolean => {
    if (row + rows > grid.rows || column + columns > grid.columns) return false
    for (let r = row; r < row + rows; r += 1) {
      for (let c = column; c < column + columns; c += 1) if (taken[r]?.[c]) return false
    }
    return true
  }

  const placements: BentoPlacement[] = []
  const dropped: number[] = []

  sizes.forEach((wanted, index) => {
    for (const size of FALLBACKS[wanted]) {
      const span = SPANS[size]
      for (let row = 0; row < grid.rows; row += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
          if (!free(row, column, span.rows, span.columns)) continue
          for (let r = row; r < row + span.rows; r += 1) {
            for (let c = column; c < column + span.columns; c += 1) {
              const line = taken[r]
              if (line) line[c] = true
            }
          }
          placements.push({ index, size, column, row, columns: span.columns, rows: span.rows })
          return
        }
      }
    }
    dropped.push(index)
  })

  const rows = placements.reduce((most, cell) => Math.max(most, cell.row + cell.rows), 1)
  return { placements, rows, dropped }
}

/** What `bentoFace` needs to know about the reading. */
export interface FaceHints {
  /** A number, so a history graph has something to draw. */
  numeric: boolean
  /** A range or a countdown, so a gauge has something to fill. */
  gauge: boolean
}

/**
 * The face a cell wears: the row's own `style` when it set one, otherwise the one its size
 * reads best as. A square is a ring (the card's own circular face, if it has one). A wide cell
 * is a rectangle, with the graph for a number. A tall cell is the open gauge where there is
 * something to fill, else a ring. The large hero is the graph for a number, the gauge for a
 * range or countdown, and a plain rectangle otherwise.
 */
export const bentoFace = (
  size: BentoSize,
  cardStyle: ComplicationStyle,
  rowStyle: ComplicationStyle | undefined,
  hints: FaceHints,
): ComplicationStyle => {
  if (rowStyle !== undefined) return rowStyle
  switch (size) {
    case 'small':
      return isCircular(cardStyle) ? cardStyle : 'circular'
    case 'wide':
      if (hints.numeric) return 'rectangular-graph'
      return isRectangular(cardStyle) ? cardStyle : 'rectangular'
    case 'tall':
      return hints.gauge ? 'gauge' : 'circular'
    default:
      if (hints.numeric) return 'rectangular-graph'
      if (hints.gauge) return 'gauge'
      return isRectangular(cardStyle) ? cardStyle : 'rectangular'
  }
}

/**
 * The smallest footprint a bento card admits to: two columns, and enough rows of the minimum
 * square to hold every entity at Small. A row set Large asks for more only by being packed —
 * at the floor it shrinks before anything is dropped.
 */
export const bentoFloorBox = (count: number): { width: number; height: number } => {
  const rows = Math.max(1, Math.ceil(Math.max(1, count) / BENTO_MIN_COLUMNS))
  return {
    width: BENTO_MIN_COLUMNS * BENTO_MIN + (BENTO_MIN_COLUMNS - 1) * BENTO_GAP,
    height: rows * BENTO_MIN + (rows - 1) * BENTO_GAP,
  }
}
