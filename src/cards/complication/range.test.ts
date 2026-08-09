import { describe, expect, it } from 'vitest'

import type { HassEntity } from '../../core/types/ha'
import { fractionOf, rangeFor } from './range'

const entity = (
  entity_id: string,
  state = '50',
  attributes: Record<string, unknown> = {},
): HassEntity => ({ entity_id, state, attributes, last_changed: '', last_updated: '' })

describe('rangeFor', () => {
  it('gives a percentage anything measured in percent', () => {
    expect(rangeFor(entity('sensor.a', '72', { unit_of_measurement: '%' }))).toEqual({
      min: 0,
      max: 100,
    })
    expect(rangeFor(entity('sensor.b', '72', { device_class: 'battery' }))).toEqual({
      min: 0,
      max: 100,
    })
    expect(rangeFor(entity('sensor.c', '40', { device_class: 'humidity' }))).toEqual({
      min: 0,
      max: 100,
    })
  })

  it('reads a cover off its position and a light off its brightness', () => {
    expect(rangeFor(entity('cover.garage', 'open', { current_position: 40 }))).toEqual({
      min: 0,
      max: 100,
    })
    expect(rangeFor(entity('light.hall', 'on', { brightness: 128 }))).toEqual({ min: 0, max: 255 })
  })

  it('takes a number entity at its own word', () => {
    expect(rangeFor(entity('number.target', '5', { min: 1, max: 10 }))).toEqual({ min: 1, max: 10 })
    expect(rangeFor(entity('input_number.x', '5', { min: -20, max: 20 }))).toEqual({
      min: -20,
      max: 20,
    })
  })

  /**
   * The decision recorded in the spec's §10.1: a current temperature drawn against a
   * thermostat's own limits is an arc that sits mid-scale and barely moves, which is a
   * gauge that says nothing. `min`/`max` are how somebody who disagrees gets one.
   */
  it('gives a climate entity no range of its own', () => {
    expect(
      rangeFor(
        entity('climate.lounge', 'heat', { min_temp: 7, max_temp: 35, current_temperature: 21 }),
      ),
    ).toBeNull()
  })

  it('gives an ordinary sensor no range at all', () => {
    expect(
      rangeFor(
        entity('sensor.lounge_temp', '21.4', {
          device_class: 'temperature',
          unit_of_measurement: '°C',
        }),
      ),
    ).toBeNull()
    expect(rangeFor(entity('sensor.text', 'Idle'))).toBeNull()
  })

  it('lets an override win, and needs both halves of one', () => {
    const temp = entity('sensor.t', '21', { device_class: 'temperature' })
    expect(rangeFor(temp, { min: 16, max: 24 })).toEqual({ min: 16, max: 24 })
    expect(rangeFor(temp, { min: 16 })).toBeNull()
    expect(rangeFor(temp, { max: 24 })).toBeNull()
  })

  it('refuses a range that is empty or backwards, rather than dividing by zero', () => {
    const temp = entity('sensor.t', '21')
    expect(rangeFor(temp, { min: 20, max: 20 })).toBeNull()
    expect(rangeFor(temp, { min: 24, max: 16 })).toBeNull()
  })
})

describe('fractionOf', () => {
  it('is the position in the range, clamped to it', () => {
    expect(fractionOf(50, { min: 0, max: 100 })).toBe(0.5)
    expect(fractionOf(20, { min: 16, max: 24 })).toBe(0.5)
    expect(fractionOf(-5, { min: 0, max: 100 })).toBe(0)
    expect(fractionOf(140, { min: 0, max: 100 })).toBe(1)
  })
})
