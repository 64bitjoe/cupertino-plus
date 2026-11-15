import { describe, expect, it } from 'vitest'

import {
  bentoFace,
  bentoFloorBox,
  bentoGrid,
  bentoSizes,
  layoutFor,
  packBento,
  type BentoSize,
} from './bento'
import { bentoFloors } from './layout'
import { rowOverrideFields } from './fields'
import { complicationFromForm, complicationToForm } from './model'

/** The showcase footprints, in design units, less the 1px border each side. */
const SMALL = bentoGrid(244, 246)
const MEDIUM = bentoGrid(498, 246)
const LARGE = bentoGrid(498, 454)

const shape = (sizes: BentoSize[], grid = SMALL) =>
  packBento(sizes, grid).placements.map(
    cell => `${cell.index}:${cell.size}@${cell.column},${cell.row}`,
  )

describe('layoutFor', () => {
  it('is one panel unless the config says bento', () => {
    expect(layoutFor(undefined)).toBe('panel')
    expect(layoutFor('cards')).toBe('panel')
    expect(layoutFor('bento')).toBe('bento')
  })
})

describe('bentoGrid', () => {
  it('gives fewer columns to a smaller footprint, between two and six', () => {
    expect(SMALL).toEqual({ columns: 2, rows: 2 })
    expect(MEDIUM).toEqual({ columns: 4, rows: 2 })
    expect(LARGE).toEqual({ columns: 4, rows: 4 })
    expect(bentoGrid(60, 60)).toEqual({ columns: 2, rows: 1 })
    expect(bentoGrid(2000, 110).columns).toBe(6)
  })
})

describe('bentoSizes', () => {
  it('makes the first entity the large hero when everything else still fits beside it', () => {
    expect(bentoSizes([undefined, undefined, undefined], MEDIUM)).toEqual([
      'large',
      'small',
      'small',
    ])
  })

  it('steps the hero down to wide, then small, as the grid fills', () => {
    expect(bentoSizes([undefined, undefined, undefined], SMALL)).toEqual(['wide', 'small', 'small'])
    expect(bentoSizes([undefined, undefined, undefined, undefined], SMALL)).toEqual([
      'small',
      'small',
      'small',
      'small',
    ])
  })

  it('keeps a size a row chose', () => {
    expect(bentoSizes(['tall', undefined, 'wide'], LARGE)).toEqual(['tall', 'small', 'wide'])
  })
})

describe('packBento', () => {
  it('fills the hole beside a large cell with the smalls that follow it', () => {
    expect(shape(['large', 'small', 'small', 'small', 'small'], MEDIUM)).toEqual([
      '0:large@0,0',
      '1:small@2,0',
      '2:small@3,0',
      '3:small@2,1',
      '4:small@3,1',
    ])
  })

  it('shrinks a cell that does not fit before it drops anything', () => {
    // Two rows of two: a second large cannot fit beside the first, and becomes nothing larger
    // than what is left.
    const pack = packBento(['wide', 'large'], SMALL)
    expect(pack.placements.map(cell => cell.size)).toEqual(['wide', 'wide'])
    expect(pack.dropped).toEqual([])
  })

  it('drops whole what fits at no size, and never places a cell past the grid', () => {
    const pack = packBento(['small', 'small', 'small', 'small', 'small'], SMALL)
    expect(pack.dropped).toEqual([4])
    for (const cell of pack.placements) {
      expect(cell.column + cell.columns).toBeLessThanOrEqual(SMALL.columns)
      expect(cell.row + cell.rows).toBeLessThanOrEqual(SMALL.rows)
    }
  })

  it('reports the rows it used, so a short list does not leave an empty band', () => {
    expect(packBento(['small', 'small'], LARGE).rows).toBe(1)
    expect(packBento(['large'], LARGE).rows).toBe(2)
  })
})

describe('bentoFace', () => {
  const number = { numeric: true, gauge: false }
  const timer = { numeric: false, gauge: true }
  const word = { numeric: false, gauge: false }

  it('honours the row’s own face', () => {
    expect(bentoFace('large', 'circular', 'bezel', number)).toBe('bezel')
  })

  it('gives the hero a graph for a number, a gauge for a timer, a rectangle otherwise', () => {
    expect(bentoFace('large', 'circular', undefined, number)).toBe('rectangular-graph')
    expect(bentoFace('large', 'circular', undefined, timer)).toBe('gauge')
    expect(bentoFace('large', 'circular', undefined, word)).toBe('rectangular')
    expect(bentoFace('large', 'rectangular-header', undefined, word)).toBe('rectangular-header')
  })

  it('gives a square the card’s ring, or a plain one, and a tall cell the gauge', () => {
    expect(bentoFace('small', 'bezel', undefined, number)).toBe('bezel')
    expect(bentoFace('small', 'rectangular', undefined, number)).toBe('circular')
    expect(bentoFace('tall', 'circular', undefined, timer)).toBe('gauge')
    expect(bentoFace('tall', 'circular', undefined, word)).toBe('circular')
    expect(bentoFace('wide', 'circular', undefined, number)).toBe('rectangular-graph')
  })
})

describe('bento floors', () => {
  it('asks for two columns, and rows enough for every entity at small', () => {
    expect(bentoFloorBox(4)).toEqual({ width: 206, height: 206 })
    expect(bentoFloors(4).min_rows).toBeGreaterThanOrEqual(bentoFloors(2).min_rows)
    expect(bentoFloors(6).min_rows).toBeGreaterThan(bentoFloors(4).min_rows)
  })
})

describe('the row panel in bento', () => {
  const card = {
    layout: 'bento' as const,
    style: 'circular' as const,
    sparkline: false,
    sparklineHours: 24,
    countdown: false,
  }

  it('offers Size and Face only in bento', () => {
    const names = (layout: 'bento' | 'panel') =>
      rowOverrideFields({}, { ...card, layout }).map(row => row.name)
    expect(names('bento').slice(0, 2)).toEqual(['size', 'style'])
    expect(names('panel')).not.toContain('size')
  })

  it('writes Automatic as no key, and a chosen size and face as themselves', () => {
    const row = { entity: 'sensor.a' }
    expect(complicationFromForm(row, complicationToForm(row))).toEqual(row)
    expect(
      complicationFromForm(row, { ...complicationToForm(row), size: 'large', style: 'gauge' }),
    ).toEqual({ entity: 'sensor.a', size: 'large', style: 'gauge' })
    expect(
      complicationFromForm(row, { ...complicationToForm(row), size: 'huge', style: 'oval' }),
    ).toEqual(row)
  })
})
