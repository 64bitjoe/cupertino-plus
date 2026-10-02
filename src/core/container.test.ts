import { describe, expect, it } from 'vitest'

import { CARD_CONTAINERS, containerFor, panelClass } from './container'

describe('containerFor', () => {
  it('reads either container through', () => {
    expect(containerFor('glass', 'card')).toBe('glass')
    expect(containerFor('card', 'glass')).toBe('card')
  })

  it('falls back to the card’s own default when the key is absent', () => {
    // Each card keeps its own default: glass for chips and tiles, card for the four panels.
    expect(containerFor(undefined, 'glass')).toBe('glass')
    expect(containerFor(undefined, 'card')).toBe('card')
  })

  it('falls back on anything that is not one of the two', () => {
    expect(containerFor('Glass', 'card')).toBe('card')
    expect(containerFor('', 'card')).toBe('card')
    expect(containerFor(1, 'glass')).toBe('glass')
  })

  it('names exactly the two containers, in the order the editors list them', () => {
    expect(CARD_CONTAINERS).toEqual(['glass', 'card'])
  })
})

describe('panelClass', () => {
  it('is cw-glass only when a panel card asks for glass outright', () => {
    expect(panelClass('glass')).toBe('cw-glass')
  })

  it('is nothing for card, for an absent key, and for anything unreadable: panels default to card', () => {
    expect(panelClass('card')).toBe('')
    expect(panelClass(undefined)).toBe('')
    expect(panelClass('frosted')).toBe('')
  })
})
