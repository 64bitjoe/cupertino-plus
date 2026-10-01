import { describe, expect, it } from 'vitest'

import { floorsFor, TILE_HEIGHT, TILE_MIN_WIDTH } from './layout'

const tiles = (n: number, at?: number) =>
  Array.from({ length: n }, (_, i) => (i === at ? { break: true } : {}))

describe('the tile size', () => {
  it('is the shape the renders settled on: a floor on the width, a fixed height', () => {
    expect(TILE_MIN_WIDTH).toBe(96)
    expect(TILE_HEIGHT).toBe(88)
  })

  /** The number the minimum is chosen for: the user's own glass column, four across. */
  it('fits four across a 425 glass section, the column the first live dashboard had', () => {
    expect(4 * TILE_MIN_WIDTH + 3 * 8).toBeLessThanOrEqual(425)
  })
})

/**
 * Why the height is 88: it is the tallest tile for which the two commonest grids land exactly
 * on Home Assistant's rows rather than one row over.
 */
describe('the tile height against the sections grid', () => {
  it('fits two lines of glass tiles in three rows', () => {
    expect(floorsFor([{}, {}, {}, {}], 2 * TILE_MIN_WIDTH + 8, 0).min_rows).toBe(3)
  })

  it('fits one line of tiles inside the card container in two rows', () => {
    expect(floorsFor([{}, {}], 500, 16).min_rows).toBe(2)
  })
})

describe('floorsFor', () => {
  it('never asks for less than the library minimum, even with no tiles', () => {
    expect(floorsFor([])).toEqual({ min_columns: 4, min_rows: 1 })
  })

  /**
   * The user's dashboard: four tiles in a glass column of about 425. At the old fixed 112 the
   * fourth wrapped alone and the floor asked for three rows; a stretching tile wraps only below
   * its minimum, so all four sit on one line and the card asks for two.
   */
  it('puts four tiles on one line across a 425 glass section', () => {
    expect(floorsFor(tiles(4), 425, 0).min_rows).toBe(2)
  })

  /** The open item the stretching tile closes: card mode across 500 used to fit only three. */
  it('fits four across a 500 section in card mode, inside both insets', () => {
    expect(floorsFor(tiles(4), 500, 16).min_rows).toBe(2)
  })

  /**
   * Priced at the wrap point exactly, as CSS grid's auto-fill counts it: four minimums and three
   * gaps is 408, and one unit less is a second line.
   */
  it('wraps exactly where the grid does', () => {
    expect(floorsFor(tiles(4), 408, 0).min_rows).toBe(2)
    expect(floorsFor(tiles(4), 407, 0).min_rows).toBe(3)
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
    // 408 is four minimums and three gaps: one line on glass. The card's two 16 insets leave
    // 376, which wraps three and one, and the second line costs two more grid rows.
    expect(floorsFor(tiles(4), 408, 0).min_rows).toBe(2)
    expect(floorsFor(tiles(4), 408, 16).min_rows).toBe(4)
  })

  /** Two minimums and a gap is 200: five grid columns (204) on glass, six (246) in a card. */
  it('is wide enough for two tiles side by side, plus the inset on each side', () => {
    expect(floorsFor(tiles(4), undefined, 0).min_columns).toBe(5)
    expect(floorsFor(tiles(4), undefined, 16).min_columns).toBe(6)
  })
})
