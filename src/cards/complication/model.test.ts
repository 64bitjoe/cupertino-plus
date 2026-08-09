import { describe, expect, it } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { entityConfigs, readComplications, watchedIds } from './model'

const state = (
  entity_id: string,
  value: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({ entity_id, state: value, attributes, last_changed: '', last_updated: '' })

const hassWith = (...states: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(states.map(s => [s.entity_id, s])),
    entities: {},
    locale: { language: 'en', time_format: '24', first_weekday: 'monday' },
    localize: () => '',
  }) as unknown as HomeAssistant

describe('entityConfigs', () => {
  it('takes a bare id, an object, or a scalar written where a list was meant', () => {
    expect(entityConfigs('sensor.a')).toEqual([{ entity: 'sensor.a' }])
    expect(entityConfigs(['sensor.a', { entity: 'sensor.b', name: 'B' }])).toEqual([
      { entity: 'sensor.a' },
      { entity: 'sensor.b', name: 'B' },
    ])
  })

  it('answers with nothing for nothing, rather than throwing', () => {
    expect(entityConfigs(undefined)).toEqual([])
    expect(entityConfigs([])).toEqual([])
    expect(entityConfigs(null as never)).toEqual([])
  })
})

describe('watchedIds', () => {
  it('is every id the rendering reads', () => {
    expect(watchedIds(['sensor.a', { entity: 'sensor.b' }])).toEqual(['sensor.a', 'sensor.b'])
  })
})

describe('readComplications', () => {
  it('formats a reading with its unit and carries the derived range and tint', () => {
    const hass = hassWith(
      state('sensor.phone', '72', {
        friendly_name: 'Phone',
        device_class: 'battery',
        unit_of_measurement: '%',
      }),
    )

    const [phone] = readComplications(hass, ['sensor.phone'], {})

    expect(phone.name).toBe('Phone')
    expect(phone.value).toBe('72%')
    expect(phone.numeric).toBe(72)
    expect(phone.range).toEqual({ min: 0, max: 100 })
    expect(phone.fraction).toBe(0.72)
    expect(phone.tint).toBe('green')
    expect(phone.unavailable).toBe(false)
  })

  it('draws no gauge for a reading with no range, and still shows the value', () => {
    const hass = hassWith(
      state('sensor.lounge', '21.4', {
        friendly_name: 'Lounge',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
    )

    const [lounge] = readComplications(hass, ['sensor.lounge'], {})

    expect(lounge.value).toBe('21.4 °C')
    expect(lounge.range).toBeNull()
    expect(lounge.fraction).toBeNull()
    expect(lounge.tint).toBe('orange')
  })

  /**
   * The battery card's rule, for the battery card's reason: an entity that stopped
   * reporting is exactly what somebody puts a widget on a dashboard to find out.
   */
  it('keeps an unavailable entity, dashed and flagged', () => {
    const hass = hassWith(state('sensor.gone', 'unavailable', { friendly_name: 'Gone' }))

    const [gone] = readComplications(hass, ['sensor.gone'], {})

    expect(gone.value).toBe('—')
    expect(gone.numeric).toBeNull()
    expect(gone.unavailable).toBe(true)
  })

  it('keeps an entity that is not in hass at all', () => {
    const [missing] = readComplications(hassWith(), ['sensor.never_existed'], {})

    expect(missing.id).toBe('sensor.never_existed')
    expect(missing.name).toBe('sensor.never_existed')
    expect(missing.unavailable).toBe(true)
  })

  it('lets a per-entity setting beat the card, and the card beat the derivation', () => {
    const hass = hassWith(
      state('sensor.t', '20', { friendly_name: 'T', device_class: 'temperature' }),
    )

    const [derived] = readComplications(hass, ['sensor.t'], {})
    expect(derived.range).toBeNull()
    expect(derived.tint).toBe('orange')

    const [carded] = readComplications(hass, ['sensor.t'], { min: 16, max: 24, color: 'blue' })
    expect(carded.range).toEqual({ min: 16, max: 24 })
    expect(carded.fraction).toBe(0.5)
    expect(carded.tint).toBe('blue')

    const [rowed] = readComplications(
      hass,
      [{ entity: 'sensor.t', min: 0, max: 40, color: 'pink', name: 'Mine' }],
      { min: 16, max: 24, color: 'blue' },
    )
    expect(rowed.range).toEqual({ min: 0, max: 40 })
    expect(rowed.tint).toBe('pink')
    expect(rowed.name).toBe('Mine')
  })

  it('always answers with an icon, so no cell renders an empty one', () => {
    const hass = hassWith(
      state('sensor.a', '1', { icon: 'mdi:duck' }),
      state('sensor.b', '1', { device_class: 'temperature' }),
      state('lock.c', 'locked'),
      state('sensor.d', '1'),
    )

    const [own, byClass, byDomain, fallback] = readComplications(
      hass,
      ['sensor.a', 'sensor.b', 'lock.c', 'sensor.d'],
      {},
    )

    expect(own.icon).toBe('mdi:duck')
    expect(byClass.icon).toBe('mdi:thermometer')
    expect(byDomain.icon).toBe('mdi:lock')
    expect(fallback.icon).toBe('mdi:eye')
  })

  it('carries a supporting line only where one is obviously right', () => {
    const hass = hassWith(
      state('climate.lounge', 'heat', { friendly_name: 'Lounge', temperature: 22 }),
      state('media_player.kitchen', 'playing', {
        friendly_name: 'Kitchen',
        media_title: 'Weightless',
      }),
      state('sensor.plain', '5', { friendly_name: 'Plain' }),
    )

    const [climate, media, plain] = readComplications(
      hass,
      ['climate.lounge', 'media_player.kitchen', 'sensor.plain'],
      {},
    )

    expect(climate.supporting).toBe('Heating to 22°')
    expect(media.supporting).toBe('Weightless')
    expect(plain.supporting).toBeNull()
  })
})
