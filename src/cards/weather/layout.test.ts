import { describe, expect, it } from 'vitest'

import type { WeatherDay } from './model'
import { packFor, spanFor, weekRange, type Box } from './layout'

/** A day fixture built from just the two numbers `spanFor` and `weekRange` read. */
const day = (low: number, high: number): WeatherDay => ({
  label: 'Mon',
  icon: '',
  low,
  high,
  lowLabel: `${low}°`,
  highLabel: `${high}°`,
})

describe('weekRange and spanFor', () => {
  /**
   * The bars share one scale across the whole week, which is the entire point of them: a
   * warm day has to sit visibly to the right of a cold one. A bar scaled to its own day
   * would make every row identical and say nothing.
   */
  it('places each day on the week-wide scale', () => {
    const days = [day(67, 90), day(72, 87), day(59, 79)]
    const week = weekRange(days) // min 59, max 90 — a span of 31
    expect(week).toEqual({ min: 59, max: 90 })

    const cold = spanFor(days[2], week) // 59..79
    expect(cold.start).toBeCloseTo(0)
    expect(cold.width).toBeCloseTo(20 / 31)

    const warm = spanFor(days[1], week) // 72..87
    expect(warm.start).toBeCloseTo(13 / 31)
    expect(warm.width).toBeCloseTo(15 / 31)
  })

  it('gives a flat day a visible mark rather than a zero-width one', () => {
    const days = [day(70, 70), day(60, 80)]
    const span = spanFor(days[0], weekRange(days))
    expect(span.width).toBeGreaterThan(0)
  })

  it('survives a week with no spread at all, rather than dividing by zero', () => {
    const days = [day(70, 70), day(70, 70)]
    const span = spanFor(days[0], weekRange(days))
    expect(Number.isFinite(span.start)).toBe(true)
    expect(Number.isFinite(span.width)).toBe(true)
  })

  it('never lets the floored width push the bar past the track', () => {
    // A day pinned to the top of the week's range would, without the clamp, draw
    // start + width past 1 and overflow its own track.
    const days = [day(90, 90), day(59, 90)]
    const span = spanFor(days[0], weekRange(days))
    expect(span.start + span.width).toBeLessThanOrEqual(1)
  })
})

describe('packFor', () => {
  /** The three footprints, in the box a section of the usual ~500px gives them. */
  const SMALL: Box = { width: 246, height: 248 }
  const MEDIUM: Box = { width: 500, height: 248 }
  const LARGE: Box = { width: 500, height: 512 }
  /** The shortest height that still reads as `large` — see `LARGE_HEIGHT_THRESHOLD`. */
  const LARGE_AT_THRESHOLD: Box = { width: 500, height: 380 }

  it('draws no forecast strip at all at small — the temperature is the whole story', () => {
    expect(packFor('small', SMALL)).toEqual({ hours: 0, days: 0 })
  })

  it('adds the six-column hourly strip at medium, still with no daily rows', () => {
    expect(packFor('medium', MEDIUM)).toEqual({ hours: 6, days: 0 })
  })

  /**
   * Hand-computed against this module's own HEADER/DAY_ROW/GAP constants (160, 28, 12):
   * content height is (512 - 2×1)/1 - 2×16 = 478, the header takes 160 of it, and what is
   * left holds floor((318 + 12) / (28 + 12)) = 8 day rows.
   */
  it('gives large its six hours and as many days as the height holds', () => {
    expect(packFor('large', LARGE)).toEqual({ hours: 6, days: 8 })
  })

  /**
   * At the shortest box that still counts as `large` — content height
   * (380 - 2)/1 - 32 = 346, less the 160 header — the day budget is thinner:
   * floor((186 + 12) / 40) = 4.
   */
  it('still holds a handful of days at the large threshold, rather than none', () => {
    expect(packFor('large', LARGE_AT_THRESHOLD)).toEqual({ hours: 6, days: 4 })
  })

  /**
   * `scale` is divided out of the box before anything else is priced, exactly as
   * `battery/layout.ts` does it, so a card drawn 30% bigger holds fewer days in the same
   * footprint: (510/1.3 - 32 - 160 + 12) / 40 = 5.31, floored to 5 — fewer than the 8
   * the same box holds at `scale: 1`.
   */
  it('spends extra scale out of the day count, in the same box', () => {
    expect(packFor('large', LARGE, 1.3)).toEqual({ hours: 6, days: 5 })
  })

  it('never goes negative for a box too short to hold even the header', () => {
    const grid = packFor('large', { width: 500, height: 1 })
    expect(grid.days).toBe(0)
  })
})
