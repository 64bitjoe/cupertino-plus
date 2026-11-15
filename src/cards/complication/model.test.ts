import { describe, expect, it } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import {
  COLOR_AUTOMATIC,
  complicationFromForm,
  complicationRows,
  complicationTemplates,
  complicationToForm,
  entityConfigs,
  historyFor,
  OVERRIDE_CARD,
  readComplications,
  rowHasTemplates,
  watchedIds,
  type ComplicationEntityConfig,
} from './model'

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

    // `°C` is a tight unit (see `core/entity-view.ts`'s `TIGHT_UNITS`), so this reads
    // `21.4°C` rather than `21.4 °C` — the same fix this task's move applies everywhere.
    expect(lounge.value).toBe('21.4°C')
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

  /**
   * A row that narrows only one end of the range must not lose the other end: the
   * module's precedence is per-key (per-entity beats card beats derivation for `min`
   * and for `max` separately), not "a row that sets anything replaces the whole pair".
   */
  it('fills in the other half of the range from the card default, not from nothing', () => {
    const hass = hassWith(
      state('sensor.t', '20', { friendly_name: 'T', device_class: 'temperature' }),
    )

    const [halved] = readComplications(hass, [{ entity: 'sensor.t', min: 0 }], {
      min: 16,
      max: 24,
    })

    expect(halved.range).toEqual({ min: 0, max: 24 })
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

  /**
   * `temperature` is the thermostat's setpoint, and it sits on the entity in every mode
   * including `off` — it is not proof of what the thermostat is doing. A verb chosen by
   * a single equality test against `'cool'` would call an off thermostat "Heating"; the
   * fix is a mode-keyed table, and this pins both the previously-wrong `off` case and a
   * `cool` case alongside the brief's own `heat` case above.
   */
  it('does not claim a climate entity is heating when it is off, and picks the right verb', () => {
    const hass = hassWith(
      state('climate.off', 'off', { friendly_name: 'Off', temperature: 22 }),
      state('climate.cool', 'cool', { friendly_name: 'Cool', temperature: 18 }),
    )

    const [off, cool] = readComplications(hass, ['climate.off', 'climate.cool'], {})

    expect(off.supporting).toBeNull()
    expect(cool.supporting).toBe('Cooling to 18°')
  })

  /**
   * A state that is not a number and has no localize hit (the fallback branch of
   * `formatValue`) is only capitalised, not de-snake-cased, unless this is fixed:
   * `not_home` — a `person`/`device_tracker` state a lot of dashboards actually show —
   * would render as the literal `Not_home` rather than `Not home`.
   */
  it('turns a snake_case fallback state into words, not a literal underscore', () => {
    const hass = hassWith(state('person.joe', 'not_home', { friendly_name: 'Joe' }))

    const [away] = readComplications(hass, ['person.joe'], {})

    expect(away.value).toBe('Not home')
  })

  /**
   * `color` is typed as `TintName` but a config is never typechecked on the way in — see
   * `entityConfigs`'s own tolerance for a malformed row. Unlike a missing `entity`, an
   * invalid `color` fails silently downstream (`tintVar` turns it into a `var()` reference
   * nothing defines), so this has to be caught here rather than trusted.
   */
  it('falls back to the derived tint when color is not one of TINTS', () => {
    const hass = hassWith(
      state('sensor.t', '20', { friendly_name: 'T', device_class: 'temperature' }),
    )

    const [row] = readComplications(hass, [{ entity: 'sensor.t', color: 'burgundy' as never }], {})
    expect(row.tint).toBe('orange')

    const [card] = readComplications(hass, ['sensor.t'], { color: 'burgundy' as never })
    expect(card.tint).toBe('orange')

    // A row's own bad value must not block the card default from being consulted: falling
    // back to "unset" per key, the same precedence `rangeOverride` already uses for
    // min/max.
    const [rowBad] = readComplications(hass, [{ entity: 'sensor.t', color: 'burgundy' as never }], {
      color: 'blue',
    })
    expect(rowBad.tint).toBe('blue')

    // The same guard on the "entity missing from hass.states" branch, which has no
    // `tintFor` derivation to fall back to and so falls to 'accent' instead.
    const [missing] = readComplications(
      hassWith(),
      [{ entity: 'sensor.never', color: 'burgundy' as never }],
      {},
    )
    expect(missing.tint).toBe('accent')
  })
})

describe('templates', () => {
  const hass = hassWith(
    state('sensor.phone', '72', {
      friendly_name: 'Phone',
      device_class: 'battery',
      unit_of_measurement: '%',
    }),
  )

  it('registers one request per templated slot and action, with the row entity as variables', () => {
    const requests = complicationTemplates(
      [
        'sensor.plain',
        {
          entity: 'sensor.phone',
          name: '{{ "Mine" }}',
          value: '{{ states(entity) }}',
          supporting: 'Literal, not a template',
          hold_action: { action: 'navigate', navigation_path: '{{ "/lovelace/1" }}' },
        },
      ],
      'Ada',
    )
    expect(requests.map(r => r.template)).toEqual([
      '{{ "Mine" }}',
      '{{ states(entity) }}',
      '{{ "/lovelace/1" }}',
    ])
    expect(requests[0]?.variables).toEqual({
      config: { entity: 'sensor.phone' },
      entity: 'sensor.phone',
      user: 'Ada',
    })
  })

  it('reads each slot from its template once it has answered', () => {
    const answers: Record<string, string> = {
      '{{ n }}': 'Pocket',
      '{{ i }}': 'mdi:cellphone',
      '{{ v }}': 'Nearly full',
      '{{ s }}': 'Charging',
    }
    const [phone] = readComplications(
      hass,
      [
        {
          entity: 'sensor.phone',
          name: '{{ n }}',
          icon: '{{ i }}',
          value: '{{ v }}',
          supporting: '{{ s }}',
        },
      ],
      {},
      { resolve: template => answers[template] },
    )
    expect(phone?.name).toBe('Pocket')
    expect(phone?.icon).toBe('mdi:cellphone')
    expect(phone?.value).toBe('Nearly full')
    expect(phone?.supporting).toBe('Charging')
    // A word is no number, so the gauge has nothing to place.
    expect(phone?.fraction).toBeNull()
  })

  it('falls back to what it would derive while a template has not answered', () => {
    const [phone] = readComplications(
      hass,
      [{ entity: 'sensor.phone', name: '{{ n }}', value: '{{ v }}' }],
      {},
      { resolve: () => undefined },
    )
    expect(phone?.name).toBe('Phone')
    expect(phone?.value).toBe('72%')
    expect(phone?.fraction).toBe(0.72)
  })

  it('lets a template that answers a bare number drive the gauge', () => {
    const [phone] = readComplications(
      hass,
      [{ entity: 'sensor.phone', value: '{{ 25 }}' }],
      {},
      { resolve: () => '25' },
    )
    expect(phone?.value).toBe('25')
    expect(phone?.fraction).toBe(0.25)
  })

  it('prints a literal reading as written, and treats a blank answer as no answer', () => {
    const [literal] = readComplications(hass, [{ entity: 'sensor.phone', value: 'Fine' }], {})
    expect(literal?.value).toBe('Fine')
    const [blank] = readComplications(
      hass,
      [{ entity: 'sensor.phone', value: '{{ x }}' }],
      {},
      { resolve: () => '  ' },
    )
    expect(blank?.value).toBe('72%')
  })

  it('still dashes an unavailable entity, whatever the reading template says', () => {
    const [off] = readComplications(
      hassWith(state('sensor.off', 'unavailable')),
      [{ entity: 'sensor.off', value: '{{ x }}' }],
      {},
      { resolve: () => '12' },
    )
    expect(off?.value).toBe('—')
    expect(off?.numeric).toBeNull()
  })
})

describe('actions', () => {
  const hass = hassWith(state('light.desk', 'on', { friendly_name: 'Desk' }))

  it('taps to more-info and runs no hold or double tap by default', () => {
    const [desk] = readComplications(hass, ['light.desk'], {})
    expect(desk?.action).toEqual({ action: 'more-info' })
    expect(desk && 'holdAction' in desk).toBe(false)
    expect(desk && 'doubleTapAction' in desk).toBe(false)
  })

  it('carries the configured gestures, and drops one set to nothing', () => {
    const [desk] = readComplications(
      hass,
      [
        {
          entity: 'light.desk',
          tap_action: { action: 'toggle' },
          hold_action: { action: 'more-info' },
          double_tap_action: { action: 'none' },
        },
      ],
      {},
    )
    expect(desk?.action).toEqual({ action: 'toggle' })
    expect(desk?.holdAction).toEqual({ action: 'more-info' })
    expect(desk && 'doubleTapAction' in desk).toBe(false)
  })

  it('resolves a template inside an action', () => {
    const [desk] = readComplications(
      hass,
      [{ entity: 'light.desk', tap_action: { action: 'navigate', navigation_path: '{{ p }}' } }],
      {},
      { resolve: () => '/lovelace/lights' },
    )
    expect(desk?.action).toEqual({ action: 'navigate', navigation_path: '/lovelace/lights' })
  })

  it('gives a missing entity the same presses as a present one', () => {
    const [gone] = readComplications(
      hassWith(),
      [{ entity: 'sensor.gone', tap_action: { action: 'none' } }],
      {},
    )
    expect(gone?.unavailable).toBe(true)
    expect(gone?.action).toEqual({ action: 'none' })
  })
})

describe('the row panel', () => {
  it('shows Automatic for no colour and the default tap for no action', () => {
    const data = complicationToForm({ entity: 'sensor.a' })
    expect(data.color).toBe(COLOR_AUTOMATIC)
    expect(data.action).toBe('more-info')
    expect(data.on_hold_action).toBe('none')
  })

  it('writes nothing back for a panel opened and left alone', () => {
    const row = { entity: 'sensor.a' }
    expect(complicationFromForm(row, complicationToForm(row))).toEqual(row)
    expect(complicationRows([complicationFromForm(row, complicationToForm(row))])).toEqual([
      'sensor.a',
    ])
  })

  it('round-trips every field it draws', () => {
    const row: ComplicationEntityConfig = {
      entity: 'sensor.a',
      name: 'A',
      icon: 'mdi:eye',
      color: 'teal',
      min: 0,
      max: 10,
      value: '{{ 1 }}',
      supporting: 'Hi',
      tap_action: { action: 'navigate', navigation_path: '/x' },
      hold_action: { action: 'toggle' },
      double_tap_action: { action: 'url', url_path: 'https://example.com' },
    }
    expect(complicationFromForm(row, complicationToForm(row))).toEqual(row)
  })

  it('keeps the YAML-only parts of an action across an unrelated edit', () => {
    const row: ComplicationEntityConfig = {
      entity: 'sensor.a',
      tap_action: { action: 'call-service', service: 'script.x', data: { a: 1 } },
    }
    const next = complicationFromForm(row, { ...complicationToForm(row), name: 'Renamed' })
    expect(next.tap_action).toEqual({ action: 'call-service', service: 'script.x', data: { a: 1 } })
    expect(next.name).toBe('Renamed')
  })

  it('refuses a colour outside the palette and keeps the entity when the picker is cleared', () => {
    const next = complicationFromForm(
      { entity: 'sensor.a' },
      { ...complicationToForm({ entity: 'sensor.a' }), color: 'burgundy', entity: '' },
    )
    expect(next).toEqual({ entity: 'sensor.a' })
  })

  it('knows when a row should open in template mode', () => {
    expect(rowHasTemplates({ entity: 'a' })).toBe(false)
    expect(rowHasTemplates({ entity: 'a', supporting: '{{ x }}' })).toBe(true)
    expect(
      rowHasTemplates({ entity: 'a', tap_action: { action: 'url', url_path: '{{ u }}' } }),
    ).toBe(true)
  })
})

describe('historyFor', () => {
  const card = { enabled: false, hours: 24, style: 'rectangular' as const }

  it('follows the card unless the row says otherwise, with the row’s own hours first', () => {
    expect(historyFor({}, card)).toBeNull()
    expect(historyFor({}, { ...card, enabled: true })).toBe(24)
    expect(historyFor({ sparkline: true }, card)).toBe(24)
    expect(historyFor({ sparkline: false }, { ...card, enabled: true })).toBeNull()
    expect(historyFor({ sparkline: true, sparkline_hours: 6 }, card)).toBe(6)
    expect(historyFor({ sparkline: true, sparkline_hours: 99 }, card)).toBe(48)
  })

  it('never draws on a circular face, and always on the graph face unless the row says no', () => {
    expect(historyFor({ sparkline: true }, { ...card, style: 'circular' })).toBeNull()
    expect(historyFor({}, { ...card, style: 'rectangular-graph' })).toBe(24)
    expect(historyFor({ sparkline: false }, { ...card, style: 'rectangular-graph' })).toBeNull()
  })

  it('is nothing without a card context, and nothing for a reading that is not a number', () => {
    expect(historyFor({ sparkline: true }, undefined)).toBeNull()
    const hass = hassWith(state('sensor.word', 'Running'))
    const [word] = readComplications(
      hass,
      [{ entity: 'sensor.word', sparkline: true }],
      {},
      {
        sparkline: card,
      },
    )
    expect(word?.history).toBeNull()
  })
})

describe('the row panel’s overrides', () => {
  it('shows Same as the card for a row that says nothing, and writes nothing back for it', () => {
    const data = complicationToForm({ entity: 'sensor.a' })
    expect(data.sparkline).toBe(OVERRIDE_CARD)
    expect(data.countdown).toBe(OVERRIDE_CARD)
    expect(complicationFromForm({ entity: 'sensor.a' }, data)).toEqual({ entity: 'sensor.a' })
  })

  it('writes On and Off as true and false, and clamps the hours', () => {
    const next = complicationFromForm(
      { entity: 'sensor.a' },
      { entity: 'sensor.a', sparkline: 'off', countdown: 'on', sparkline_hours: 72 },
    )
    expect(next).toMatchObject({ sparkline: false, countdown: true, sparkline_hours: 48 })
  })

  it('round-trips the overrides, and keeps them when the form did not draw their rows', () => {
    const row: ComplicationEntityConfig = {
      entity: 'sensor.a',
      sparkline: true,
      sparkline_hours: 6,
      countdown: false,
    }
    expect(complicationFromForm(row, complicationToForm(row))).toEqual(row)
    expect(complicationFromForm(row, { entity: 'sensor.a' })).toEqual(row)
  })
})
