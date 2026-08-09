import type { FrontendLocaleData, HassEntity, HomeAssistant } from '../src/core/types/ha'
import { BATTERY_STATES } from './battery-devices'
import { COMPLICATION_STATES } from './complication-entities'

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
  /*
   * Two to-do lists, which `demo` does not provide at all: it has no `todo` platform, so
   * the dev Home Assistant needs the Local To-do integration adding by hand and the
   * showcase needs these.
   *
   * A to-do entity's state is its count of unfinished items, and `supported_features: 127`
   * is every `TodoListEntityFeature` (what `local_todo` reports). The card reads neither:
   * the count is not what it draws, and the flags say what can be written to a list rather
   * than what it holds. They are here because a state a real one would not have is a way to
   * find out that something is quietly reading it.
   */
  'todo.chores': entity('todo.chores', '3', {
    friendly_name: 'Chores',
    supported_features: 127,
  }),
  'todo.shopping': entity('todo.shopping', '2', {
    friendly_name: 'Shopping',
    supported_features: 127,
  }),
  // The battery card's devices, which are a list of their own; see `battery-devices.ts`,
  // where the config that points at them lives beside them.
  ...Object.fromEntries(BATTERY_STATES.map(one => [one.entity_id, one])),
  // The complication card's entities; see `complication-entities.ts`, wired in the same way.
  ...Object.fromEntries(COMPLICATION_STATES.map(one => [one.entity_id, one])),
}

/**
 * Per-calendar colours, as the entity registry holds them.
 *
 * One named token and one calendar with no entry at all, which is the pair worth having:
 * the token proves the registry lookup and its `var(--red-color)` mapping, and the
 * missing entry proves the fallback to the palette. `demo`'s real calendars have no
 * registry entry either (no unique id), so the second case is the common one.
 */
const REGISTRY_OPTIONS: Record<string, { calendar?: { color?: string } }> = {
  'calendar.calendar_1': { calendar: { color: 'red' } },
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** A local `YYYY-MM-DD`, which is the only form an all-day event takes on the wire. */
const wireDate = (offsetDays: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A timed instant, `minutes` from now. */
const wireTime = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString()

/**
 * The same instant as a local wall clock with no zone on it: `2026-07-26T10:30:00`.
 *
 * Only a `todo` list sends these: Home Assistant requires a calendar event's datetimes to
 * be aware, while a to-do's `due` is serialised as whatever the integration stored.
 */
const naiveTime = (minutes: number): string => {
  const at = new Date(Date.now() + minutes * 60_000)
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  return `${day}T${pad(at.getHours())}:${pad(at.getMinutes())}:00`
}

/**
 * Calendar events in Home Assistant's OWN wire shape, per calendar.
 *
 * Not the `CalendarItem` fixtures. This is what `demo_scenario` cannot cover: the
 * fixtures start life on the far side of the mapper, so they exercise the layout rules
 * and nothing about the mapping. These are hand-written the way the subscription sends
 * them: bare `YYYY-MM-DD` with an EXCLUSIVE end for the all-day entry, a full ISO
 * datetime for the rest, `summary` rather than `title`, and `location` absent rather
 * than empty where there is none.
 *
 * Split across the two calendars on purpose, so that picking one in the editor visibly
 * drops the other's rows. That is the whole thing the entity selector is for, and it is
 * not observable in a harness where both calendars carry the same events.
 *
 * Timed events are stamped `Z` here; Home Assistant more often sends a local offset,
 * which `new Date` reads identically. Real calendars come from `pnpm ha:up`.
 */
const WIRE_EVENTS: Record<string, () => Record<string, unknown>[]> = {
  'calendar.calendar_1': () => [
    { summary: 'Design review', start: wireTime(45), end: wireTime(105), all_day: false },
    {
      summary: 'Lunch with Anna',
      location: 'Gdańska 12, Warsawa',
      start: wireTime(180),
      end: wireTime(240),
      all_day: false,
    },
    { summary: 'Standup', start: wireTime(1_500), end: wireTime(1_530), all_day: false },
  ],
  'calendar.calendar_2': () => [
    // End is the day AFTER the one it covers: all-day ends are exclusive, and an
    // off-by-one here would either retire this a day early or leave it up a day late.
    { summary: 'Poznań trip', start: wireDate(0), end: wireDate(2), all_day: true },
    { summary: 'Dentist', start: wireTime(300), end: wireTime(360), all_day: false },
    { summary: 'Training', start: wireTime(1_700), end: wireTime(1_760), all_day: false },
  ],
}

/**
 * To-do items in Home Assistant's OWN wire shape, per list.
 *
 * Written the way `todo/item/subscribe` sends them, which is `asdict` with no dict
 * factory: every field present, the unset ones `null`, `status` spelled out, and `due`
 * either a bare `YYYY-MM-DD` or an ISO datetime. Between them the two lists cover every
 * branch of the mapper: a timed item, a dated one with no time, a naive datetime with no
 * offset on it (which is what an integration that stored a wall clock sends), a completed
 * item and an undated one. The last two must never appear on the card: one is done, and the
 * other has no day to be drawn on.
 *
 * Split across two lists for the same reason the events are: picking one in the editor has
 * to visibly drop the other's rows.
 */
const WIRE_TODOS: Record<string, () => Record<string, unknown>[]> = {
  'todo.chores': () => [
    {
      summary: 'Pick up dry cleaning',
      uid: 'chore-1',
      status: 'needs_action',
      due: wireTime(150),
      description: null,
      completed: null,
    },
    {
      summary: 'Water the plants',
      uid: 'chore-2',
      status: 'needs_action',
      due: wireDate(0),
      description: null,
      completed: null,
    },
    {
      summary: 'Renew library card',
      uid: 'chore-3',
      status: 'needs_action',
      due: wireDate(2),
      description: null,
      completed: null,
    },
    // Neither of these is drawable: the first is done, the second belongs to no day.
    {
      summary: 'Take the bins out',
      uid: 'chore-4',
      status: 'completed',
      due: wireDate(0),
      description: null,
      completed: wireTime(-60),
    },
    {
      summary: 'Sort the cellar out',
      uid: 'chore-5',
      status: 'needs_action',
      due: null,
      description: null,
      completed: null,
    },
  ],
  'todo.shopping': () => [
    {
      summary: 'Order the birthday cake',
      uid: 'shop-1',
      status: 'needs_action',
      // No offset, which `todo/item/subscribe` will happily send: a naive `datetime` goes
      // out as the wall clock it was stored as, and the browser reads it as local time.
      due: naiveTime(320),
      description: null,
      completed: null,
    },
    {
      summary: 'Buy stamps',
      uid: 'shop-2',
      status: 'needs_action',
      due: wireDate(1),
      description: null,
      completed: null,
    },
  ],
}

/**
 * The handful of Home Assistant strings our editors reuse, copied out of the `en` table
 * the frontend ships. `localize` answers `''` for anything else, which is what the real
 * one does with a key it does not have, the fallback path an editor has to survive.
 */
const TRANSLATIONS: Record<string, string> = {
  'ui.panel.lovelace.editor.card.calendar.calendar_entities': 'Calendar entities',
  'panel.todo': 'To-do lists',
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
    /*
     * No panels, and the empty object is the honest answer rather than a gap: the showcase is
     * a page with cards on it, not a Home Assistant, so there is no `/calendar` and no
     * `/todo` behind this document to send anybody to.
     *
     * A card asks before it navigates (`_open` in the calendar card), so this is also what
     * keeps a tap in the harness to its press effect instead of pushing a history entry the
     * showcase cannot serve on reload. Fill it in the day the harness grows something worth
     * navigating to.
     */
    panels: {},
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
      async subscribeMessage(callback, message) {
        console.debug('[mock-hass] subscribeMessage', message)

        // Asynchronously in both cases, because Home Assistant is: the subscribe resolves
        // first and the snapshot arrives after it, so a card that expected data from the
        // call itself would work here and nowhere else.
        if (message.type === 'calendar/event/subscribe') {
          const entityId = String(message.entity_id)
          queueMicrotask(() => callback({ events: WIRE_EVENTS[entityId]?.() ?? [] } as never))
        }

        if (message.type === 'todo/item/subscribe') {
          const entityId = String(message.entity_id)
          // `items: []` for a list nobody wrote fixtures for, never `items: null`; the real
          // handler maps over `todo_items or []`, so there is no null case to imitate.
          queueMicrotask(() => callback({ items: WIRE_TODOS[entityId]?.() ?? [] } as never))
        }

        return async () => {
          console.debug('[mock-hass] unsubscribed', message)
        }
      },
    },
    localize: key => TRANSLATIONS[key] ?? '',
    async callWS(message) {
      console.debug('[mock-hass] callWS', message)
      // Answered rather than logged away, so the colour path is exercised: the harness
      // gives one calendar a named token and leaves the other to the palette.
      if (message.type === 'config/entity_registry/get_entries') {
        const ids = Array.isArray(message.entity_ids) ? (message.entity_ids as string[]) : []
        return Object.fromEntries(
          ids.map(id => [id, id in REGISTRY_OPTIONS ? { options: REGISTRY_OPTIONS[id] } : null]),
        ) as never
      }
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
