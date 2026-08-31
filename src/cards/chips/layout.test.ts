import { describe, expect, it } from 'vitest'

import {
  bandFor,
  floorsFor,
  groupRows,
  rowHeightFor,
  widthOf,
  ROW_LABELED,
  ROW_SINGLE,
} from './layout'
import { rowsToPx } from '../../core/size'
import type { ChipView } from './model'

/**
 * A realistically-sized chip, and the sizes matter now: `widthOf` prices a chip from the text
 * it actually draws, so a helper printing `1` would make every chip 56 units wide and quietly
 * stop these wrapping assertions from testing anything. A six-character reading and a longer
 * name put `icon` (44), `value` (94) and `labeled` (153) far enough apart to tell apart.
 */
const chip = (content: ChipView['content']): ChipView => ({
  entityId: 'sensor.a',
  name: 'Hall Temperature',
  icon: 'mdi:eye',
  picture: undefined,
  value: '21.4°C',
  content,
  unavailable: false,
  color: undefined,
  visible: true,
  break: false,
  fill: false,
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

  /**
   * Both priced against the SAME width, which is the only way to ask this question now that
   * chips are packed at their own nominal widths: a labeled card also floors WIDER
   * (`min_columns` 11 against 9, since the band's nominal chip is 128 units), and left to
   * choose their own widths the extra room buys back the extra height and the two land on the
   * same row count. The invariant is about the taller row, not about the wider card.
   */
  it('asks for more height for a labeled band than for a plain one at the same width', () => {
    const plain = floorsFor(
      Array.from({ length: 7 }, () => chip('value')),
      373,
    )
    const labeled = floorsFor(
      [...Array.from({ length: 6 }, () => chip('value')), chip('labeled')],
      373,
    )
    expect(labeled.min_rows).toBeGreaterThan(plain.min_rows)
  })

  /**
   * The over-report this width argument exists to stop. Five chips that share one line in a
   * real 640-unit card were being counted as two lines against the assumed 341, and every
   * invented line is an empty grid row the user sees as a gap.
   */
  it('counts the lines the real width allows, not the assumed one', () => {
    const five = Array.from({ length: 5 }, () => chip('value'))
    expect(floorsFor(five, 640).min_rows).toBeLessThan(floorsFor(five).min_rows)
  })

  it('prices an icon-only chip at its own width rather than the band, so more share a line', () => {
    const wide = [chip('value'), chip('value'), chip('value'), chip('value')]
    const narrow = [chip('value'), chip('icon'), chip('icon'), chip('icon')]
    expect(floorsFor(narrow, 400).min_rows).toBeLessThanOrEqual(floorsFor(wide, 400).min_rows)
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

/**
 * Which chips share a row. The card renders one flex container per group and `floorsFor`
 * prices each group's own wrapping, so these two have to agree about the count or a card with
 * forced rows is handed a box too short and clips the difference.
 */
describe('groupRows', () => {
  const at = (content: ChipView['content'], brk = false) => ({ ...chip(content), break: brk })

  it('keeps everything on one row when nothing asks otherwise', () => {
    const rows = groupRows([at('value'), at('value'), at('value')])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(3)
  })

  it('starts a new row at a chip that asks for one', () => {
    const rows = groupRows([at('value'), at('value'), at('value', true), at('value')])
    expect(rows.map(row => row.length)).toEqual([2, 2])
  })

  /**
   * Every chip starts a row when it is the first one, so the flag says nothing there — and
   * honouring it would draw a leading empty row, which is 44 units of unexplained gap above
   * the card's content. Reachable by dragging a chip that has the flag to the top.
   */
  it('ignores a break on the first chip rather than opening with an empty row', () => {
    const rows = groupRows([at('value', true), at('value')])
    expect(rows.map(row => row.length)).toEqual([2])
  })

  it('allows consecutive breaks, one chip to a row', () => {
    const rows = groupRows([at('value'), at('value', true), at('value', true)])
    expect(rows.map(row => row.length)).toEqual([1, 1, 1])
  })

  it('answers nothing for nothing', () => {
    expect(groupRows([])).toEqual([])
  })
})

describe('floorsFor with forced rows', () => {
  const at = (brk = false) => ({ ...chip('value'), break: brk })

  /**
   * Three chips fit one line on their own; split across two rows they need two. Counting the
   * list as a single run would under-report by a line, and an under-reported floor is exactly
   * the clipping this module exists to prevent.
   */
  it('asks for the height the forced rows actually need', () => {
    const flowing = floorsFor([at(), at(), at()])
    const split = floorsFor([at(), at(true), at()])
    expect(split.min_rows).toBeGreaterThan(flowing.min_rows)
  })
})

describe('floorsFor with a filling spacer', () => {
  /**
   * A filling chip is elastic — it takes the leftover and collapses when there is none — so it
   * can never be the thing that pushes a line onto the next one. Charging it a nominal width
   * would invent a line the browser will not draw, which is an empty grid row the user sees.
   */
  it('costs nothing in the line arithmetic', () => {
    const four = Array.from({ length: 4 }, () => chip('value'))
    const withFill = [...four.slice(0, 2), { ...chip('value'), fill: true }, ...four.slice(2)]
    expect(floorsFor(withFill, 420).min_rows).toBe(floorsFor(four, 420).min_rows)
  })
})

describe('floorsFor and the container inset', () => {
  /**
   * Glass paints no surface and so insets by nothing. 32 units of vertical padding is exactly
   * the difference between one row of chips fitting a single grid row (44 of 56) and needing
   * two (76) — the padding was buying an entire empty row inside a box nobody can see.
   */
  it('fits one row of chips in one grid row when nothing is inset', () => {
    const three = Array.from({ length: 3 }, () => chip('value'))
    expect(floorsFor(three, 640, 0).min_rows).toBe(1)
    expect(floorsFor(three, 640, 16).min_rows).toBe(2)
  })
})

/**
 * The pricing that made a real card buy an empty grid row.
 *
 * `NOMINAL_WIDTH` charged every reading-bearing chip a flat 96 units whatever it printed, so a
 * row drawing `79`, `43`, `0 kWh` and a bare gear was priced at 408 and drawn at about 260. The
 * floor concluded it wrapped, asked for a third grid row, and the user saw the difference as
 * empty dashboard under their chips.
 */
describe('widthOf', () => {
  it('prices a short reading well under a flat per-mode guess', () => {
    expect(widthOf({ content: 'value', value: '79', name: 'Alpine' })).toBeLessThan(96)
  })

  it('prices a longer reading wider than a shorter one', () => {
    const short = widthOf({ content: 'value', value: '79', name: 'A' })
    const long = widthOf({ content: 'value', value: '1234.5 kWh', name: 'A' })
    expect(long).toBeGreaterThan(short)
  })

  /** A chip with an icon and no reading -- an entity-less nav chip -- draws only its glyph. */
  it('charges a chip printing nothing only for its glyph and tap target', () => {
    expect(widthOf({ content: 'value', value: '', name: '' })).toBe(ROW_SINGLE)
  })

  it('costs nothing for a filling chip, which is elastic', () => {
    expect(widthOf({ content: 'value', value: '79', name: 'A', fill: true })).toBe(0)
  })

  /** Before `hass` there is no resolved text, and the per-mode guess is the only option. */
  it('falls back to the per-mode guess when nothing has resolved yet', () => {
    expect(widthOf({ content: 'value' })).toBe(96)
    expect(widthOf({ content: 'labeled' })).toBe(128)
  })

  it('caps a very long reading where the stylesheet caps it', () => {
    const huge = widthOf({ content: 'value', value: 'x'.repeat(400), name: 'A' })
    expect(huge).toBeLessThanOrEqual(13 + 17 + 13 + 6 + 140)
  })
})

describe('the card that surfaced all of this', () => {
  /**
   * Seven entries as configured: four readings, a filling spacer, a bare gear, and two labeled
   * person chips on a forced second row. Two rows of chips is two rows of chips — 2 * 48 plus
   * one 8-unit gap, which fits two grid rows and must not ask for three.
   */
  it('asks for two grid rows, not three', () => {
    const row = [
      { content: 'value' as const, value: '79', name: 'Alpine' },
      { content: 'value' as const, value: '43', name: 'Unavailable' },
      { content: 'value' as const, fill: true },
      { content: 'value' as const, value: '0 kWh', name: 'Solar' },
      { content: 'value' as const, value: '', name: '' },
      { content: 'labeled' as const, value: 'Home', name: 'Joe', break: true },
      { content: 'labeled' as const, value: 'Home', name: 'Cody' },
    ]
    // His card: about 415 CSS px at scale 95, glass so nothing is inset.
    expect(floorsFor(row, 415 / 0.95, 0).min_rows).toBe(2)
  })
})
