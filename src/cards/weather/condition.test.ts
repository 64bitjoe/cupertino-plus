import { describe, expect, it } from 'vitest'
import {
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherNightPartlyCloudy,
  mdiWeatherSunny,
  mdiAlertCircleOutline,
} from '@mdi/js'

import { conditionIcon, conditionLabel } from './condition'

describe('conditionIcon', () => {
  it('maps the conditions Home Assistant actually emits', () => {
    expect(conditionIcon('sunny')).toBe(mdiWeatherSunny)
    expect(conditionIcon('clear-night')).toBe(mdiWeatherNight)
    expect(conditionIcon('partlycloudy')).toBe(mdiWeatherPartlyCloudy)
  })

  /**
   * `clear-night` is the only condition Home Assistant makes night-specific. Every other
   * one is emitted the same by day and by night, so the card supplies the distinction the
   * data does not: a partly cloudy midnight gets the moon behind its cloud.
   */
  it('swaps in the night glyph where one exists and it is dark', () => {
    expect(conditionIcon('partlycloudy', true)).toBe(mdiWeatherNightPartlyCloudy)
    expect(conditionIcon('sunny', true)).toBe(mdiWeatherNight)
    expect(conditionIcon('rainy', true)).toBe(conditionIcon('rainy', false))
  })

  it('answers something for a condition it does not know, rather than nothing', () => {
    expect(conditionIcon('invented-by-an-integration')).toBe(mdiAlertCircleOutline)
  })
})

describe('conditionLabel', () => {
  it('reads as English rather than as an enum', () => {
    expect(conditionLabel('partlycloudy')).toBe('Partly Cloudy')
    expect(conditionLabel('clear-night')).toBe('Clear')
    expect(conditionLabel('lightning-rainy')).toBe('Thunderstorms')
  })

  it('falls back to the raw value made readable', () => {
    expect(conditionLabel('some_new_thing')).toBe('Some new thing')
  })
})
