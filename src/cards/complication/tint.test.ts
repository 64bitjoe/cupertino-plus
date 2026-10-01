import { describe, expect, it } from 'vitest'

import { onTintVar, tintVar } from './tint'

describe('tintVar', () => {
  it('names the token, so a card never writes a colour of its own', () => {
    expect(tintVar('orange')).toBe('var(--cw-orange)')
    expect(tintVar('accent')).toBe('var(--cw-accent)')
  })
})

describe('onTintVar', () => {
  // Measured with WCAG's contrast formula against both the light and dark value of every
  // tint in tokens.ts: white on these four falls below even the 3:1 floor a large glyph is
  // held to (yellow 1.4-1.5:1, orange/green/teal 2.0-2.6:1 in both themes), so they get a
  // fixed near-black ink instead. This is the one durable check of that measurement --
  // see onTintVar's own comment for the rest of the reasoning.
  it('gives the four tints white fails on a fixed dark ink', () => {
    expect(onTintVar('yellow')).toBe('#1d1d1f')
    expect(onTintVar('orange')).toBe('#1d1d1f')
    expect(onTintVar('green')).toBe('#1d1d1f')
    expect(onTintVar('teal')).toBe('#1d1d1f')
  })

  // red clears 3:1 by a hair (3.41-3.55:1); the rest clear it comfortably, and accent is
  // the theme's own colour and unknowable here.
  it('keeps white everywhere else', () => {
    expect(onTintVar('red')).toBe('#fff')
    expect(onTintVar('blue')).toBe('#fff')
    expect(onTintVar('indigo')).toBe('#fff')
    expect(onTintVar('purple')).toBe('#fff')
    expect(onTintVar('pink')).toBe('#fff')
    expect(onTintVar('accent')).toBe('#fff')
  })
})
