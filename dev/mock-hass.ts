import type { FrontendLocaleData, HassEntity, HomeAssistant } from '../src/core/types/ha'

/**
 * A `hass` object good enough to develop cards against.
 *
 * It covers what the real one gives a card: entity states, the entity registry,
 * locale and timezone, the dark-mode flag, and the three ways a card fetches data
 * (`callWS`, `callService`, `callApi`) plus the websocket subscription that the
 * calendar card will use. Calls are logged rather than mocked away, so it is obvious
 * in the console when a card asks for something the harness does not answer yet.
 */

const entity = (
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity => ({
  entity_id: entityId,
  state,
  attributes,
  last_changed: '2026-07-25T06:00:00.000Z',
  last_updated: '2026-07-25T06:00:00.000Z',
})

/** Mirrors what the `demo` integration gives the dev Home Assistant instance. */
const STATES: Record<string, HassEntity> = {
  'calendar.calendar_1': entity('calendar.calendar_1', 'on', {
    friendly_name: 'Work',
    message: 'Design review',
    start_time: '2026-07-25 09:30:00',
    end_time: '2026-07-25 10:30:00',
    all_day: false,
    supported_features: 7,
  }),
  'calendar.calendar_2': entity('calendar.calendar_2', 'off', {
    friendly_name: 'Personal',
    message: 'Dentist',
    start_time: '2026-07-25 15:15:00',
    end_time: '2026-07-25 16:00:00',
    all_day: false,
    supported_features: 7,
  }),
  // Here for the battery widget that comes next.
  'sensor.phone_battery': entity('sensor.phone_battery', '72', {
    friendly_name: 'Phone',
    device_class: 'battery',
    unit_of_measurement: '%',
  }),
}

export interface MockHassOptions {
  dark: boolean
  /** Drives the 12/24-hour switch the calendar card formats against. */
  timeFormat: FrontendLocaleData['time_format']
}

export function createMockHass({ dark, timeFormat }: MockHassOptions): HomeAssistant {
  return {
    states: { ...STATES },
    entities: Object.fromEntries(
      Object.keys(STATES).map(id => [id, { entity_id: id, hidden: false }]),
    ),
    config: { time_zone: 'Europe/Warsaw', country: 'PL', version: '2026.7.4' },
    themes: { darkMode: dark, theme: 'default' },
    locale: {
      language: 'en',
      time_format: timeFormat,
      first_weekday: 'monday',
      time_zone: 'local',
    },
    language: 'en',
    connection: {
      async subscribeMessage(_callback, message) {
        console.debug('[mock-hass] subscribeMessage', message)
        return async () => {
          console.debug('[mock-hass] unsubscribed', message)
        }
      },
    },
    localize: key => key,
    async callWS(message) {
      console.debug('[mock-hass] callWS', message)
      return undefined as never
    },
    async callService(domain, service, data, target) {
      console.debug('[mock-hass] callService', `${domain}.${service}`, data, target)
    },
    async callApi(method, path) {
      console.debug('[mock-hass] callApi', method, path)
      return undefined as never
    },
  }
}
