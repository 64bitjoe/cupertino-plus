import { describe, expect, it } from 'vitest'

import { colorValue, isTint, TINTS, tintFor, tintVar } from './tint'
import type { HassEntity } from './types/ha'

const entity = (entity_id: string, attributes: Record<string, unknown> = {}): HassEntity =>
  ({ entity_id, state: '0', attributes, last_changed: '', last_updated: '' }) as HassEntity

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

/**
 * The tint an entity gets when nobody has said. Moved here from the complication card when the
 * tiles card became its second caller — the same test §10 of the family spec sets, and the one
 * that moved `ring.ts` and the palette before it.
 */
describe('tintFor', () => {
  it('reads device_class first, because it is the more specific claim', () => {
    expect(tintFor(entity('sensor.hallway', { device_class: 'temperature' }))).toBe('orange')
    expect(tintFor(entity('sensor.tank', { device_class: 'humidity' }))).toBe('blue')
  })

  it('falls back to the domain for an entity with no device class', () => {
    expect(tintFor(entity('lock.front_door'))).toBe('red')
    expect(tintFor(entity('light.kitchen'))).toBe('yellow')
    expect(tintFor(entity('person.joe'))).toBe('blue')
  })

  it('prefers what an entity measures over what it is', () => {
    // A light reporting a temperature is a thermometer, whatever its domain says.
    expect(tintFor(entity('light.sensor_lamp', { device_class: 'temperature' }))).toBe('orange')
  })

  /** `accent` is the theme's own primary, so an unrecognised entity still fits the dashboard. */
  it('answers accent for what neither table knows', () => {
    expect(tintFor(entity('sensor.mystery'))).toBe('accent')
    expect(tintFor(entity('wibble.thing'))).toBe('accent')
  })
})
