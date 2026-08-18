/**
 * The arithmetic of Home Assistant's sections grid, and the floors a card asks it for.
 *
 * Split out of `complication/layout.ts` when the chips card needed the same functions. This is
 * plumbing rather than taste — how many whole grid columns cover a width is a fact about the
 * grid, not a judgement about a widget — which is the line the complication card's own
 * `RING_MIN` comment draws when it declines to share a number that *is* a judgement.
 *
 * `GRID_COLUMNS` and `GRID_GAP` are re-declared from Home Assistant's own geometry rather than
 * imported from `core/size.ts`, which does not export them; a review finding on the
 * complication card flagged that drift risk, and one copy here is the answer to it.
 */

import { rowsToPx } from './size'
import type { LovelaceGridOptions } from './types/ha'

export interface Floors {
  min_columns: number
  min_rows: number
}

/**
 * The section width the floors are computed against.
 *
 * `getGridOptions()` is answered before anything is measured and cannot know how wide the
 * user's section is, so the floors assume the usual one — the same ~500px `core/size.ts`
 * calls typical and `DEFAULT_WIDTH` hard-codes. A narrower section makes the floors slightly
 * generous, which errs the safe way: generous floors mean a card that fits, just possibly
 * with a little more room than it strictly needed.
 */
export const ASSUMED_SECTION_WIDTH = 500
const GRID_COLUMNS = 12
const GRID_GAP = 8

/**
 * Named `grid…` rather than `columnsToPx` on purpose: `core/size.ts` exports a function of
 * that name taking the real section width, and this one assumes it instead. Two functions
 * with one name and different signatures is exactly how the wrong one gets imported.
 */
export const gridColumnsToPx = (columns: number): number => {
  const columnWidth = (ASSUMED_SECTION_WIDTH - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS
  return columns * columnWidth + (columns - 1) * GRID_GAP
}

/** The fewest whole grid columns whose width covers `px`, floored at the library's 4 —
 * `core/size.ts`'s own `MIN_COLUMNS`, below which the Layout tab does not offer a card. */
export const columnsFor = (px: number): number => {
  for (let c = 4; c < GRID_COLUMNS; c++) if (gridColumnsToPx(c) >= px) return c
  return GRID_COLUMNS
}

/**
 * The fewest whole grid rows whose height covers `px`, floored at 1 — and, unlike
 * `columnsFor`, not capped.
 *
 * `columnsFor`'s cap at `GRID_COLUMNS` is safe because 12 is a real ceiling: a section is
 * never wider than its own 12 columns, so no `px` this module ever asks it to cover can
 * exceed what column 12 provides. Rows have no such ceiling. `core/size.ts` sets no maximum
 * row count — a section simply keeps scrolling — and this card's own entity list is
 * uncapped by design (`model.ts`'s `readComplications` never drops one, the way the battery
 * card's four-device cap does). A `for (r = 1; r < N; r++)` with a hardcoded fallback would
 * silently under-report the floor the moment a config's content needed more than N rows,
 * which is exactly the bug this function used to have: it returned a bare `12` for any `px`
 * past `rowsToPx(11)`, with nothing checking that 12 rows actually covered it. Unbounded
 * instead, so the postcondition — `rowsToPx(rowsFor(px)) >= px` — holds for every `px`, not
 * just the ones a test happened to try. It still terminates: `rowsToPx` is strictly
 * increasing in `r`, so the loop always finds one.
 */
export const rowsFor = (px: number): number => {
  let r = 1
  while (rowsToPx(r) < px) r++
  return r
}

/**
 * The card's own floors, folded into the defaults Home Assistant was going to be handed.
 *
 * This exists as a function rather than as three lines inside `getGridOptions()` because
 * of what it is guarding. `core/size.ts`'s `gridOptions()` answers a flat `rows: 4` — it
 * has no idea this card exists, let alone how many entities it holds — and spreading the
 * floors on top of that raises only `min_rows`/`min_columns`, never the `rows`/`columns`
 * Home Assistant actually renders at before anybody touches the Layout tab. A three-entity
 * `rectangular` card floors at `min_rows: 6` and was still handed `rows: 4`: below its own
 * floor, and silently below it, because `ha-card` clips overflow rather than spilling it.
 * The third entity was not drawn cramped or truncated. It was simply not drawn.
 *
 * The card element cannot be unit-tested here — `vitest.config.ts` runs in node with no
 * DOM — so a test that reimplemented this merge would pass just as happily against the
 * broken version. Pulling it out is what lets the test import the thing the card actually
 * calls, which is the difference between a test that documents a fix and one that pins it.
 *
 * `columns` and `rows` accept the literals `'full'` and `'auto'` (`core/types/ha.ts`), and
 * `Number('full')` is `NaN`, so a blind `Math.max` would turn a deliberate literal into a
 * broken grid option. A literal is also already at least as generous as any floor this card
 * could ask for, so there is nothing to raise: only the numeric case is compared, and a
 * literal or an absent default passes through to the floor untouched.
 */
export const withFloors = (base: LovelaceGridOptions, floors: Floors): LovelaceGridOptions => ({
  ...base,
  ...floors,
  columns:
    typeof base.columns === 'number'
      ? Math.max(base.columns, floors.min_columns)
      : (base.columns ?? floors.min_columns),
  rows:
    typeof base.rows === 'number'
      ? Math.max(base.rows, floors.min_rows)
      : (base.rows ?? floors.min_rows),
})
