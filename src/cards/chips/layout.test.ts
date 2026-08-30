import { describe, expect, it } from 'vitest'

import { bandFor, floorsFor, rowHeightFor, ROW_LABELED, ROW_SINGLE } from './layout'
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
})
