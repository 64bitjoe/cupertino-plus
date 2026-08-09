import { describe, expect, it } from 'vitest'

import { gridOptions } from '../../core/size'
import { floorsFor, packFor, type Box } from './layout'
import { COMPLICATION_STYLES } from './style'

/** The two footprints the library designs for, in a section of the usual ~500px. */
const SMALL: Box = { width: 246, height: 248 }
const MEDIUM: Box = { width: 500, height: 248 }
const TALL: Box = { width: 500, height: 456 }

const shape = (style: Parameters<typeof packFor>[0], count: number, box: Box): string => {
  const pack = packFor(style, count, box)
  return `${pack.columns}×${pack.rows}, ring ${pack.ring}, ${pack.labels ? 'labelled' : 'bare'}`
}

describe('packFor, circular', () => {
  it('gives one entity the whole card, named', () => {
    expect(shape('circular', 1, SMALL)).toBe('1×1, ring 96, labelled')
  })

  it('puts them across before it puts them down', () => {
    expect(packFor('circular', 2, MEDIUM).columns).toBe(2)
    expect(packFor('circular', 3, MEDIUM).columns).toBe(3)
    expect(packFor('circular', 4, MEDIUM).columns).toBe(4)
  })

  it('wraps once a row would take the rings under the minimum', () => {
    const pack = packFor('circular', 6, SMALL)
    expect(pack.columns * pack.rows).toBeGreaterThanOrEqual(6)
    expect(pack.ring).toBeGreaterThanOrEqual(40)
  })

  it('drops the names when a cell is too narrow to caption', () => {
    expect(packFor('circular', 4, SMALL).labels).toBe(false)
    expect(packFor('circular', 2, MEDIUM).labels).toBe(true)
  })

  it('never draws a ring outside its bounds', () => {
    for (const count of [1, 2, 3, 4, 6, 8]) {
      for (const box of [SMALL, MEDIUM, TALL]) {
        const { ring } = packFor('circular', count, box)
        expect(ring).toBeGreaterThanOrEqual(40)
        expect(ring).toBeLessThanOrEqual(96)
      }
    }
  })

  it('prices the box in design units, so scale moves the answer', () => {
    expect(packFor('circular', 4, MEDIUM, 1).labels).toBe(true)
    expect(packFor('circular', 4, MEDIUM, 1.6).labels).toBe(false)
  })
})

describe('packFor, the stacking styles', () => {
  it('stacks rectangular one per row, full width, with no ring', () => {
    expect(shape('rectangular', 3, MEDIUM)).toBe('1×3, ring 0, labelled')
    expect(shape('rectangular-header', 2, MEDIUM)).toBe('1×2, ring 0, labelled')
    expect(shape('rectangular-bleed', 1, MEDIUM)).toBe('1×1, ring 0, labelled')
  })

  it('stacks inline the same way', () => {
    expect(shape('inline', 4, MEDIUM)).toBe('1×4, ring 0, labelled')
  })
})

/**
 * The floors are the whole of the overflow story: the Layout tab clamps its sliders to
 * these, so a card cannot be dragged smaller than the entities it was given.
 */
describe('floorsFor', () => {
  /**
   * Reference table, worked by hand from `gridColumnsToPx(c) = c * 34.33 + (c - 1) * 8` and
   * `rowsToPx(r) = r * 56 + (r - 1) * 8`, the same two functions `layout.ts` computes from.
   * If a case here changes, it should be because the constants above it changed, not because
   * the number was inconvenient.
   *
   * The `circular, 12` case was originally written as `min_rows: 4`. Reconciling it by hand:
   * at 12 entities, `across = min(12, 4) = 4` and `rows = ceil(12 / 4) = 3`, so the height
   * needed is `3 * RING_MIN + 2 * GAP + 2 * INSET = 120 + 28 + 32 = 180` design units.
   * `rowsToPx(3) = 3 * 56 + 2 * 8 = 184`, which already covers 180, so three grid rows are
   * enough and a fourth is not needed. `rowsFor(180)` returns 3, not 4 — the table's original
   * 4 was a hand-arithmetic slip, not a property of the geometry, and `packFor` confirms it:
   * fed a box exactly at `{ columns: 6, rows: 3 }` (246×184px, 212×150 design units inside
   * the insets), 12 circular entities tile 4×3 with `ring` landing exactly on `RING_MIN`
   * (40) — tight, but never below the floor. Changed to `min_rows: 3` below.
   */
  it('asks for more height as the entities pile up', () => {
    expect(floorsFor('circular', 1)).toEqual({ min_columns: 4, min_rows: 3 })
    expect(floorsFor('circular', 4)).toEqual({ min_columns: 6, min_rows: 3 })
    expect(floorsFor('circular', 8)).toEqual({ min_columns: 6, min_rows: 3 })
    expect(floorsFor('circular', 12)).toEqual({ min_columns: 6, min_rows: 3 })
  })

  it('gives the stacking styles a floor per entity', () => {
    expect(floorsFor('rectangular', 1)).toEqual({ min_columns: 6, min_rows: 3 })
    expect(floorsFor('rectangular', 2)).toEqual({ min_columns: 6, min_rows: 5 })
    expect(floorsFor('rectangular', 3)).toEqual({ min_columns: 6, min_rows: 6 })
  })

  it('lets inline be the shortest card in the library', () => {
    expect(floorsFor('inline', 1)).toEqual({ min_columns: 6, min_rows: 2 })
    expect(floorsFor('inline', 2)).toEqual({ min_columns: 6, min_rows: 2 })
    expect(floorsFor('inline', 4)).toEqual({ min_columns: 6, min_rows: 4 })
  })

  it('treats no entities as one, so an unconfigured card still has a shape', () => {
    expect(floorsFor('circular', 0)).toEqual(floorsFor('circular', 1))
  })

  /**
   * Regression: `rowsFor` used to search `r = 1..11` and fall back to a bare `12` with
   * nothing checking that 12 rows actually covered the content — safe for `columnsFor`,
   * where 12 is a real ceiling (a section has no more than 12 columns), but there is no
   * such ceiling on rows, and this card's entity list is uncapped by design. Seven
   * rectangular blocks is a perfectly ordinary config, and it already needs more than 12.
   *
   * Worked by hand: `content = n * RECT_BLOCK + (n - 1) * GAP + 2 * INSET
   * = 7*104 + 6*14 + 32 = 728 + 84 + 32 = 844` design units. `rowsToPx(12) = 12*56 + 11*8
   * = 672 + 88 = 760`, which is 84 short — nearly a whole `RECT_BLOCK` — so 12 rows is not
   * enough and the old code was silently wrong here. `rowsToPx(13) = 728 + 96 = 824` is
   * still short; `rowsToPx(14) = 784 + 104 = 888` is the first row count that covers 844,
   * so `min_rows: 14` is the correct floor.
   */
  it('keeps asking for more rows past the old hardcoded ceiling', () => {
    expect(floorsFor('rectangular', 7)).toEqual({ min_columns: 6, min_rows: 14 })
  })
})

/**
 * Pins the invariant `getGridOptions()` relies on `floorsFor` and `core/size.ts`'s
 * `gridOptions()` to jointly satisfy: the *default* footprint a card renders at before
 * anyone touches the Layout tab must never sit below its own floor.
 *
 * This was the whole of the Critical bug the final review caught. `gridOptions()`
 * returns a flat `{ rows: 4, columns: 12 }` with no idea this card exists, and the
 * original `getGridOptions()` only ever spread `floorsFor`'s `min_rows`/`min_columns` on
 * top of it — raising the floor a card could be dragged to without ever raising the
 * default it actually rendered at. A three-entity `rectangular` card floors at
 * `min_rows: 6` but was handed a default `rows: 4`, below its own floor; `ha-card` clips
 * overflow rather than spilling it (`theme/base-styles.ts`), so the third entity was not
 * drawn cramped, it was simply never drawn.
 *
 * Deliberately not a test of `CupertinoComplicationCard.getGridOptions()` itself: that
 * method lives on a custom element, and this suite runs in `environment: 'node'`
 * (`vitest.config.ts`) with no DOM to construct one against. The merge below is the same
 * one that method performs — raise a numeric default to the floor, leave a `'full'`/
 * `'auto'` literal untouched — reimplemented here as a pure function of two things this
 * file already has pure access to: `floorsFor` and the base defaults `core/size.ts`
 * provides. If the two implementations ever drift, this test and `complication-card.ts`
 * disagreeing is exactly the signal that should happen.
 */
describe('the default footprint never sits below its own floor', () => {
  it('holds for every style and a spread of entity counts', () => {
    const base = gridOptions()

    for (const style of COMPLICATION_STYLES) {
      for (const count of [0, 1, 2, 3, 5, 7, 12]) {
        const floors = floorsFor(style, count)

        // Same per-field merge as CupertinoComplicationCard.getGridOptions(): raise the
        // numeric case, leave a 'full'/'auto' literal (or an absent default) alone. Kept
        // as an explicit typeof check, not a shared generic helper, because columns and
        // rows carry two different literal types (number | 'full' vs number | 'auto')
        // and a helper typed to cover both stops TypeScript narrowing either one back
        // down to number for the assertion below.
        const columns =
          typeof base.columns === 'number'
            ? Math.max(base.columns, floors.min_columns)
            : (base.columns ?? floors.min_columns)
        const rows =
          typeof base.rows === 'number'
            ? Math.max(base.rows, floors.min_rows)
            : (base.rows ?? floors.min_rows)

        expect(typeof columns === 'string' || columns >= floors.min_columns).toBe(true)
        expect(typeof rows === 'string' || rows >= floors.min_rows).toBe(true)
      }
    }
  })
})
