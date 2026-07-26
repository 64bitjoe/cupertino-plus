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
 * it. A heading is one such node and holds nothing back for what follows it: it is drawn
 * wherever its one row fits, and its first event goes into the next column if that is where
 * there is room for it. Nothing is ever skipped over to make something later fit: the flow is
 * chronological, so today is drawn before tomorrow is drawn before Sunday, and what falls
 * off the bottom is always the far end of the week.
 *
 * What is left over is summarised as `2 more events`, and that row speaks for ONE DAY —
 * the section it lands in, never the whole loaded fortnight behind it. It costs a row
 * like everything else, and on a column that came out exactly full it buys one: a
 * location line gives way first, and failing that the last event drawn steps aside and
 * joins the count. What it will not buy is its own section's last visible row — that trade
 * spends the one event of the day the reader could actually read.
 *
 * A heading is allowed to end a column, then, but not the card: a heading with the count
 * under it says how much of its day did not fit, while a heading with nothing under it
 * announces its own absence. `dropTrailingHeader` is the whole of that guard.
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
import { hasLocation, type CalendarItem } from './model'

export const COST = { header: 1, compact: 2, expanded: 3, more: 1, allday: 1 } as const

export type LayoutMode = 'small' | 'medium'

/**
 * What an item costs with no location line on it — the least it can be drawn for.
 *
 * An all-day entry is one line and only ever one line: no time to print under the
 * title, and no expanded form to print a location on. Anything else is two.
 */
const plainCost = (node: FlowNode): number =>
  node.type === 'item' && node.item.allDay ? COST.allday : COST.compact

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
      // Its own row and nothing reserved behind it. What this replaces held back the cost
      // of the first event as well and moved the whole section on if that would not fit,
      // which cost the widget headings it was perfectly able to draw — and the screenshots
      // do not do it either: `WEDNESDAY, 29 JUL` appears above a `1 more event` with not
      // one of that day's events drawn. `dropTrailingHeader` is all that is left of it.
      if (room() < COST.header) {
        index += 1
        if (index >= columns.length || room() < COST.header) break
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
  // "Count wins" is about how much of the day you know about, not how much is drawn — and
  // it is why the indicator may take a row back off the packing above, never the reverse.
  addMoreRow(columns, flow.slice(cursor), Math.min(index, columns.length - 1))
  dropTrailingHeader(columns)
  if (mode === 'small') expandFromSlack(columns[0])

  return columns
}

/**
 * Summarise what did not fit, if there is anything to summarise and a row to buy for it.
 *
 * The row goes at the end of the flow, which means the last column the flow reached
 * rather than whichever column happens to have space: a `2 more events` sitting under
 * the left column while the right one continues past it would be nonsense.
 *
 * **It counts one day, not the window.** `N` is the rest of the section the row lands in,
 * so the tail is read only as far as the next heading. A card that said `19 more events`
 * was answering a question nobody asked — how busy the loaded fortnight is — while the
 * line sits inside `TOMORROW`, where it reads as a statement about tomorrow. Two events
 * of five drawn under that heading is `3 more events`, whatever the rest of the month
 * holds. The days past the cut are not mentioned at all, and that is the honest answer:
 * there is no section on screen for them to be counted in.
 *
 * Headings are not counted either, for the same reason they end the count: a section that
 * got cut takes its heading with it, and `2 more events` meaning "one event and one
 * Thursday" would be a lie.
 */
function addMoreRow(columns: LayoutColumn[], tail: readonly FlowNode[], index: number): void {
  const column = columns[index]
  if (!column) return

  let count = 0
  let color: string | undefined
  for (const node of tail) {
    // The next day starts here, and it is not this row's day to speak for.
    if (node.type === 'header') break
    count += 1
    // The first thing you cannot see lends the row its colour.
    color ??= node.item.color
  }

  if (color === undefined) return

  // A count wants a calendar above it, and that is a rule about the column rather than
  // about the trade: `evictLast` below refuses to leave "a column holding a count and no
  // calendar", and a column too short to have fitted an event in the first place is the
  // same shape reached without giving anything up. Same answer, and it is what keeps the
  // small size monotonic — one row more room draws the event and says nothing, so one row
  // less must not drop the event and announce it instead.
  if (!column.rows.some(placed => placed.node.type === 'item')) return

  if (column.budget - column.used < COST.more) {
    // Nothing was spare, so the row is bought — cheapest first, and a location line is
    // always cheaper than an event. Either way it is exactly the one row that is short,
    // never two: `used` cannot exceed `budget`, so the shortfall is `COST.more` at most.
    const hidden = reclaimLocation(column) ? undefined : evictLast(column)
    if (hidden) {
      count += 1
      // It has overtaken the tail as the first thing you cannot see.
      color = hidden.color
    } else if (column.budget - column.used < COST.more) {
      return
    }
  }

  column.used += COST.more
  column.rows.push({
    node: { type: 'more', key: 'more', count, color },
    cost: COST.more,
    expanded: false,
  })
}

/**
 * Take back a heading that turned out to be the last thing drawn anywhere.
 *
 * The only guard left on the heading rule, and the reason it is a pass at the end rather
 * than a reservation at the front: whether a heading was worth its row is not knowable
 * when it is placed. `2 more events` may still arrive underneath it, and a heading with a
 * count under it is a section saying how much of itself did not fit. A heading with
 * nothing under it announces its own absence, which is worth neither the row nor the
 * reading.
 *
 * After `addMoreRow`, therefore, and nothing is retried once the heading goes. The row it
 * gives back belongs to the section just removed — the tail begins with that section's
 * first event — so a count bought with it would sit under the previous day's rows and be
 * read as that day's.
 *
 * The last drawn row is enough to test: rows are a prefix of the flow, so a heading with
 * anything after it at all has that something in the next column, where the flow carries
 * on and the reader follows it.
 */
function dropTrailingHeader(columns: LayoutColumn[]): void {
  const drawn = columns.filter(column => column.rows.length)
  const column = drawn[drawn.length - 1]
  if (!column) return
  const last = column.rows[column.rows.length - 1]
  if (last?.node.type !== 'header') return
  column.rows.pop()
  column.used -= last.cost
}

/**
 * Take back the last location line drawn in `column`, freeing its row.
 *
 * The last rather than the first: locations are handed out top-down, so the one given
 * last is the one given most cheaply, and taking it back leaves the top of the column
 * where the reader last saw it. This only ever finds anything in the medium size — the
 * small size packs compactly and expands out of the slack afterwards, which is the same
 * priority arrived at from the other direction (§5, §6).
 */
function reclaimLocation(column: LayoutColumn): boolean {
  for (let index = column.rows.length - 1; index >= 0; index -= 1) {
    const row = column.rows[index]
    if (!row?.expanded) continue
    row.expanded = false
    row.cost = COST.compact
    column.used -= COST.expanded - COST.compact
    return true
  }
  return false
}

/**
 * Give up the last event drawn in `column`, and answer with what is now hidden.
 *
 * The trade the indicator is allowed to make: one event you can see for the knowledge
 * that several exist. Refused — `undefined`, and the widget says nothing — when the row
 * above is not an event of its own, which is the two cases where the trade costs more than
 * the row is worth. Nothing above would leave a column holding a count and no calendar. A
 * heading above would spend the only event of a day the reader can read on a number: the
 * shape that comes out, `TOMORROW` over `3 more events`, is a legitimate one when a spare
 * row paid for it, and it is not worth an event when it has to be bought.
 */
function evictLast(column: LayoutColumn): CalendarItem | undefined {
  const last = column.rows[column.rows.length - 1]
  const above = column.rows[column.rows.length - 2]
  if (last?.node.type !== 'item' || above?.node.type !== 'item') return undefined

  column.rows.pop()
  column.used -= last.cost
  return last.node.item
}

/**
 * Spend a small column's leftover rows on locations, top-down.
 *
 * Runs after packing, which is the whole point: one event in a four-row column shows
 * its location, two events do not — neither of them, even though the first one would
 * have fitted, because a lopsided pair reads worse than a tidy one.
 *
 * It runs after the indicator too, so a row the indicator freed and did not need is slack
 * like any other: an eviction gives back two rows and spends one, and the odd one left
 * over goes on the location of an event still on screen rather than on white space.
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
//
// Every number here is in **design units** — pixels at `scale: 100`. `config.scale`
// multiplies what the card actually draws, so `geometryFor` divides the box it measured
// by the same factor and the rest of this section needs to know nothing about it. That is
// the whole reason for dividing rather than for scaling each constant in turn: there is
// one place to get it wrong instead of six, and the numbers below go on matching the CSS
// comments that name them.

/** Must match `--cw-inset`, the padding inside the card. */
const INSET = 16

/**
 * The border `ha-card` draws, top and bottom.
 *
 * Home Assistant's own card carries `border-width: var(--ha-card-border-width, 1px)` and
 * is `box-sizing: border-box`, so those two pixels come out of the height the card was
 * measured at rather than being added to it. Two pixels is one clipped descender on a
 * column packed exactly full, which is precisely the case the budget exists to prevent.
 */
const BORDER = 1

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
 * Row budgets for a card `height` pixels tall, drawn at `scale`.
 *
 * The left column is short by the date block sitting above it; the right column has
 * the full height to itself. At the default 248px that is 4 and 7 — the numbers
 * Apple's own widget uses.
 *
 * The border is subtracted in pixels and the inset in design units, which looks like an
 * inconsistency and is the point: `ha-card` draws its 1px border at the same 1px however
 * the widget inside it is scaled, while `--cw-inset` is one of the lengths that scales. So
 * the pixels come off first, and what is left is divided into the units everything below
 * is priced in.
 */
export const geometryFor = (
  mode: LayoutMode,
  height: number,
  todayEmpty: boolean,
  scale = 1,
): Geometry => {
  const content = Math.max(0, (height - 2 * BORDER) / scale - 2 * INSET)
  const beside = rowsIn(content)
  const below = rowsIn(content - DATE_BLOCK)

  if (mode === 'small') return { budgets: [below] }
  // Nothing left today means no left column to fill: the flow starts on the right, under
  // the `No (More) Events Today` line.
  return { budgets: [todayEmpty ? 0 : below, beside] }
}
