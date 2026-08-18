import { describe, expect, it } from 'vitest'

import { readChips } from './model'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'

const entity = (over: Partial<HassEntity> & { entity_id: string }): HassEntity =>
  ({
    state: '0',
    attributes: {},
    last_changed: '',
    last_updated: '',
    context: { id: '' },
    ...over,
  }) as HassEntity

const hassWith = (...list: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
  }) as unknown as HomeAssistant

const HALL = entity({
  entity_id: 'sensor.hall',
  state: '21.4',
  attributes: { friendly_name: 'Hall', unit_of_measurement: '°C', device_class: 'temperature' },
})

describe('readChips', () => {
  it('reads a bare id into a drawable chip at the default content mode', () => {
    const [chip] = readChips(hassWith(HALL), ['sensor.hall'], {})
    expect(chip).toEqual({
      entityId: 'sensor.hall',
      name: 'Hall',
      icon: 'mdi:thermometer',
      value: '21.4°C',
      content: 'value',
      unavailable: false,
      action: { action: 'more-info' },
    })
  })

  it('takes the card default, and lets a row override it', () => {
    const chips = readChips(
      hassWith(HALL),
      ['sensor.hall', { entity: 'sensor.hall', content: 'icon' }],
      {
        content: 'labeled',
      },
    )
    expect(chips.map(chip => chip.content)).toEqual(['labeled', 'icon'])
  })

  it('draws an entity that is not in hass at all, rather than dropping it', () => {
    // A chip has a configured identity to draw against — unlike the weather card, which
    // returns null because it has nothing of its own to show.
    const [chip] = readChips(hassWith(), [{ entity: 'sensor.gone', name: 'Gone' }], {})
    expect(chip).toMatchObject({
      entityId: 'sensor.gone',
      name: 'Gone',
      value: '—',
      unavailable: true,
    })
  })

  it('dashes and flags an entity that is present but not reporting', () => {
    const dead = entity({
      entity_id: 'sensor.hall',
      state: 'unavailable',
      attributes: { friendly_name: 'Hall' },
    })
    const [chip] = readChips(hassWith(dead), ['sensor.hall'], {})
    expect(chip).toMatchObject({ value: '—', unavailable: true, name: 'Hall' })
  })

  it('prefers a row name and icon over the entity own', () => {
    const [chip] = readChips(
      hassWith(HALL),
      [{ entity: 'sensor.hall', name: 'Downstairs', icon: 'mdi:sofa' }],
      {},
    )
    expect(chip).toMatchObject({ name: 'Downstairs', icon: 'mdi:sofa' })
  })

  it('carries a per-row tap action, defaulting to more-info', () => {
    const rows = [
      { entity: 'sensor.hall', tap_action: { action: 'toggle' as const } },
      'sensor.hall',
    ]
    expect(readChips(hassWith(HALL), rows, {}).map(chip => chip.action.action)).toEqual([
      'toggle',
      'more-info',
    ])
  })
})
