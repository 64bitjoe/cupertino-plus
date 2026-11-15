import { describe, expect, it } from 'vitest'

import { BENTO_GAP } from './bento'
import { GAP, GRAPH_MIN, INLINE_ROW, LABEL_GAP, RECT_BLOCK } from './metrics'
import { complicationStyles } from './styles'

describe('one number for each length the stylesheet and the layout share', () => {
  const sheet = complicationStyles.cssText.replace(/\s+/g, ' ')

  it('draws the gap the layout prices, in the panel and in bento alike', () => {
    expect(BENTO_GAP).toBe(GAP)
    expect(sheet).toContain(`--cw-comp-gap: calc(${GAP}px * var(--cw-scale))`)
  })

  it('draws the caption gap and the floors the layout prices', () => {
    expect(sheet).toContain(`gap: calc(${LABEL_GAP}px * var(--cw-scale))`)
    expect(sheet).toContain(`min-height: calc(${INLINE_ROW}px * var(--cw-scale))`)
    expect(sheet).toContain(`min-height: calc(${RECT_BLOCK}px * var(--cw-scale))`)
    expect(sheet).toContain(`min-height: calc(${GRAPH_MIN}px * var(--cw-scale))`)
  })

  it('keeps the values every existing card was drawn with', () => {
    expect([GAP, LABEL_GAP, INLINE_ROW, RECT_BLOCK, GRAPH_MIN]).toEqual([14, 6, 44, 104, 96])
  })
})
