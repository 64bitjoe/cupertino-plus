import { mdiWeatherNight, mdiWeatherNightPartlyCloudy } from '@mdi/js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import type { ForecastItem } from './source'
import { readWeather } from './model'

const weather = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({ entity_id, state, attributes, last_changed: '', last_updated: '' })

const sun = (state: 'above_horizon' | 'below_horizon'): HassEntity => ({
  entity_id: 'sun.sun',
  state,
  attributes: {},
  last_changed: '',
  last_updated: '',
})

/** A daily forecast entry: `temperature` the high, `templow` the low. */
const dailyItem = (over: Partial<ForecastItem> = {}): ForecastItem => ({
  datetime: '2026-08-09T04:00:00+00:00',
  condition: 'sunny',
  temperature: 90,
  templow: 67,
  ...over,
})

/** An hourly forecast entry: `temperature` only, never `templow` — see `source.ts`. */
const hourlyItem = (over: Partial<ForecastItem> = {}): ForecastItem => ({
  datetime: '2026-08-09T14:00:00+00:00',
  condition: 'sunny',
  temperature: 75,
  ...over,
})

/**
 * `time_zone: 'server'` plus a pinned `config.time_zone` is what makes the hour/day
 * labels below deterministic regardless of the machine actually running the suite —
 * see `displayTimeZone` in `model.ts`.
 */
const hassWith = (...states: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(states.map(s => [s.entity_id, s])),
    entities: {},
    locale: { language: 'en', time_format: '24', first_weekday: 'monday', time_zone: 'server' },
    config: { time_zone: 'UTC' },
    localize: () => '',
  }) as unknown as HomeAssistant

afterEach(() => {
  vi.useRealTimers()
})

describe('readWeather', () => {
  it('answers null for an entity missing from hass.states, rather than throwing', () => {
    const hass = hassWith()
    expect(readWeather(hass, 'weather.nope', [], [])).toBeNull()
  })

  it("reads current temperature off attributes with the entity's own unit, never an assumed one", () => {
    const hass = hassWith(
      weather('weather.home', 'sunny', {
        friendly_name: 'Home',
        temperature: 75,
        temperature_unit: '°F',
      }),
    )

    const view = readWeather(hass, 'weather.home', [], [])

    expect(view?.now.location).toBe('Home')
    // Not "75 °F", not "24°C" (a Celsius conversion nothing here should ever perform) —
    // the entity's own unit string, tight against the numeral.
    expect(view?.now.temperature).toBe('75°F')
  })

  it("reads a daily entry's temperature as the HIGH and templow as the LOW", () => {
    const hass = hassWith(
      weather('weather.home', 'sunny', { friendly_name: 'Home', temperature_unit: '°F' }),
    )
    const daily = [dailyItem({ temperature: 90, templow: 67 })]

    const view = readWeather(hass, 'weather.home', daily, [])

    expect(view?.days[0]?.high).toBe(90)
    expect(view?.days[0]?.low).toBe(67)
    expect(view?.days[0]?.highLabel).toBe('90°F')
    expect(view?.days[0]?.lowLabel).toBe('67°F')
  })

  it("takes today's high/low from the daily forecast's first entry, not from attributes", () => {
    const hass = hassWith(
      // The entity's own attributes carry no high/low at all on a real installation —
      // this asserts the view's numbers came from `daily[0]`, not from anything here.
      weather('weather.home', 'sunny', {
        friendly_name: 'Home',
        temperature: 75,
        temperature_unit: '°F',
      }),
    )
    const daily = [dailyItem({ temperature: 90, templow: 67 })]

    const view = readWeather(hass, 'weather.home', daily, [])

    expect(view?.now.high).toBe('90°F')
    expect(view?.now.low).toBe('67°F')
  })

  it('answers null high/low when there is no daily forecast yet', () => {
    const hass = hassWith(weather('weather.home', 'sunny', { temperature_unit: '°F' }))
    const view = readWeather(hass, 'weather.home', [], [])
    expect(view?.now.high).toBeNull()
    expect(view?.now.low).toBeNull()
  })

  it('reads an hourly entry as a single temperature, with no low/high pairing at all', () => {
    const hass = hassWith(weather('weather.home', 'sunny', { temperature_unit: '°F' }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T14:15:00Z'))

    const hourly = [hourlyItem({ datetime: '2026-08-09T14:00:00+00:00', temperature: 68 })]
    const view = readWeather(hass, 'weather.home', [], hourly)

    // Exactly these three keys: an hourly item never has a `low`/`high` pair to leak.
    expect(view?.hours[0]).toEqual({ label: 'Now', icon: expect.any(String), temperature: '68°F' })
  })

  it('drops past hours so the strip starts at the current hour, not at midnight', () => {
    const hass = hassWith(weather('weather.home', 'sunny', { temperature_unit: '°F' }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T14:30:00Z'))

    const hourly = [
      hourlyItem({ datetime: '2026-08-09T00:00:00+00:00', temperature: 60 }),
      hourlyItem({ datetime: '2026-08-09T11:00:00+00:00', temperature: 65 }),
      hourlyItem({ datetime: '2026-08-09T13:00:00+00:00', temperature: 70 }),
      hourlyItem({ datetime: '2026-08-09T14:00:00+00:00', temperature: 72 }),
      hourlyItem({ datetime: '2026-08-09T15:00:00+00:00', temperature: 74 }),
    ]
    const view = readWeather(hass, 'weather.home', [], hourly)

    expect(view?.hours).toHaveLength(2)
    expect(view?.hours[0]?.label).toBe('Now')
    expect(view?.hours[0]?.temperature).toBe('72°F')
    expect(view?.hours[1]?.temperature).toBe('74°F')
  })

  it('derives isNight per hour and passes it to conditionIcon: 2AM partlycloudy gets the night glyph', () => {
    const hass = hassWith(weather('weather.home', 'sunny', { temperature_unit: '°F' }))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T02:15:00Z'))

    const hourly = [
      hourlyItem({
        datetime: '2026-08-09T02:00:00+00:00',
        condition: 'partlycloudy',
        temperature: 58,
      }),
    ]
    const view = readWeather(hass, 'weather.home', [], hourly)

    expect(view?.hours[0]?.icon).toBe(mdiWeatherNightPartlyCloudy)
  })

  it("prefers sun.sun's actual position over the clock for the current-conditions icon", () => {
    // Noon by the clock — the hour-of-day fallback would call this daytime — but
    // `sun.sun` says otherwise, and it is the entity that actually knows.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00Z'))
    const hass = hassWith(
      weather('weather.home', 'sunny', { temperature_unit: '°F' }),
      sun('below_horizon'),
    )

    const view = readWeather(hass, 'weather.home', [], [])

    expect(view?.now.icon).toBe(mdiWeatherNight)
  })

  it('falls back to the hour of day for the current-conditions icon when sun.sun is absent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T02:00:00Z'))
    const hass = hassWith(weather('weather.home', 'sunny', { temperature_unit: '°F' }))

    const view = readWeather(hass, 'weather.home', [], [])

    expect(view?.now.icon).toBe(mdiWeatherNight)
  })

  it('draws, rather than drops, an entity that has gone unavailable', () => {
    const hass = hassWith(weather('weather.home', 'unavailable', {}))

    const view = readWeather(hass, 'weather.home', [], [])

    expect(view?.unavailable).toBe(true)
    expect(view?.now.temperature).toBe('—')
  })

  it('labels today\'s daily row "Today" and later rows by weekday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-09T12:00:00Z'))
    const hass = hassWith(weather('weather.home', 'sunny', { temperature_unit: '°F' }))

    const daily = [
      dailyItem({ datetime: '2026-08-09T04:00:00+00:00' }),
      dailyItem({ datetime: '2026-08-10T04:00:00+00:00' }),
      dailyItem({ datetime: '2026-08-11T04:00:00+00:00' }),
    ]
    const view = readWeather(hass, 'weather.home', daily, [])

    expect(view?.days[0]?.label).toBe('Today')
    expect(view?.days[1]?.label).toBe('Mon')
    expect(view?.days[2]?.label).toBe('Tue')
  })
})
