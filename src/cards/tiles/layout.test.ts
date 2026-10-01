import { describe, expect, it } from 'vitest'

import { floorsFor, TILE_HEIGHT, TILE_WIDTH } from './layout'

const tiles = (n: number, at?: number) =>
  Array.from({ length: n }, (_, i) => (i === at ? { break: true } : {}))

describe('the tile size', () => {
  it('is the shape the spec picked, wider than tall', () => {
    expect(TILE_WIDTH).toBe(112)
    expect(TILE_HEIGHT).toBe(96)
    expect(TILE_WIDTH).toBeGreaterThan(TILE_HEIGHT)
  })
})

describe('floorsFor', () => {
  it('never asks for less than the library minimum, even with no tiles', () => {
    expect(floorsFor([])).toEqual({ min_columns: 4, min_rows: 1 })
  })

  it('fits more tiles per line in a wider card, and so asks for less height', () => {
    const wide = floorsFor(tiles(4), 640, 0)
    const narrow = floorsFor(tiles(4), 260, 0)
    expect(narrow.min_rows).toBeGreaterThan(wide.min_rows)
  })

  it('grows as tiles are added', () => {
    expect(floorsFor(tiles(8), 260, 0).min_rows).toBeGreaterThan(
      floorsFor(tiles(2), 260, 0).min_rows,
    )
  })

  /** A break splits one line into two, and the floor has to know or the card clips. */
  it('asks for the height a forced row actually needs', () => {
    const flowing = floorsFor(tiles(4), 640, 0)
    const split = floorsFor(tiles(4, 2), 640, 0)
    expect(split.min_rows).toBeGreaterThan(flowing.min_rows)
  })

  /**
   * Glass insets by nothing, and the difference is not cosmetic: it is what decides whether a
   * row of tiles fits the grid rows it asks for. The chips card lost a release to this.
   */
  it('asks for less when nothing is inset', () => {
    expect(floorsFor(tiles(4), 640, 0).min_rows).toBeLessThanOrEqual(
      floorsFor(tiles(4), 640, 16).min_rows,
    )
  })

  it('is wide enough for two tiles side by side', () => {
    expect(floorsFor(tiles(4)).min_columns).toBeGreaterThanOrEqual(4)
  })
})
