import { describe, expect, it } from 'vitest'

import { entityRows, formatValue, iconFor, nameFor, numberOf } from './entity-view'
import type { HassEntity, HomeAssistant } from './types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    context: { id: '' },
    ...over,
  }) as HassEntity

const hass = (over: Partial<HomeAssistant> = {}): HomeAssistant =>
  ({
    states: {},
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
    ...over,
  }) as unknown as HomeAssistant

describe('formatValue', () => {
  it('sets a degree unit tight against the numeral, like a percentage', () => {
    // The bug this fixes: `°C` took the generic space branch, so a thermostat read
    // `21.4 °C` where the frontend writes `21.4°C`.
    const read = entity({
      entity_id: 'sensor.hall',
      state: '21.4',
      attributes: { unit_of_measurement: '°C' },
    })
    expect(formatValue(hass(), read)).toBe('21.4°C')
  })

  it('still sets an ordinary unit off with a space', () => {
    const read = entity({
      entity_id: 'sensor.draw',
      state: '12',
      attributes: { unit_of_measurement: 'W' },
    })
    expect(formatValue(hass(), read)).toBe('12 W')
  })

  it('keeps a percentage tight', () => {
    const read = entity({
      entity_id: 'sensor.batt',
      state: '41',
      attributes: { unit_of_measurement: '%' },
    })
    expect(formatValue(hass(), read)).toBe('41%')
  })

  it('reads a non-numeric state as a sentence, underscores and all', () => {
    const read = entity({ entity_id: 'person.joe', state: 'not_home' })
    expect(formatValue(hass(), read)).toBe('Not home')
  })
})

describe('entityRows', () => {
  it('reads a bare scalar as a one-row list', () => {
    expect(entityRows('sensor.a')).toEqual([{ entity: 'sensor.a' }])
  })

  it('skips a row with no usable entity rather than failing the whole card', () => {
    expect(entityRows(['sensor.a', { name: 'no id' }, null, 7, { entity: 'sensor.b' }])).toEqual([
      { entity: 'sensor.a' },
      { entity: 'sensor.b' },
    ])
  })
})

describe('nameFor and iconFor', () => {
  it('names an entity by its friendly name, falling back to its id', () => {
    expect(nameFor(entity({ entity_id: 'sensor.a', attributes: { friendly_name: 'Hall' } }))).toBe(
      'Hall',
    )
    expect(nameFor(entity({ entity_id: 'sensor.a' }))).toBe('sensor.a')
  })

  it('prefers the entity own icon, then device class, then domain, then the fallback', () => {
    expect(iconFor(entity({ entity_id: 'sensor.a', attributes: { icon: 'mdi:custom' } }))).toBe(
      'mdi:custom',
    )
    expect(
      iconFor(entity({ entity_id: 'sensor.a', attributes: { device_class: 'humidity' } })),
    ).toBe('mdi:water-percent')
    expect(iconFor(entity({ entity_id: 'lock.front' }))).toBe('mdi:lock')
    expect(iconFor(entity({ entity_id: 'unheard_of.thing' }))).toBe('mdi:eye')
  })
})

describe('numberOf', () => {
  it('reads a finite number and rejects everything else, blank included', () => {
    expect(numberOf('21.4')).toBe(21.4)
    expect(numberOf('')).toBeNull()
    expect(numberOf('  ')).toBeNull()
    expect(numberOf('unavailable')).toBeNull()
  })
})
