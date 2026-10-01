import { describe, expect, it } from 'vitest'

import { groupRows, linesFor, INSET } from './wrapping'

describe('groupRows', () => {
  const at = (id: string, brk = false) => ({ id, break: brk })

  it('keeps everything on one row when nothing asks otherwise', () => {
    expect(groupRows([at('a'), at('b'), at('c')]).map(r => r.length)).toEqual([3])
  })

  it('starts a new row at an item that asks for one', () => {
    expect(groupRows([at('a'), at('b'), at('c', true), at('d')]).map(r => r.length)).toEqual([2, 2])
  })

  /**
   * Every item starts a row when it is the first one, so the flag says nothing there, and
   * honouring it would open with an empty row. Reachable by dragging a flagged item to the top.
   */
  it('ignores a break on the first item rather than opening with an empty row', () => {
    expect(groupRows([at('a', true), at('b')]).map(r => r.length)).toEqual([2])
  })

  it('allows consecutive breaks, one item to a row', () => {
    expect(groupRows([at('a'), at('b', true), at('c', true)]).map(r => r.length)).toEqual([1, 1, 1])
  })

  it('answers nothing for nothing', () => {
    expect(groupRows([])).toEqual([])
  })
})

describe('linesFor', () => {
  const w = (width: number, extra: Record<string, unknown> = {}) => ({ width, ...extra })

  it('fits what fits on one line', () => {
    expect(linesFor([w(100), w(100), w(100)], 320, 8)).toBe(1)
  })

  it('wraps when the next item would not fit', () => {
    expect(linesFor([w(100), w(100), w(100), w(100)], 320, 8)).toBe(2)
  })

  /** An item wider than the whole line still gets a line; it never gets zero. */
  it('gives an oversized item a line of its own rather than none', () => {
    expect(linesFor([w(500)], 320, 8)).toBe(1)
  })

  /**
   * Elastic: it takes the leftover and collapses when there is none, so it can never be the
   * thing that pushes a line onto the next one, and it contributes no gap of its own.
   */
  it('costs nothing for a filling item', () => {
    expect(linesFor([w(100), w(0, { fill: true }), w(100), w(100)], 320, 8)).toBe(1)
  })

  it('counts each configured row separately, so a break adds a line', () => {
    expect(linesFor([w(100), w(100, { break: true })], 320, 8)).toBe(2)
  })

  it('answers zero lines for no items', () => {
    expect(linesFor([], 320, 8)).toBe(0)
  })
})

describe('INSET', () => {
  it('is the shared card padding the floors price against', () => {
    expect(INSET).toBe(16)
  })
})
