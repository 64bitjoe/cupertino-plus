import { describe, expect, it, vi } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import { subscribeForecast, supportsForecast } from './source'

const entity = (supported: number): HassEntity => ({
  entity_id: 'weather.test',
  state: 'sunny',
  attributes: { supported_features: supported },
  last_changed: '',
  last_updated: '',
})

describe('supportsForecast', () => {
  /**
   * The bitmask, read off a real installation: 1 daily, 2 hourly, 4 twice-daily. An entity
   * asked for a forecast it does not publish never answers, so the card would sit on an
   * empty strip forever rather than fall back — hence asking first.
   */
  it('reads the bitmask rather than assuming', () => {
    expect(supportsForecast(entity(7), 'daily')).toBe(true)
    expect(supportsForecast(entity(7), 'hourly')).toBe(true)
    expect(supportsForecast(entity(1), 'daily')).toBe(true)
    expect(supportsForecast(entity(1), 'hourly')).toBe(false)
    expect(supportsForecast(entity(2), 'daily')).toBe(false)
    expect(supportsForecast(entity(4), 'daily')).toBe(false)
  })

  it('treats a missing bitmask as supporting nothing', () => {
    const bare = { ...entity(0), attributes: {} }
    expect(supportsForecast(bare, 'daily')).toBe(false)
  })
})

describe('subscribeForecast', () => {
  it('asks for the right message and hands the forecast on', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined)
    const subscribeMessage = vi.fn().mockImplementation((callback: (m: unknown) => void) => {
      callback({
        type: 'daily',
        forecast: [
          {
            datetime: '2026-08-09T04:00:00+00:00',
            condition: 'sunny',
            temperature: 90,
            templow: 67,
          },
        ],
      })
      return Promise.resolve(unsubscribe)
    })
    const hass = { connection: { subscribeMessage } } as unknown as HomeAssistant

    const seen: unknown[] = []
    const stop = await subscribeForecast(hass, 'weather.test', 'daily', f => seen.push(f))

    expect(subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'weather/subscribe_forecast',
      forecast_type: 'daily',
      entity_id: 'weather.test',
    })
    expect(seen).toHaveLength(1)

    await stop()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
