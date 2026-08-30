import { describe, expect, it } from 'vitest'

import { bandFor, floorsFor, rowHeightFor, ROW_LABELED, ROW_SINGLE } from './layout'
import { rowsToPx } from '../../core/size'
import type { ChipView } from './model'

const chip = (content: ChipView['content']): ChipView => ({
  entityId: 'sensor.a',
  name: 'A',
  icon: 'mdi:eye',
  value: '1',
  content,
  unavailable: false,
  color: undefined,
  visible: true,
  spacer: false,
  action: { action: 'more-info' },
})

describe('bandFor', () => {
  it('is the tallest mode present, so one labeled chip promotes the whole row', () => {
    expect(bandFor([chip('icon'), chip('value')])).toBe('value')
    expect(bandFor([chip('icon'), chip('labeled'), chip('value')])).toBe('labeled')
    expect(bandFor([chip('icon')])).toBe('icon')
  })

  it('answers the default band for an empty card rather than throwing', () => {
    expect(bandFor([])).toBe('value')
  })
})

describe('rowHeightFor', () => {
  it('never draws a row shorter than the 44-unit tap target', () => {
    expect(rowHeightFor('icon')).toBe(ROW_SINGLE)
    expect(rowHeightFor('value')).toBe(ROW_SINGLE)
    expect(ROW_SINGLE).toBeGreaterThanOrEqual(44)
    expect(rowHeightFor('labeled')).toBe(ROW_LABELED)
    expect(ROW_LABELED).toBeGreaterThan(ROW_SINGLE)
  })
})

describe('floorsFor', () => {
  it('grows the row floor as chips wrap onto more lines', () => {
    const four = floorsFor([chip('value'), chip('value'), chip('value'), chip('value')])
    const twelve = floorsFor(Array.from({ length: 12 }, () => chip('value')))
    expect(twelve.min_rows).toBeGreaterThan(four.min_rows)
  })

  it('asks for more height for a labeled band than for a plain one', () => {
    const plain = floorsFor(Array.from({ length: 7 }, () => chip('value')))
    const labeled = floorsFor([...Array.from({ length: 6 }, () => chip('value')), chip('labeled')])
    expect(labeled.min_rows).toBeGreaterThan(plain.min_rows)
  })

  it('fits more icon-only chips on a line than labeled ones', () => {
    const icons = floorsFor(Array.from({ length: 8 }, () => chip('icon')))
    const labels = floorsFor(Array.from({ length: 8 }, () => chip('labeled')))
    expect(icons.min_rows).toBeLessThan(labels.min_rows)
  })

  it('never asks for less than the library minimum, even with no chips', () => {
    expect(floorsFor([])).toEqual({ min_columns: 4, min_rows: 1 })
  })

  /**
   * The number `chips-card.ts` renders at, not just the one it floors at.
   *
   * `core/size.ts` hands every card a flat `rows: 4` — the 2:1 panel the other four cards
   * draw — and `withFloors` only ever raises it. A chips card that took that default was
   * handed 248px for a single 44-unit line of content and drew the difference as empty
   * dashboard, which in `glass` mode is not even a visible card. So this pins the shape of
   * the answer rather than one magic number: a short row must price well under the shared
   * four-row footprint, and a long one must still be allowed to reach it.
   */
  it('prices a short row well under the four-row footprint every other card takes', () => {
    const three = floorsFor(Array.from({ length: 3 }, () => chip('value')))
    expect(three.min_rows).toBeLessThan(4)
    expect(rowsToPx(three.min_rows)).toBeLessThan(rowsToPx(4))
  })

  it('still lets a long row reach it, so nothing is clipped', () => {
    const twelve = floorsFor(Array.from({ length: 12 }, () => chip('value')))
    expect(twelve.min_rows).toBeGreaterThanOrEqual(4)
  })
})
