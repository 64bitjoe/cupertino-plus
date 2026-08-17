import { describe, expect, it } from 'vitest'

import { columnsFor, rowsFor, withFloors } from './floors'
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
