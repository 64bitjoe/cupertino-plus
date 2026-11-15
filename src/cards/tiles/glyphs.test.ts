import { describe, expect, it } from 'vitest'

import type { SummaryItem } from '../../core/area-summary'
import {
  fitGlyphs,
  glyphBudget,
  glyphLabel,
  glyphWidth,
  moreWidth,
  splitSummary,
  summaryStyleFor,
  type TileGlyph,
} from './glyphs'

const item = (part: SummaryItem['part'], text: string, entities = 1, extra = {}): SummaryItem => ({
  part,
  text,
  icon: `mdi:${part}`,
  entities: Array.from({ length: entities }, (_, index) => `x.${part}_${index}`),
  alert: false,
  ...extra,
})

const glyph = (count?: number): TileGlyph => ({
  part: 'lights',
  icon: 'mdi:lightbulb',
  ...(count !== undefined ? { count } : {}),
  tint: 'red',
  alert: false,
  label: 'x',
})

describe('summaryStyleFor', () => {
  it('reads the two styles, and words for anything else', () => {
    expect(summaryStyleFor('icons')).toBe('icons')
    expect(summaryStyleFor('words')).toBe('words')
    expect(summaryStyleFor(undefined)).toBe('words')
    expect(summaryStyleFor('both')).toBe('words')
  })
})

describe('splitSummary', () => {
  const summary = [
    item('alerts', 'Leak', 1, { alert: true, icon: 'mdi:water-alert' }),
    item('open', '2 Windows Open', 2),
    item('occupancy', 'Occupied', 2),
    item('temperature', '21°'),
    item('humidity', '45%'),
    item('lights', '3 Lights On', 3),
    item('media', 'Playing'),
  ]

  it('keeps the readings as words and makes every status a glyph, alerts first', () => {
    const { words, glyphs } = splitSummary(summary)
    expect(words.map(word => word.text)).toEqual(['21°', '45%'])
    expect(glyphs.map(g => g.part)).toEqual(['alerts', 'open', 'occupancy', 'lights', 'media'])
  })

  it('counts what is countable, and only once there is more than one', () => {
    const { glyphs } = splitSummary(summary)
    const counts = Object.fromEntries(glyphs.map(g => [g.part, g.count]))
    expect(counts).toEqual({
      alerts: undefined,
      open: 2,
      // Two presence sensors in one room are still one "Occupied".
      occupancy: undefined,
      lights: 3,
      media: undefined,
    })
  })

  it('tints by part, an alert red, and a cooling thermostat blue', () => {
    const { glyphs } = splitSummary([
      ...summary,
      item('climate', 'Cooling to 20°', 1, { icon: 'mdi:snowflake' }),
    ])
    const tint = Object.fromEntries(glyphs.map(g => [g.part, g.tint]))
    expect(tint.alerts).toBe('var(--cw-red)')
    expect(tint.lights).toBe('var(--cw-yellow)')
    expect(tint.climate).toBe('var(--cw-blue)')
    expect(glyphs[0]?.alert).toBe(true)
  })

  it('carries the summary’s own words for each glyph', () => {
    expect(glyphLabel(splitSummary(summary).glyphs)).toBe(
      'Leak, 2 Windows Open, Occupied, 3 Lights On, Playing',
    )
  })
})

describe('fitGlyphs', () => {
  it('prices a pill by its figures', () => {
    expect(glyphWidth(glyph())).toBe(18)
    expect(glyphWidth(glyph(3))).toBe(31)
    expect(glyphWidth(glyph(12))).toBe(38)
    expect(moreWidth(2)).toBe(26)
  })

  it('draws every glyph that fits, with no "+N"', () => {
    expect(fitGlyphs([glyph(), glyph(), glyph()], 62)).toEqual({
      shown: [glyph(), glyph(), glyph()],
      more: 0,
    })
  })

  it('folds from the back, pricing the "+N" in', () => {
    // 31 + 4 + 18 + 4 + 18 = 75 > 72; 31 + 4 + 18 + 4 + "+1" 26 = 83 > 72; 31 + 4 + "+2" = 61.
    const fitted = fitGlyphs([glyph(3), glyph(), glyph()], 72)
    expect(fitted.shown).toEqual([glyph(3)])
    expect(fitted.more).toBe(2)
  })

  it('never clips: with no room for one glyph and the pill, the pill alone', () => {
    expect(fitGlyphs([glyph(3), glyph(4)], 40)).toEqual({ shown: [], more: 2 })
  })

  it('draws nothing for a quiet room', () => {
    expect(fitGlyphs([], 72)).toEqual({ shown: [], more: 0 })
  })
})

describe('glyphBudget', () => {
  it('is the tile less its paddings, and beside a horizontal glyph less that too', () => {
    expect(glyphBudget(96, 'vertical')).toBe(72)
    expect(glyphBudget(148, 'horizontal')).toBe(90)
  })
})

describe('the room rows', () => {
  it('offer the style only to a tile panel, and only once there is a room', async () => {
    const { roomRows } = await import('../../core/area-form')
    const names = (rows: { name: string }[]) => rows.map(row => row.name)
    expect(names(roomRows({ area: 'den' }, { style: true }))).toContain('summary_style')
    expect(names(roomRows({ area: 'den' }))).not.toContain('summary_style')
    expect(names(roomRows({}, { style: true }))).toEqual(['area'])
  })
})

describe("a room's own icons as glyphs", () => {
  it('keep their colour and short text, and are priced by it', () => {
    const [own] = splitSummary([
      {
        part: 'custom',
        text: 'Dryer 12m',
        icon: 'mdi:tumble-dryer',
        entities: ['sensor.dryer'],
        alert: false,
        color: 'var(--cw-green)',
        badge: '12m',
      },
    ]).glyphs
    expect(own).toMatchObject({ tint: 'var(--cw-green)', text: '12m', label: 'Dryer 12m' })
    expect(own?.count).toBeUndefined()
    expect(glyphWidth({ text: '12m' })).toBe(24 + 3 * 7)
  })
})
