import { describe, expect, it } from 'vitest'

import {
  arcPath,
  bezelText,
  cornerArc,
  cornerFor,
  BEZEL_TEXT_MAX,
  gaugeAngle,
  GAUGE_END,
  GAUGE_START,
  pointAt,
} from './faces'
import { floorsFor, packFor } from './layout'

describe('pointAt', () => {
  it('measures clockwise from twelve o’clock, as a watch face is read', () => {
    expect(pointAt(0, 40)).toEqual({ x: 50, y: 10 })
    expect(pointAt(90, 40)).toEqual({ x: 90, y: 50 })
    expect(pointAt(180, 40)).toEqual({ x: 50, y: 90 })
  })
})

describe('arcPath', () => {
  it('sweeps clockwise, and takes the long way round past half a turn', () => {
    expect(arcPath(-90, 90, 40)).toBe('M10 50 A40 40 0 0 1 90 50')
    expect(arcPath(GAUGE_START, GAUGE_END, 40)).toMatch(/ 0 1 1 /)
  })
})

describe('gaugeAngle', () => {
  it('runs the open arc from its left end to its right, clamped', () => {
    expect(gaugeAngle(0)).toBe(GAUGE_START)
    expect(gaugeAngle(0.5)).toBe(0)
    expect(gaugeAngle(1)).toBe(GAUGE_END)
    expect(gaugeAngle(2)).toBe(GAUGE_END)
    expect(gaugeAngle(-1)).toBe(GAUGE_START)
  })
})

describe('bezelText', () => {
  it('keeps a name that fits, and cuts one that would run into the gap', () => {
    expect(bezelText('  Lounge  ')).toBe('Lounge')
    const cut = bezelText('Upstairs landing cupboard humidity sensor')
    expect(cut.length).toBe(BEZEL_TEXT_MAX)
    expect(cut.endsWith('…')).toBe(true)
  })
})

describe('the new faces’ layout', () => {
  const MEDIUM = { width: 500, height: 248 }

  it('tiles the gauge and the bezel as rings, the bezel with no caption row', () => {
    expect(packFor('gauge', 2, MEDIUM)).toEqual(packFor('circular', 2, MEDIUM))
    expect(packFor('bezel', 2, MEDIUM).labels).toBe(false)
    expect(packFor('bezel', 2, MEDIUM).ring).toBeGreaterThanOrEqual(
      packFor('circular', 2, MEDIUM).ring,
    )
  })

  it('stacks the graph face like the other rectangles, asking for more height per block', () => {
    expect(packFor('rectangular-graph', 3, { width: 500, height: 456 }).rows).toBe(3)
    expect(floorsFor('rectangular-graph', 2).min_rows).toBeGreaterThan(
      floorsFor('rectangular', 2).min_rows,
    )
    expect(floorsFor('gauge', 4)).toEqual(floorsFor('circular', 4))
  })
})

describe('the graph face at small sizes', () => {
  const SMALL = { width: 246, height: 248 }
  const MEDIUM = { width: 500, height: 248 }

  it('stacks when every graph fits, and puts them side by side when they do not', () => {
    expect(packFor('rectangular-graph', 2, SMALL)).toMatchObject({ columns: 1, rows: 2, shown: 2 })
    expect(packFor('rectangular-graph', 4, SMALL)).toMatchObject({
      columns: 2,
      rows: 2,
      shown: 4,
      compact: true,
    })
    expect(packFor('rectangular-graph', 4, MEDIUM)).toMatchObject({
      columns: 2,
      shown: 4,
      compact: false,
    })
  })

  it('leaves out whole the graphs that cannot fit even side by side, never one cut short', () => {
    const pack = packFor('rectangular-graph', 6, SMALL)
    expect(pack.shown).toBe(4)
    expect(pack.columns * pack.rows).toBeGreaterThanOrEqual(pack.shown)
  })

  it('draws every entity on every other face', () => {
    for (const style of ['circular', 'rectangular', 'inline', 'corner'] as const) {
      expect(packFor(style, 6, SMALL).shown).toBe(6)
    }
  })
})

describe('the corner face', () => {
  it('fills the four corners of a card of four, then starts again at the top', () => {
    expect([0, 1, 2, 3].map(i => cornerFor(i, 2))).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ])
    expect(cornerFor(4, 2)).toBe('top-left')
    expect(cornerFor(0, 1)).toBe('top-left')
  })

  it('bows each arc out towards its own corner, drawn in the direction it fills', () => {
    expect(cornerArc('top-left', 72)).toBe('M28 100 A72 72 0 0 1 100 28')
    expect(cornerArc('top-right', 72)).toBe('M72 100 A72 72 0 0 0 0 28')
    expect(cornerArc('bottom-left', 72)).toBe('M28 0 A72 72 0 0 0 100 72')
    expect(cornerArc('bottom-right', 72)).toBe('M72 0 A72 72 0 0 1 0 72')
  })

  it('packs two across and asks for room for a reading in each corner', () => {
    const pack = packFor('corner', 4, { width: 246, height: 248 })
    expect(pack).toMatchObject({ columns: 2, rows: 2, labels: false, shown: 4 })
    expect(floorsFor('corner', 4).min_rows).toBeGreaterThanOrEqual(3)
  })
})
