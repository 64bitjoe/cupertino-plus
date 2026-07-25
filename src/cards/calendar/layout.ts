/**
 * Step two: pour the flow into columns.
 *
 * Apple's widget does not scroll and does not say "+2 more" — it fits what fits and
 * drops the rest. The whole thing is therefore a budget in *rows*, where a row is one
 * line of text:
 *
 *   compact event   title + time              2 rows
 *   expanded event  title + location + time   3 rows
 *   section heading                           1 row
 *
 * A node goes in the current column if it fits whole, otherwise the next column takes
 * it; whatever is left over when the columns run out is dropped. A heading never ends
 * up alone at the bottom of a column — if its first event will not follow it there,
 * the entire section moves on.
 *
 * The two sizes disagree about locations, and the disagreement is deliberate:
 *
 *   Medium  greedy — a location wins even when it costs the next event its place.
 *           There is a second column to catch the overflow.
 *   Small   count first — everything is packed compactly, then locations are added
 *           back top-down out of whatever budget is left over. With four rows total,
 *           a location is a luxury that must not cost you an entire event.
 */

import type { FlowNode } from './flow'
import { hasLocation } from './model'

export const COST = { header: 1, compact: 2, expanded: 3 } as const

export type LayoutMode = 'small' | 'medium'

export interface LayoutRow {
  node: FlowNode
  /** Item rows only: whether the location line is drawn. */
  expanded: boolean
  cost: number
}

export interface LayoutColumn {
  budget: number
  used: number
  rows: LayoutRow[]
}

/**
 * Pack `flow` into columns of the given row budgets.
 *
 * A budget of 0 is meaningful: it is how the medium layout skips its left column on a
 * day with nothing in it, so the flow starts on the right.
 */
export function packFlow(
  flow: readonly FlowNode[],
  budgets: readonly number[],
  mode: LayoutMode,
): LayoutColumn[] {
  const columns: LayoutColumn[] = budgets.map(budget => ({ budget, used: 0, rows: [] }))
  let index = 0

  const room = (): number => {
    const column = columns[index]
    return column ? column.budget - column.used : 0
  }

  const place = (node: FlowNode, cost: number, expanded: boolean): void => {
    const column = columns[index]
    if (!column) return
    column.used += cost
    column.rows.push({ node, cost, expanded })
  }

  for (const node of flow) {
    if (index >= columns.length) break

    if (node.type === 'header') {
      // A heading is only worth its row if an event can follow it in the same column.
      if (room() < COST.header + COST.compact) {
        index += 1
        if (index >= columns.length || room() < COST.header + COST.compact) break
      }
      place(node, COST.header, false)
      continue
    }

    const wantsLocation = mode === 'medium' && hasLocation(node.item)
    let cost = wantsLocation ? COST.expanded : COST.compact

    if (room() < cost) {
      if (wantsLocation && room() >= COST.compact) {
        // It is the location that does not fit, not the event. Drop the line, keep
        // the event where it is: moving it would leave a hole behind it.
        cost = COST.compact
      } else {
        index += 1
        if (index >= columns.length || room() < COST.compact) break
        cost = wantsLocation && room() >= COST.expanded ? COST.expanded : COST.compact
      }
    }

    place(node, cost, cost === COST.expanded)
  }

  if (mode === 'small') expandFromSlack(columns[0])

  return columns
}

/**
 * Spend a small column's leftover rows on locations, top-down.
 *
 * Runs after packing, which is the whole point: one event in a four-row column shows
 * its location, two events do not — neither of them, even though the first one would
 * have fitted, because a lopsided pair reads worse than a tidy one.
 */
function expandFromSlack(column: LayoutColumn | undefined): void {
  if (!column) return
  for (const row of column.rows) {
    if (column.budget - column.used < COST.expanded - COST.compact) return
    if (row.node.type !== 'item' || row.expanded || !hasLocation(row.node.item)) continue
    row.expanded = true
    row.cost = COST.expanded
    column.used += COST.expanded - COST.compact
  }
}

// ---- Geometry -----------------------------------------------------------------
//
// Apple can hardcode "4 rows here, 7 rows there" because an iPhone widget is always
// the same number of points tall. A Home Assistant card is whatever the user dragged
// it to, so the budgets are measured instead — and the constants below are chosen so
// that a card at its default 4-grid-row height lands on exactly Apple's 4 and 7.

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/** Must match `--cw-flow-gap`, the space between two rows. */
const GAP = 6

/** Rendered height of a compact row: a title line, a time line, and the padding. */
const COMPACT_PX = 56

/**
 * What one row of the budget is allowed to cost in pixels, gap included.
 *
 * The three kinds of row are not equally dear per row — a heading is 26px for its one,
 * an expanded item 82px for its three — so the budget is priced at the most expensive
 * of them, half of a compact row. Charging at that rate means no mix of rows can
 * overflow the column it was packed into.
 */
const ROW = (COMPACT_PX + GAP) / COST.compact

/** Rendered height of the date block: weekday line + day numeral + its margin. */
const DATE_BLOCK = 84

/** How many rows fit in `space` px. The last row has no gap under it, hence the `+ GAP`. */
const rowsIn = (space: number): number => Math.max(0, Math.floor((space + GAP) / ROW))

export interface Geometry {
  /** Row budget per column, left to right. */
  budgets: number[]
}

/**
 * Row budgets for a card `height` pixels tall.
 *
 * The left column is short by the date block sitting above it; the right column has
 * the full height to itself. At the default 248px that is 4 and 7 — the numbers
 * Apple's own widget uses.
 */
export const geometryFor = (mode: LayoutMode, height: number, todayEmpty: boolean): Geometry => {
  const content = Math.max(0, height - 2 * INSET)
  const beside = rowsIn(content)
  const below = rowsIn(content - DATE_BLOCK)

  if (mode === 'small') return { budgets: [below] }
  // Nothing today means no left column to fill: the flow starts on the right, under
  // a `No Events Today` line.
  return { budgets: [todayEmpty ? 0 : below, beside] }
}
