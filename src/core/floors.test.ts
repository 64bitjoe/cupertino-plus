import { describe, expect, it } from 'vitest'

import { columnsFor, contentCardSize, contentGridOptions, rowsFor, withFloors } from './floors'
import { rowsToPx } from './size'

describe('columnsFor', () => {
  it('floors at the library minimum of four and caps at twelve', () => {
    expect(columnsFor(1)).toBe(4)
    expect(columnsFor(10_000)).toBe(12)
  })
})

describe('rowsFor', () => {
  it('always returns enough rows to cover the height asked for', () => {
    // The postcondition the unbounded search exists to guarantee, checked well past the
    // twelve rows the original hardcoded.
    for (const px of [1, 100, 248, 500, 1200, 4000]) {
      expect(rowsToPx(rowsFor(px))).toBeGreaterThanOrEqual(px)
    }
  })
})

describe('withFloors', () => {
  it('raises a numeric default up to the floor', () => {
    expect(withFloors({ columns: 6, rows: 4 }, { min_columns: 8, min_rows: 6 })).toEqual({
      columns: 8,
      rows: 6,
      min_columns: 8,
      min_rows: 6,
    })
  })

  it('never lowers a default that is already past the floor', () => {
    expect(withFloors({ columns: 12, rows: 9 }, { min_columns: 8, min_rows: 6 })).toMatchObject({
      columns: 12,
      rows: 9,
    })
  })

  it('leaves the literals alone, because Number(full) is NaN', () => {
    expect(
      withFloors({ columns: 'full', rows: 'auto' }, { min_columns: 8, min_rows: 6 }),
    ).toMatchObject({
      columns: 'full',
      rows: 'auto',
    })
  })

  it('falls back to the floor when there is no default at all', () => {
    expect(withFloors({}, { min_columns: 8, min_rows: 6 })).toMatchObject({ columns: 8, rows: 6 })
  })
})

describe('contentGridOptions', () => {
  it('asks for an auto height whatever the default rows were', () => {
    // A row count, however well chosen, quantises a 88px grid of tiles to 120 and leaves a
    // 32px strip of dashboard under it; auto is the only answer that is the content's height.
    expect(
      contentGridOptions(
        { columns: 12, rows: 4, min_columns: 4, min_rows: 3 },
        {
          min_columns: 5,
          min_rows: 2,
        },
      ),
    ).toEqual({ columns: 12, rows: 'auto', min_columns: 5, min_rows: 2 })
  })

  it('keeps min_rows at the content floor, which is what turning auto height off writes', () => {
    // hui-card-layout-editor writes rows = min_rows ?? 1 when a card defaulting to auto has
    // its Auto height switch turned off, so min_rows is the row count the user lands on.
    const options = contentGridOptions({ columns: 12, rows: 4 }, { min_columns: 4, min_rows: 3 })
    expect(options.min_rows).toBe(3)
    expect(options.max_rows).toBeUndefined()
  })

  it('still raises the columns to the floor', () => {
    expect(contentGridOptions({ columns: 4 }, { min_columns: 6, min_rows: 1 }).columns).toBe(6)
  })
})

describe('contentCardSize', () => {
  it('is the floor in masonry units of 50px, rounded up so a column is never undercounted', () => {
    expect(contentCardSize({ min_columns: 4, min_rows: 1 })).toBe(2) // 56px
    expect(contentCardSize({ min_columns: 4, min_rows: 2 })).toBe(3) // 120px
    expect(contentCardSize({ min_columns: 4, min_rows: 3 })).toBe(4) // 184px
  })
})
