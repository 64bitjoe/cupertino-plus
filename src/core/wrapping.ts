/**
 * How a row of content-width things wraps, and how many lines that takes.
 *
 * Extracted from `chips/layout.ts` when the tiles card needed the same arithmetic over a
 * different item. Two cards wanting a thing is the point at which where it belongs becomes a
 * question worth answering — the same move `moveRow` and the tint palette already made.
 *
 * Worth stating what is being protected, because every line of this was earned by a bug the
 * chips card shipped and a user reported:
 *
 *  - the width must come from the card's own measurement rather than an assumed section width,
 *    or a card in a wide column is priced for a narrow one and buys empty rows;
 *  - each item must be priced from what it actually draws rather than a flat constant per kind,
 *    or a row that visibly fits is counted as two lines;
 *  - a filling item is elastic and costs nothing, or it invents a line the browser never draws;
 *  - the container's inset has to be passed in rather than assumed, because `glass` insets by
 *    nothing and `card` by 16.
 *
 * Those four are not obvious and are not recoverable by reading the rendered output. A second
 * copy of this file would lose them one at a time.
 *
 * Every number is a design unit: pixels at `scale: 1`.
 */

/** Must match `--cw-inset`, the padding inside the card — in `card` mode. `glass` passes 0. */
export const INSET = 16

/**
 * One thing being laid out, as far as the wrapping is concerned.
 *
 * Deliberately narrow: a width, and two flags. A caller's own view type satisfies it
 * structurally, which is what lets one function serve a chip and a tile without either card
 * learning about the other.
 */
export interface WrapItem {
  width: number
  /** Starts a new row. */
  break?: boolean
  /** Absorbs the row's leftover width; costs nothing and never pushes a line. */
  fill?: boolean
}

/**
 * The items split into the rows they were asked to be drawn on.
 *
 * An item carrying `break` starts a new row; everything else joins the row before it. A `break`
 * on the very first item is ignored rather than honoured into a leading empty row: every item
 * starts a row when it is the first one, so the flag says nothing there. That matters more than
 * it sounds, because dragging an item to the top is how a config acquires one, and an empty row
 * is a row of unexplained gap above the card's content.
 *
 * Generic over anything carrying `break`, so a caller passes its own rows and gets its own rows
 * back rather than a projection it then has to map against.
 */
export const groupRows = <T extends { break?: boolean }>(items: readonly T[]): T[][] => {
  const rows: T[][] = []
  for (const item of items) {
    if (item.break === true && rows.length > 0) rows.push([item])
    else if (rows.length === 0) rows.push([item])
    else (rows[rows.length - 1] as T[]).push(item)
  }
  return rows
}

/**
 * How many lines these items wrap onto at `usable` width.
 *
 * Each configured row wraps on its own, so the total is the sum of each row's own wrapping
 * rather than of the whole list's: a card using `break` split one-and-two is two lines, not one,
 * and an under-reported line count is a card handed a box too short for its content, which
 * `ha-card` resolves by clipping rather than by spilling.
 */
export const linesFor = (items: readonly WrapItem[], usable: number, gap: number): number =>
  groupRows(items).reduce((total, row) => {
    let used = 0
    let rowLines = 1
    for (const item of row) {
      // Elastic, so it never pushes a line, and it is skipped outright rather than contributing
      // a gap of its own.
      if (item.fill === true || item.width === 0) continue
      const need = used === 0 ? item.width : used + gap + item.width
      // `used > 0` is what stops an item wider than the whole line from wrapping onto a line it
      // would not fit either: it gets the line it is on, and overflows it visibly rather than
      // being counted twice.
      if (need > usable && used > 0) {
        rowLines += 1
        used = item.width
      } else {
        used = need
      }
    }
    return total + rowLines
  }, 0)
