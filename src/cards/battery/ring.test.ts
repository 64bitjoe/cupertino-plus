import { describe, expect, it } from 'vitest'

import { RING_CIRCUMFERENCE, RING_STROKE, arcFor } from './ring'

/** The arc as a percentage of the circle, which is what a reader sees. */
const drawn = (level: number | null): number =>
  Math.round((arcFor(level) / RING_CIRCUMFERENCE) * 1000) / 10

describe('the arc', () => {
  it('is the level, as a fraction of the circle', () => {
    expect(drawn(0)).toBe(0)
    expect(drawn(25)).toBe(25)
    expect(drawn(50)).toBe(50)
    expect(drawn(100)).toBe(100)
  })

  /**
   * Two ways of having no arc, and they are not the same statement: an empty battery against
   * a device that is not reporting. The ring cannot tell them apart and does not try: the
   * caption says `0%` for one and a dash for the other, and where there is no caption the
   * dimmed icon does it.
   */
  it('is nothing at all for an empty battery and for one that cannot be read', () => {
    expect(arcFor(0)).toBe(0)
    expect(arcFor(null)).toBe(0)
  })

  /**
   * The rounded cap is what makes a 1% battery visible, so the floor only has to be positive.
   *
   * Worth pinning at the value rather than at "greater than zero", because the obvious floor
   * is the stroke width and it is wrong by twice over: a cap adds half a stroke beyond each
   * end of the dash, so a dash of 13 draws 26 long and a 1% battery would read as 9%.
   */
  it('leaves a visible mark at the bottom of the range without overstating it', () => {
    expect(arcFor(1)).toBeGreaterThan(0)
    expect(arcFor(1)).toBeLessThan(RING_STROKE)
    expect(arcFor(0.2)).toBe(1)
  })

  it('never runs past the circle, whatever the sensor claims', () => {
    expect(arcFor(140)).toBe(RING_CIRCUMFERENCE)
  })

  it('grows with the level and never shrinks', () => {
    const broken: string[] = []
    for (let level = 1; level <= 100; level += 1) {
      if (arcFor(level) < arcFor(level - 1)) broken.push(`${level} draws less than ${level - 1}`)
    }
    expect(broken).toEqual([])
  })
})
