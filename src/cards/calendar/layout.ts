/**
 * Step two: pour the flow into columns.
 *
 * Apple's widget does not scroll, so the whole thing is a budget in *rows*, where a row
 * is one line of text:
 *
 *   compact event   title + time              2 rows
 *   expanded event  title + location + time   3 rows
 *   all-day event   title                     1 row
 *   section heading                           1 row
 *   "2 more events"                           1 row
 *
 * A node goes in the current column if it fits whole, otherwise the next column takes
 * it. A heading never ends up alone at the bottom of a column — if its first event will
 * not follow it there, the entire section moves on.
 *
 * What is left over when the columns run out is summarised as `2 more events`, but only
 * if a row is spare to say it in: the indicator costs a row like everything else, and it
 * does not get to evict the event above it. A column that came out exactly full loses
 * its tail in silence — which is not a bug in the widget being copied, it is the reason
 * an event can simply vanish off the bottom of a full column.
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

export const COST = { header: 1, compact: 2, expanded: 3, more: 1, allday: 1 } as const

export type LayoutMode = 'small' | 'medium'

/**
 * What an item costs with no location line on it — the least it can be drawn for.
 *
 * An all-day entry is one line and only ever one line: no time to print under the
 * title, and no expanded form to print a location on. Anything else is two.
 *
 * Called for the node after a heading too, where a missing or unexpected node falls
 * back to the dearer answer: reserving too much only moves a section on, while
 * reserving too little would strand the heading.
 */
const plainCost = (node: FlowNode | undefined): number =>
  node?.type === 'item' && node.item.allDay ? COST.allday : COST.compact

/**
 * The tail indicator, `2 more events`.
 *
 * Not something `buildFlow` can produce: it is packing that discovers there was more
 * than would fit, so packing is what invents the row. It carries a colour because the
 * bar down its left says which calendar you are missing — the first one you cannot see.
 */
export interface MoreNode {
  type: 'more'
  key: string
  /** Items left undrawn. Never zero: with nothing hidden there is nothing to say. */
  count: number
  color: string
}

export type LayoutNode = FlowNode | MoreNode

export interface LayoutRow {
  node: LayoutNode
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
  /** The first node that has not been placed — where the tail begins. */
  let cursor = 0

  const room = (): number => {
    const column = columns[index]
    return column ? column.budget - column.used : 0
  }

  const place = (node: LayoutNode, cost: number, expanded: boolean): void => {
    const column = columns[index]
    if (!column) return
    column.used += cost
    column.rows.push({ node, cost, expanded })
  }

  for (; cursor < flow.length; cursor += 1) {
    const node = flow[cursor]
    if (index >= columns.length) break

    if (node.type === 'header') {
      // A heading is only worth its row if its first row can follow it in the same
      // column — and how much that costs depends on what it is: an all-day entry needs
      // one row where a timed event needs two.
      const need = COST.header + plainCost(flow[cursor + 1])
      if (room() < need) {
        index += 1
        if (index >= columns.length || room() < need) break
      }
      place(node, COST.header, false)
      continue
    }

    const wantsLocation = mode === 'medium' && hasLocation(node.item)
    const plain = plainCost(node)
    let cost = wantsLocation ? COST.expanded : plain

    if (room() < cost) {
      if (wantsLocation && room() >= plain) {
        // It is the location that does not fit, not the event. Drop the line, keep
        // the event where it is: moving it would leave a hole behind it.
        cost = plain
      } else {
        index += 1
        if (index >= columns.length || room() < plain) break
        cost = wantsLocation && room() >= COST.expanded ? COST.expanded : plain
      }
    }

    place(node, cost, cost === COST.expanded)
  }

  // The indicator before the slack, and in that order for a reason: in the small size a
  // spare row spent admitting that an event is missing beats one spent on a location.
  // "Count wins" is about how much of the day you know about, not how much is drawn.
  addMoreRow(columns, flow.slice(cursor), Math.min(index, columns.length - 1))
  if (mode === 'small') expandFromSlack(columns[0])

  return columns
}

/**
 * Summarise what did not fit, if there is a row left to summarise it in.
 *
 * The row goes at the end of the flow, which means the last column the flow reached
 * rather than whichever column happens to have space: a `2 more events` sitting under
 * the left column while the right one continues past it would be nonsense.
 *
 * Headings are not counted. A heading is not a thing you can miss — a section that got
 * cut takes its heading with it — and `2 more events` that meant "one event and one
 * Thursday" would be a lie.
 */
function addMoreRow(columns: LayoutColumn[], tail: readonly FlowNode[], index: number): void {
  const column = columns[index]
  if (!column || column.budget - column.used < COST.more) return

  let count = 0
  let color: string | undefined
  for (const node of tail) {
    if (node.type !== 'item') continue
    count += 1
    // The first thing you cannot see lends the row its colour.
    color ??= node.item.color
  }

  if (color === undefined) return
  column.used += COST.more
  column.rows.push({
    node: { type: 'more', key: 'more', count, color },
    cost: COST.more,
    expanded: false,
  })
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
 * The kinds of row are not equally dear per row — a heading is 26px for its one, a
 * `2 more events` 28px, an all-day chip 30px, an expanded item 82px for its three — so
 * the budget is priced at the most expensive of them, half of a compact row. Charging at
 * that rate means no mix of rows can overflow the column it was packed into.
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
