import { describe, expect, it } from 'vitest'

import { LARGE_HEIGHT_THRESHOLD, LAYOUT_THRESHOLD, layoutFromBox } from './size'

/** A section of the usual ~500px: the small square, the 2:1 medium, and the tall large. */
const SMALL = { width: 246, height: 248 }
const MEDIUM = { width: 500, height: 248 }
const LARGE = { width: 500, height: 512 }

describe('layoutFromBox', () => {
  it('still picks small and medium on width alone', () => {
    expect(layoutFromBox(SMALL.width, SMALL.height)).toBe('small')
    expect(layoutFromBox(MEDIUM.width, MEDIUM.height)).toBe('medium')
  })

  it('picks large only when the card is both wide enough and tall enough', () => {
    expect(layoutFromBox(LARGE.width, LARGE.height)).toBe('large')
    // Tall but narrow is not large: large is a medium that grew downwards, and a narrow
    // column of content is a different shape rather than a bigger one.
    expect(layoutFromBox(SMALL.width, LARGE.height)).toBe('small')
    // Wide but short stays medium.
    expect(layoutFromBox(LARGE.width, LARGE_HEIGHT_THRESHOLD - 1)).toBe('medium')
    expect(layoutFromBox(LARGE.width, LARGE_HEIGHT_THRESHOLD)).toBe('large')
  })

  it('compares in design units, so scale moves both thresholds', () => {
    // A box placed just past LAYOUT_THRESHOLD at 100%, and short of it once 30% is drawn
    // on top: the box did not move, only how much of it a design unit costs.
    //
    // Not `MEDIUM` (500 wide): that box is the full design footprint, and `scale.ts`'s
    // MAX_SCALE is deliberately chosen to keep it clear of this exact fold (its own note
    // puts the fold at 500 / 1.47, past the 1.3 ceiling), which `scale.test.ts` pins across
    // the whole legal range. 400 has no such guarantee and folds well within it.
    expect(layoutFromBox(400, 248)).toBe('medium')
    expect(layoutFromBox(400, 248, 1.3)).toBe('small')

    // The same shape of test for the height threshold: past LARGE_HEIGHT_THRESHOLD at
    // 100%, short of it at 130%.
    expect(layoutFromBox(500, 420)).toBe('large')
    expect(layoutFromBox(500, 420, 1.3)).toBe('medium')
  })

  it('agrees with the constants it is documented against', () => {
    expect(LAYOUT_THRESHOLD).toBe(340)
    expect(LARGE_HEIGHT_THRESHOLD).toBe(380)
  })
})
