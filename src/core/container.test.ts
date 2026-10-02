import { describe, expect, it } from 'vitest'

import { CARD_CONTAINERS, PANEL_DEFAULT_CONTAINER, containerFor, panelClass } from './container'

describe('containerFor', () => {
  it('reads either container through', () => {
    expect(containerFor('glass', 'card')).toBe('glass')
    expect(containerFor('card', 'glass')).toBe('card')
  })

  it('falls back to the card’s own default when the key is absent', () => {
    // The vocabulary still takes the fallback as an argument, even though every card now passes
    // glass: a card that wants the other reading says so here rather than in a second helper.
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
  it('is nothing only when a panel card asks for its theme’s card outright', () => {
    expect(panelClass('card')).toBe('')
  })

  it('is cw-glass for glass, for an absent key, and for anything unreadable: panels default to glass', () => {
    // A contract change in feedback round 4: the panels defaulted to card until a calendar
    // with no container key sat as the one opaque card among glass chips and tiles.
    expect(panelClass('glass')).toBe('cw-glass')
    expect(panelClass(undefined)).toBe('cw-glass')
    expect(panelClass('frosted')).toBe('cw-glass')
  })
})

describe('PANEL_DEFAULT_CONTAINER', () => {
  it('is glass, the default chips and tiles already have, so every card matches out of the box', () => {
    expect(PANEL_DEFAULT_CONTAINER).toBe('glass')
  })
})
