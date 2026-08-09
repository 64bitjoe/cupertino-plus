import { describe, expect, it } from 'vitest'

import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE, scaleFactor } from './scale'
import { columnsToPx, layoutFromBox } from './size'

/**
 * Everything that reaches `scaleFactor` has been through a YAML file or a slider, and the
 * card multiplies its whole stylesheet by the answer, so "what does this do with rubbish"
 * is the entire test.
 */
describe('scaleFactor', () => {
  it('reads a percentage as a multiplier', () => {
    expect(scaleFactor(100)).toBe(1)
    expect(scaleFactor(110)).toBeCloseTo(1.1)
    expect(scaleFactor(MIN_SCALE)).toBeCloseTo(MIN_SCALE / 100)
  })

  it('answers 100% for a config that says nothing', () => {
    expect(scaleFactor(undefined)).toBe(1)
    expect(scaleFactor(null)).toBe(1)
    expect(scaleFactor('')).toBe(1)
    expect(scaleFactor(DEFAULT_SCALE)).toBe(1)
  })

  /** `scale: "110"` is what a quoted value parses to, and it plainly means 110. */
  it('reads a number that arrived as a string', () => {
    expect(scaleFactor('110')).toBeCloseTo(1.1)
    expect(scaleFactor(' 90 ')).toBeCloseTo(0.9)
  })

  /**
   * Clamped rather than refused: the arithmetic is happy at any factor, the bounds are
   * about which of them the widget still looks like itself at, and a dashboard is better
   * off with a card that is legibly too big than with an error where a card used to be.
   */
  it('clamps what it cannot draw well instead of failing', () => {
    expect(scaleFactor(1000)).toBeCloseTo(MAX_SCALE / 100)
    expect(scaleFactor(1)).toBeCloseTo(MIN_SCALE / 100)
    expect(scaleFactor(-50)).toBeCloseTo(MIN_SCALE / 100)
  })

  it('falls back to 100% for anything that is not a number at all', () => {
    expect(scaleFactor('bigger please')).toBe(1)
    expect(scaleFactor(Number.NaN)).toBe(1)
    expect(scaleFactor(Number.POSITIVE_INFINITY)).toBe(1)
    expect(scaleFactor({})).toBe(1)
    expect(scaleFactor([])).toBe(1)
    expect(scaleFactor(true)).toBe(1)
  })
})

/**
 * Why the bounds are the numbers they are.
 *
 * `layoutFromBox` compares the card's width **in design units** against its threshold, so
 * scaling the type walks a card towards the other layout: shrink it far enough and the
 * square footprint has room for two columns; grow it far enough and the wide one no longer
 * does. Both would be the widget quietly becoming a different widget, and the range in
 * `scale.ts` is chosen to stay clear of it, which is worth a test rather than a comment,
 * because the two constants that have to agree live in different files.
 */
describe('the bounds', () => {
  /** The usual desktop section, where 6 columns is the square and 12 is the 2:1. */
  const SECTION = 500
  const SMALL = Math.round(columnsToPx(6, SECTION))
  const MEDIUM = Math.round(columnsToPx(12, SECTION))
  /**
   * The default footprint's height (4 rows), held constant through this file's whole
   * range of scale so that these tests stay about the width threshold they were written
   * for. Neither box crosses into `large` at it: 248 design units at MIN_SCALE is still
   * under `LARGE_HEIGHT_THRESHOLD`, and `large` is not this describe block's question.
   */
  const HEIGHT = 248

  it('leaves the two designed footprints in their own layouts, end to end', () => {
    for (let percent = MIN_SCALE; percent <= MAX_SCALE; percent += 1) {
      const factor = scaleFactor(percent)
      expect(layoutFromBox(SMALL, HEIGHT, factor)).toBe('small')
      expect(layoutFromBox(MEDIUM, HEIGHT, factor)).toBe('medium')
    }
  })

  it('is bounded by that and not by taste: just outside it, the square folds', () => {
    // The floor has ~7 points of margin on it. This is the check that it is margin
    // against something real: keep going down and the 6 × 4 square turns into two
    // narrow columns, which is the reason MIN_SCALE exists.
    expect(layoutFromBox(SMALL, HEIGHT, scaleFactor(MIN_SCALE) - 0.1)).toBe('medium')
  })

  it('brackets the default rather than starting at it', () => {
    expect(MIN_SCALE).toBeLessThan(DEFAULT_SCALE)
    expect(MAX_SCALE).toBeGreaterThan(DEFAULT_SCALE)
  })
})
