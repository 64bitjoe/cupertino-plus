import { describe, expect, it } from 'vitest'

import { RING_MAX, RING_MIN, gridFor, type Box } from './layout'

/**
 * The two footprints the rings were laid out for, in the box a section of the usual ~500px
 * gives them: 6 columns is a ~246px square, 12 is the 2:1. Both 4 rows tall.
 */
const SMALL: Box = { width: 246, height: 248 }
const MEDIUM: Box = { width: 500, height: 248 }

/** The shortest and the narrowest the Layout tab hands out — `min_rows` / `min_columns`. */
const SHORT: Box = { width: 246, height: 184 }
const NARROW: Box = { width: 150, height: 248 }

/** Both footprints dragged twice as tall, which is where the extra height has to go. */
const TALL: Box = { width: 246, height: 456 }
const TALL_WIDE: Box = { width: 500, height: 456 }

/** The shape a reader would see: the view, the grid, and how much of the list survived it. */
const shape = (mode: 'small' | 'medium', count: number, box: Box, scale = 1): string => {
  const grid = gridFor(mode, count, box, scale)
  return `${grid.view} ${grid.columns}×${grid.rows}, ${grid.visible} of ${count}`
}

/** Just the ring diameter, in design units. */
const ring = (mode: 'small' | 'medium', count: number, box: Box, scale = 1): number =>
  gridFor(mode, count, box, scale).ring

/**
 * The table the rules were written from, at the two footprints the widget is designed for.
 * If one of these changes, the card stopped matching the thing it is copying.
 */
describe('the reference table', () => {
  it('captions the rings while they fit on one row, and stops when they do not', () => {
    expect(shape('small', 1, SMALL)).toBe('labeled 2×1, 1 of 1')
    expect(shape('small', 2, SMALL)).toBe('labeled 2×1, 2 of 2')
    expect(shape('small', 3, SMALL)).toBe('compact 2×2, 3 of 3')
    expect(shape('small', 4, SMALL)).toBe('compact 2×2, 4 of 4')

    expect(shape('medium', 1, MEDIUM)).toBe('labeled 4×1, 1 of 1')
    expect(shape('medium', 2, MEDIUM)).toBe('labeled 4×1, 2 of 2')
    expect(shape('medium', 3, MEDIUM)).toBe('labeled 4×1, 3 of 3')
    expect(shape('medium', 4, MEDIUM)).toBe('labeled 4×1, 4 of 4')
  })

  /**
   * Four rings is what either of these footprints draws, and a fifth device is not a reason
   * to change the shape of the card.
   *
   * The wide card in particular never stacks a second row: 4 + 2 fits perfectly well and
   * reads as a card that ran out of something, where one row of four reads as the widget it
   * is. Six devices are still worth configuring — they are for the `large` footprint, which
   * is the one with two rows of four to give them.
   */
  it('draws four and no more, however many devices are configured', () => {
    expect(shape('small', 5, SMALL)).toBe('compact 2×2, 4 of 5')
    expect(shape('small', 6, SMALL)).toBe('compact 2×2, 4 of 6')
    expect(shape('medium', 5, MEDIUM)).toBe('labeled 4×1, 4 of 5')
    expect(shape('medium', 6, MEDIUM)).toBe('labeled 4×1, 4 of 6')
    expect(shape('medium', 9, MEDIUM)).toBe('labeled 4×1, 4 of 9')
  })

  /**
   * And the rings do not shrink for the devices that were not drawn.
   *
   * Worth pinning, because the caption rule reads `visible` rather than `count` for exactly
   * this: a wide card given six devices is pixel-for-pixel the one given four, and a version
   * that counted the configured list would have taken the percentages off it.
   */
  it('draws a card of six devices exactly as it draws a card of four', () => {
    /** Everything about the drawing, with the length of the config list left out of it. */
    const drawing = (mode: 'small' | 'medium', count: number, box: Box): string => {
      const grid = gridFor(mode, count, box)
      return `${grid.view} ${grid.columns}×${grid.rows}, ${grid.visible} rings at ${grid.ring}`
    }

    expect(drawing('medium', 6, MEDIUM)).toBe(drawing('medium', 4, MEDIUM))
    expect(drawing('small', 6, SMALL)).toBe(drawing('small', 4, SMALL))
  })

  it('reproduces the reference proportion at both design footprints', () => {
    // 96 of a 246px square is the reference's 62 of 158pt — see RING_MAX. The wide footprint
    // has four columns of ~106 to spend and the cap is what stops it spending them.
    expect(ring('small', 2, SMALL)).toBe(RING_MAX)
    expect(ring('small', 4, SMALL)).toBe(RING_MAX)
    expect(ring('medium', 4, MEDIUM)).toBe(RING_MAX)
  })
})

describe('the caption', () => {
  it('is dropped when a column is too narrow to print a full reading under it', () => {
    // Four columns is the narrowest footprint Home Assistant allows, and two rings across
    // it leave 51 design units each — `100%` needs 64, so the percentages come off rather
    // than being clipped or set in a size of their own.
    expect(shape('small', 2, NARROW)).toBe('compact 2×1, 2 of 2')
    // One device has the whole width to itself, so it keeps its caption in the same box.
    expect(shape('small', 1, NARROW)).toBe('labeled 2×1, 1 of 1')
  })

  it('survives the shortest footprint, and the largest type in it', () => {
    expect(shape('small', 2, SHORT)).toBe('labeled 2×1, 2 of 2')
    expect(shape('small', 2, SHORT, 1.3)).toBe('labeled 2×1, 2 of 2')
    // Shorter box, smaller ring — the caption is a fixed size and comes off the ring's share.
    expect(ring('small', 2, SHORT, 1.3)).toBe(70)
  })

  it('never appears on more than one row of rings', () => {
    const broken: string[] = []
    for (const box of [SMALL, MEDIUM, SHORT, NARROW, TALL]) {
      for (const mode of ['small', 'medium'] as const) {
        for (let count = 1; count <= 12; count += 1) {
          const grid = gridFor(mode, count, box)
          if (grid.view === 'labeled' && grid.rows !== 1) {
            broken.push(`${mode} ${count} devices in ${box.width}×${box.height}`)
          }
        }
      }
    }
    expect(broken).toEqual([])
  })
})

describe('the grid', () => {
  /**
   * A card dragged taller gets bigger rings, not more of them, and that is the row cap doing
   * its job: the rows are the devices, so there is nothing to fill extra height *with* —
   * unlike the calendar, which always has more of the week to pour in.
   */
  it('spends extra height on the rings rather than on another row', () => {
    expect(shape('small', 6, TALL)).toBe('compact 2×2, 4 of 6')
    expect(ring('small', 4, TALL)).toBe(RING_MAX)
    expect(shape('medium', 6, TALL_WIDE)).toBe('labeled 4×1, 4 of 6')
  })

  it('drops a row the height cannot hold, and the devices in it', () => {
    // The floor at the largest type still holds the square's two rows: 108 design units is
    // room for a 47-unit ring twice over.
    expect(shape('small', 4, SHORT, 1.3)).toBe('compact 2×2, 4 of 4')
    expect(ring('small', 4, SHORT, 1.3)).toBe(47)
    // Squash it past that and the second row goes, taking two devices with it. The one corner
    // where the widget cannot say everything it was asked to, and the answer is the editor's
    // own advice — drag it taller.
    expect(shape('small', 4, { width: 246, height: 110 })).toBe('labeled 2×1, 2 of 4')
  })

  it('leaves an odd ring in the left column of two, and centred under four', () => {
    // Centring it between two columns parks it over the gap in the row above, which reads
    // as a pyramid; under four there is no such alignment to lose. Only the square can have
    // an incomplete row below a full one, but the rule is the grid's either way — a short
    // single row of four is centred by it too.
    expect(gridFor('small', 3, SMALL).tail).toBe('start')
    expect(gridFor('medium', 2, MEDIUM).tail).toBe('center')
  })

  it('has a row and a ring to draw even for a card squashed flat', () => {
    const grid = gridFor('small', 4, { width: 40, height: 30 })
    expect(grid.rows).toBe(1)
    expect(grid.ring).toBe(RING_MIN)
  })

  it('draws nothing for a config that named no devices', () => {
    expect(gridFor('medium', 0, MEDIUM).visible).toBe(0)
  })
})

/**
 * `scale` is spent out of the ring rather than out of the row budget, which is where this
 * card and the calendar part company: the calendar answers larger type with fewer rows of it,
 * and there is no equivalent here — the rows are the devices. So the same footprint holds the
 * same devices at every scale and draws them smaller, until the shortest box runs out.
 */
describe('scale', () => {
  it('buys size out of the ring, in the same box', () => {
    expect(ring('medium', 4, MEDIUM, 0.8)).toBe(RING_MAX)
    expect(ring('medium', 4, MEDIUM, 1)).toBe(RING_MAX)
    // Four captioned rings across the same 500px, drawn 30% larger: the columns are what run
    // out first, so the ring comes down to fit one.
    expect(ring('medium', 4, MEDIUM, 1.3)).toBe(77)
    expect(shape('medium', 4, MEDIUM, 1.3)).toBe('labeled 4×1, 4 of 4')
    // The square is 2 × 2 either way, so both directions run out together — 70.8 units of
    // column against 71.6 of row, which is what a square footprint means.
    expect(ring('small', 4, SMALL, 1.3)).toBe(70)
    expect(shape('small', 4, SMALL, 1.3)).toBe('compact 2×2, 4 of 4')
  })
})

/**
 * The rule the whole file exists for, rather than one case of it: whatever box the Layout tab
 * hands out and whatever scale it is drawn at, the rings and their captions fit between the
 * card's insets.
 *
 * The one exemption is a ring standing on `RING_MIN`, which is the floor deliberately allowed
 * to overflow — a box that cannot hold one legible row gets one anyway and is clipped, rather
 * than being answered with a blank card. So the sweep asserts the fit everywhere else and
 * separately proves that both sides of that line were actually reached.
 */
describe('invariants, over every footprint the Layout tab offers', () => {
  /** The stylesheet's own numbers, transcribed rather than imported — that is the point. */
  const INSET = 16
  const BORDER = 1
  const GAP = 14
  const LABEL_GAP = 8
  const LABEL = 28
  /** What `100%` measures at the caption's 22px semibold, rounded up. */
  const LABEL_WIDTH = 64

  /** The sections grid: 12 columns of a ~500px section, 56px rows with an 8px gap. */
  const boxFor = (columns: number, rows: number): Box => ({
    width: Math.round(columns * ((500 - 11 * 8) / 12) + (columns - 1) * 8),
    height: rows * 56 + (rows - 1) * 8,
  })

  it('keeps every ring and caption between the insets, at any footprint and scale', () => {
    const broken: string[] = []
    let floored = 0
    let roomy = 0

    for (const scale of [0.8, 0.9, 1, 1.1, 1.3]) {
      // 4 columns and 3 rows are `gridOptions()`'s floors; 12 × 12 is past anything anybody
      // drags a widget to.
      for (let columns = 4; columns <= 12; columns += 1) {
        for (let rows = 3; rows <= 12; rows += 1) {
          for (const mode of ['small', 'medium'] as const) {
            for (let count = 1; count <= 12; count += 1) {
              const box = boxFor(columns, rows)
              const grid = gridFor(mode, count, box, scale)
              const where = `${mode} ${count} in ${columns}×${rows} @${scale}`

              const width = (box.width - 2 * BORDER) / scale - 2 * INSET
              const height = (box.height - 2 * BORDER) / scale - 2 * INSET
              const caption = grid.view === 'labeled' ? LABEL_GAP + LABEL : 0
              const across = Math.min(grid.visible, grid.columns)
              const cell = Math.max(grid.ring, grid.view === 'labeled' ? LABEL_WIDTH : 0)

              if (grid.visible !== Math.min(count, grid.columns * grid.rows)) {
                broken.push(`draws a number of rings its own grid has no room for: ${where}`)
              }
              if (grid.visible > count) broken.push(`draws more devices than it has: ${where}`)
              if (grid.ring < RING_MIN || grid.ring > RING_MAX) {
                broken.push(`ring of ${grid.ring} outside its bounds: ${where}`)
              }
              if (grid.view === 'labeled' && grid.visible > grid.columns) {
                broken.push(`captions more rings than a row holds: ${where}`)
              }
              // The design cap, pinned over every box rather than at the two footprints: four
              // rings is what these two sizes draw, and the wide one never stacks a row.
              if (grid.visible > 4) broken.push(`${grid.visible} rings drawn: ${where}`)
              if (grid.rows > (mode === 'small' ? 2 : 1)) {
                broken.push(`${grid.rows} rows of rings in ${mode}: ${where}`)
              }

              if (grid.ring === RING_MIN) {
                floored += 1
                continue
              }
              roomy += 1

              const tall = grid.rows * (grid.ring + caption) + (grid.rows - 1) * GAP
              const wide = across * cell + (across - 1) * GAP
              // A design unit of slack for the floor the ring was rounded down to.
              if (tall > height + 1) broken.push(`${tall} tall in ${height}: ${where}`)
              if (wide > width + 1) broken.push(`${wide} wide in ${width}: ${where}`)
            }
          }
        }
      }
    }

    expect(broken).toEqual([])
    // Both branches above are vacuous on a sample that only ever reached one of them.
    expect(roomy).toBeGreaterThan(1_000)
    expect(floored).toBeGreaterThan(10)
  })
})
