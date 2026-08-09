import { describe, expect, it } from 'vitest'

import type { HassEntity } from '../../core/types/ha'
import { tintFor, tintVar } from './tint'

const entity = (entity_id: string, attributes: Record<string, unknown> = {}): HassEntity => ({
  entity_id,
  state: '1',
  attributes,
  last_changed: '',
  last_updated: '',
})

describe('tintFor', () => {
  it('reads device_class before anything else', () => {
    expect(tintFor(entity('sensor.a', { device_class: 'temperature' }))).toBe('orange')
    expect(tintFor(entity('sensor.b', { device_class: 'humidity' }))).toBe('blue')
    expect(tintFor(entity('sensor.c', { device_class: 'moisture' }))).toBe('blue')
    expect(tintFor(entity('sensor.d', { device_class: 'battery' }))).toBe('green')
    expect(tintFor(entity('sensor.e', { device_class: 'power' }))).toBe('yellow')
    expect(tintFor(entity('sensor.f', { device_class: 'illuminance' }))).toBe('yellow')
    expect(tintFor(entity('sensor.g', { device_class: 'pressure' }))).toBe('teal')
    expect(tintFor(entity('sensor.h', { device_class: 'carbon_dioxide' }))).toBe('indigo')
  })

  it('falls back to the domain when there is no device class', () => {
    expect(tintFor(entity('lock.front_door'))).toBe('red')
    expect(tintFor(entity('media_player.kitchen'))).toBe('pink')
    expect(tintFor(entity('light.hall'))).toBe('yellow')
    expect(tintFor(entity('cover.garage'))).toBe('indigo')
  })

  it('answers accent for anything it does not recognise', () => {
    expect(tintFor(entity('sensor.unknowable'))).toBe('accent')
    expect(tintFor(entity('weird.thing', { device_class: 'invented' }))).toBe('accent')
  })

  it('prefers the device class over the domain when they disagree', () => {
    expect(tintFor(entity('light.grow_lamp', { device_class: 'temperature' }))).toBe('orange')
  })
})

describe('tintVar', () => {
  it('names the token, so a card never writes a colour of its own', () => {
    expect(tintVar('orange')).toBe('var(--cw-orange)')
    expect(tintVar('accent')).toBe('var(--cw-accent)')
  })
})
