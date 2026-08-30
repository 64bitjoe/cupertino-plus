import { describe, expect, it } from 'vitest'

import { colorValue, isTint, TINTS, tintVar } from './tint'

describe('the palette', () => {
  it('holds the ten names tokens.ts carries', () => {
    expect(TINTS).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'blue',
      'indigo',
      'purple',
      'pink',
      'accent',
    ])
  })

  it('resolves a name to a token reference rather than a literal', () => {
    expect(tintVar('red')).toBe('var(--cw-red)')
  })

  it('recognises a palette name and nothing else', () => {
    expect(isTint('teal')).toBe(true)
    expect(isTint('#ff8800')).toBe(false)
    expect(isTint('Teal')).toBe(false)
  })
})

/**
 * The chips card's `color:`. A palette name keeps tracking the theme through `tokens.ts`; an
 * arbitrary CSS colour is the escape hatch and is passed through untouched, because this
 * library has no business parsing CSS — the CSSOM does that at `setProperty` time and drops
 * what it cannot read, so a typo is a chip with no tint rather than a broken rule.
 */
describe('colorValue', () => {
  it('turns a palette name into its token', () => {
    expect(colorValue('blue')).toBe('var(--cw-blue)')
    expect(colorValue('accent')).toBe('var(--cw-accent)')
  })

  it('passes anything else through verbatim', () => {
    expect(colorValue('#ff8800')).toBe('#ff8800')
    expect(colorValue('var(--my-token)')).toBe('var(--my-token)')
    expect(colorValue('rgb(1 2 3)')).toBe('rgb(1 2 3)')
  })

  it('answers nothing for nothing, so a card can ask without checking first', () => {
    expect(colorValue(undefined)).toBeUndefined()
    expect(colorValue('')).toBeUndefined()
    expect(colorValue('   ')).toBeUndefined()
  })

  it('trims, because YAML makes trailing spaces easy and invisible', () => {
    expect(colorValue(' green ')).toBe('var(--cw-green)')
  })
})
