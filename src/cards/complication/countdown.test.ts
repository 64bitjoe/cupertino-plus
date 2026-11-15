import { describe, expect, it } from 'vitest'

import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import {
  countdownFor,
  countdownText,
  formatRemaining,
  formatTarget,
  nextTickIn,
  nextTimeOfDay,
  parseDuration,
  parseLocal,
  shortRemaining,
  spokenRemaining,
} from './countdown'
import { readComplications } from './model'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** Local noon, so the tests read the same in any zone the suite runs in. */
const NOW = new Date(2026, 10, 14, 12, 0, 0).getTime()
const iso = (ms: number): string => new Date(ms).toISOString()

const state = (
  entity_id: string,
  value: string,
  attributes: Record<string, unknown> = {},
  lastChanged = iso(NOW - HOUR),
): HassEntity => ({
  entity_id,
  state: value,
  attributes,
  last_changed: lastChanged,
  last_updated: lastChanged,
})

describe('parsing', () => {
  it('reads a timer duration in either of its two shapes', () => {
    expect(parseDuration('0:10:00')).toBe(10 * MINUTE)
    expect(parseDuration('1:02:03')).toBe(HOUR + 2 * MINUTE + 3000)
    expect(parseDuration('05:30')).toBe(5 * MINUTE + 30_000)
    expect(parseDuration('soon')).toBeNull()
    expect(parseDuration(undefined)).toBeNull()
  })

  it('reads a Home Assistant local date-time in the local zone, and ISO as written', () => {
    expect(parseLocal('2026-11-14 12:30:00')).toBe(NOW + 30 * MINUTE)
    expect(parseLocal('2026-11-15')).toBe(new Date(2026, 10, 15).getTime())
    expect(parseLocal('2026-11-14T10:00:00Z')).toBe(Date.parse('2026-11-14T10:00:00Z'))
    expect(parseLocal('whenever')).toBeNull()
  })

  it('takes a bare time as its next occurrence', () => {
    expect(nextTimeOfDay('13:00:00', NOW)).toBe(NOW + HOUR)
    expect(nextTimeOfDay('07:00', NOW)).toBe(NOW + 19 * HOUR)
    expect(nextTimeOfDay('noonish', NOW)).toBeNull()
  })
})

describe('countdownFor, timers', () => {
  it('runs an active timer to finishes_at and drains over its duration', () => {
    const timer = state('timer.tea', 'active', {
      duration: '0:04:00',
      remaining: '0:04:00',
      finishes_at: iso(NOW + MINUTE),
    })
    const countdown = countdownFor(timer, NOW)
    expect(countdown?.phase).toBe('running')
    expect(countdown?.remaining).toBe(MINUTE)
    expect(countdown?.fraction).toBe(0.25)
  })

  it('falls back to last_changed plus remaining when finishes_at is missing', () => {
    const timer = state(
      'timer.tea',
      'active',
      { duration: '0:10:00', remaining: '0:10:00' },
      iso(NOW - 4 * MINUTE),
    )
    expect(countdownFor(timer, NOW)?.remaining).toBe(6 * MINUTE)
  })

  it('holds a paused timer where it stopped, and an idle one full', () => {
    const paused = countdownFor(
      state('timer.tea', 'paused', { duration: '0:10:00', remaining: '0:02:30' }),
      NOW,
    )
    expect(paused).toMatchObject({ phase: 'paused', target: null, remaining: 150_000 })
    expect(paused?.fraction).toBe(0.25)

    const idle = countdownFor(state('timer.tea', 'idle', { duration: '0:10:00' }), NOW)
    expect(idle).toMatchObject({ phase: 'idle', remaining: 10 * MINUTE, fraction: 1 })
  })

  it('reads as done once the moment has passed', () => {
    const timer = state('timer.tea', 'active', {
      duration: '0:01:00',
      finishes_at: iso(NOW - 1000),
    })
    expect(countdownFor(timer, NOW)).toMatchObject({ phase: 'done', remaining: 0, fraction: 0 })
  })
})

describe('countdownFor, moments', () => {
  it('drains a timestamp sensor over the time since it was set', () => {
    const finish = state(
      'sensor.dishwasher_end',
      iso(NOW + HOUR),
      { device_class: 'timestamp' },
      iso(NOW - HOUR),
    )
    const countdown = countdownFor(finish, NOW)
    expect(countdown?.remaining).toBe(HOUR)
    expect(countdown?.fraction).toBe(0.5)
  })

  it('drains over the card’s window instead, when it sets one', () => {
    const finish = state('sensor.end', iso(NOW + HOUR), { device_class: 'timestamp' })
    expect(countdownFor(finish, NOW, 4)?.fraction).toBe(0.25)
  })

  it('offers no ring when there is no honest span to drain over', () => {
    const finish = state(
      'sensor.end',
      iso(NOW + HOUR),
      { device_class: 'timestamp' },
      iso(NOW + 2 * HOUR),
    )
    expect(countdownFor(finish, NOW)).toMatchObject({ total: null, fraction: null })
  })

  it('reads an input_datetime with a date, and the next occurrence of a bare time', () => {
    const both = state('input_datetime.leave', '2026-11-14 14:00:00', {
      has_date: true,
      has_time: true,
    })
    expect(countdownFor(both, NOW)?.remaining).toBe(2 * HOUR)

    const time = state('input_datetime.alarm', '06:00:00', { has_date: false, has_time: true })
    const alarm = countdownFor(time, NOW)
    expect(alarm?.remaining).toBe(18 * HOUR)
    expect(alarm?.fraction).toBe(0.75)
  })

  it('counts to a calendar’s next event, and to its end while it is on', () => {
    const next = state('calendar.work', 'off', {
      message: 'Design review',
      start_time: '2026-11-14 12:30:00',
      end_time: '2026-11-14 13:30:00',
    })
    expect(countdownFor(next, NOW)).toMatchObject({
      phase: 'running',
      remaining: 30 * MINUTE,
      title: 'Design review',
    })

    const on = state('calendar.work', 'on', {
      message: 'Stand-up',
      start_time: '2026-11-14 11:45:00',
      end_time: '2026-11-14 12:15:00',
    })
    expect(countdownFor(on, NOW)).toMatchObject({ phase: 'now', remaining: 15 * MINUTE })
    expect(countdownFor(on, NOW)?.fraction).toBe(0.5)
  })

  it('answers nothing for an entity with no moment in it', () => {
    expect(
      countdownFor(state('sensor.temp', '21', { device_class: 'temperature' }), NOW),
    ).toBeNull()
    expect(countdownFor(state('calendar.empty', 'off'), NOW)).toBeNull()
    expect(countdownFor(state('timer.broken', 'active'), NOW)).toBeNull()
  })
})

describe('formatting', () => {
  it('prints minutes and seconds under an hour, rounding up as a timer does', () => {
    expect(formatRemaining(60_000)).toBe('1:00')
    expect(formatRemaining(59_001)).toBe('1:00')
    expect(formatRemaining(59_000)).toBe('0:59')
    expect(formatRemaining(0)).toBe('0:00')
    expect(formatRemaining(-5)).toBe('0:00')
    expect(formatRemaining(HOUR - 1000)).toBe('59:59')
  })

  it('prints hours and minutes under a day, and days and hours past it', () => {
    expect(formatRemaining(HOUR)).toBe('1h 00m')
    expect(formatRemaining(4 * HOUR + 4 * MINUTE + 30_000)).toBe('4h 05m')
    expect(formatRemaining(26 * HOUR)).toBe('1d 2h')
  })

  it('says it in words for VoiceOver', () => {
    expect(spokenRemaining(1000)).toBe('1 second')
    expect(spokenRemaining(12 * MINUTE + 5000)).toBe('12 minutes 5 seconds')
    expect(spokenRemaining(2 * HOUR)).toBe('2 hours')
    expect(spokenRemaining(25 * HOUR + MINUTE)).toBe('1 day 2 hours')
  })

  it('names the moment by time today, by weekday this week, and by date past that', () => {
    expect(formatTarget(NOW + HOUR, NOW, 'en-GB', false)).toBe('at 13:00')
    expect(formatTarget(NOW + 24 * HOUR, NOW, 'en-GB', false)).toBe('Sun 12:00')
    expect(formatTarget(NOW + 10 * 24 * HOUR, NOW, 'en-GB', false)).toBe('24 Nov')
  })
})

describe('nextTickIn', () => {
  const running = (remaining: number) =>
    ({
      phase: 'running',
      target: NOW + remaining,
      remaining,
      total: null,
      fraction: null,
      title: null,
    }) as const

  it('wakes on the next second under an hour, and the next minute above it', () => {
    expect(nextTickIn(running(10_500))).toBe(505)
    expect(nextTickIn(running(2 * HOUR + 30_000))).toBe(30_005)
  })

  it('does not wake for a countdown that is not moving', () => {
    expect(nextTickIn({ ...running(5000), phase: 'paused' })).toBeNull()
    expect(nextTickIn(running(0))).toBeNull()
  })

  it('words every phase', () => {
    expect(countdownText({ ...running(0), phase: 'done' }).phase).toBe('Finished')
    expect(countdownText(running(90_000))).toEqual({
      value: '1:30',
      spoken: '1 minute 30 seconds left',
      phase: null,
    })
  })
})

describe('readComplications, counting down', () => {
  const hass = (states: HassEntity[]): HomeAssistant =>
    ({
      states: Object.fromEntries(states.map(s => [s.entity_id, s])),
      entities: {},
      locale: { language: 'en-GB', time_format: '24', first_weekday: 'monday' },
      localize: () => '',
    }) as unknown as HomeAssistant

  const tea = state('timer.tea', 'active', {
    friendly_name: 'Tea',
    duration: '0:04:00',
    finishes_at: iso(NOW + MINUTE),
  })

  it('leaves every entity as it was with the switch off', () => {
    const [item] = readComplications(hass([tea]), ['timer.tea'], {}, { now: NOW })
    expect(item?.countdown).toBeNull()
    expect(item?.value).toBe('Active')
  })

  it('prints the time left and drains the gauge with the switch on', () => {
    const [item] = readComplications(
      hass([tea]),
      ['timer.tea'],
      {},
      { now: NOW, countdown: {}, locale: 'en-GB', hour12: false },
    )
    expect(item?.value).toBe('1:00')
    expect(item?.fraction).toBe(0.25)
    expect(item?.countdown).toEqual({
      phase: 'running',
      ticking: true,
      nextTick: 1005,
      spoken: '1 minute left',
      short: { main: '1:00', unit: null },
    })
    expect(item?.supporting).toBe('at 12:01')
  })

  it('leaves an entity with no moment in it alone, even with the switch on', () => {
    const temp = state('sensor.t', '21', { device_class: 'temperature', unit_of_measurement: '°C' })
    const [item] = readComplications(hass([temp]), ['sensor.t'], {}, { now: NOW, countdown: {} })
    expect(item?.countdown).toBeNull()
    expect(item?.value).toBe('21°C')
  })

  it('lets a reading template and a supporting line override the countdown’s words', () => {
    const [item] = readComplications(
      hass([tea]),
      [{ entity: 'timer.tea', value: 'Brewing', supporting: 'Earl Grey' }],
      {},
      { now: NOW, countdown: {} },
    )
    expect(item?.value).toBe('Brewing')
    expect(item?.supporting).toBe('Earl Grey')
    expect(item?.fraction).toBe(0.25)
  })

  it('titles a calendar countdown with its event', () => {
    const work = state('calendar.work', 'on', {
      message: 'Stand-up',
      start_time: '2026-11-14 11:45:00',
      end_time: '2026-11-14 12:15:00',
    })
    const [item] = readComplications(
      hass([work]),
      ['calendar.work'],
      {},
      { now: NOW, countdown: {} },
    )
    expect(item?.supporting).toBe('Now · Stand-up')
  })

  it('tints and glyphs a countdown after its Apple counterpart when the entity says nothing', () => {
    const plain = state('timer.plain', 'idle', { duration: '0:01:00' })
    const work = state('calendar.work', 'off', { start_time: '2026-11-14 13:00:00' })
    const [timer, event] = readComplications(
      hass([plain, work]),
      ['timer.plain', 'calendar.work'],
      {},
      { now: NOW, countdown: {} },
    )
    expect(timer).toMatchObject({ tint: 'orange', icon: 'mdi:timer-outline' })
    expect(event).toMatchObject({ tint: 'red', icon: 'mdi:calendar' })
    const [coloured] = readComplications(
      hass([plain]),
      [{ entity: 'timer.plain', color: 'teal', icon: 'mdi:tea' }],
      {},
      { now: NOW, countdown: {} },
    )
    expect(coloured).toMatchObject({ tint: 'teal', icon: 'mdi:tea' })
  })
})

describe('shortRemaining', () => {
  it('sets the time as a ring prints it: the number, its unit on a line of its own', () => {
    expect(shortRemaining(12 * MINUTE + 5000)).toEqual({ main: '12:05', unit: null })
    expect(shortRemaining(4 * HOUR + 17 * MINUTE + 1000)).toEqual({ main: '4:18', unit: 'HR' })
    expect(shortRemaining(26 * HOUR)).toEqual({ main: '1', unit: 'DAY' })
    expect(shortRemaining(60 * HOUR)).toEqual({ main: '3', unit: 'DAYS' })
  })
})

describe('a row’s own countdown', () => {
  const hass = (states: HassEntity[]): HomeAssistant =>
    ({
      states: Object.fromEntries(states.map(s => [s.entity_id, s])),
      entities: {},
      locale: { language: 'en-GB', time_format: '24', first_weekday: 'monday' },
      localize: () => '',
    }) as unknown as HomeAssistant
  const tea = state('timer.tea', 'idle', { duration: '0:04:00' })

  it('turns a countdown on that the card leaves off, and off that the card turns on', () => {
    const [on] = readComplications(
      hass([tea]),
      [{ entity: 'timer.tea', countdown: true }],
      {},
      { now: NOW, countdown: { enabled: false } },
    )
    expect(on?.countdown?.phase).toBe('idle')
    const [off] = readComplications(
      hass([tea]),
      [{ entity: 'timer.tea', countdown: false }],
      {},
      { now: NOW, countdown: { enabled: true } },
    )
    expect(off?.countdown).toBeNull()
  })

  it('gives a ring its short form, unless a reading template has taken the value', () => {
    const [plain] = readComplications(hass([tea]), ['timer.tea'], {}, { now: NOW, countdown: {} })
    expect(plain?.countdown?.short).toEqual({ main: '4:00', unit: null })
    const [templated] = readComplications(
      hass([tea]),
      [{ entity: 'timer.tea', value: 'Steeping' }],
      {},
      { now: NOW, countdown: {} },
    )
    expect(templated?.countdown?.short).toBeNull()
  })
})

describe('time zones', () => {
  // Fixed instants, so these read the same whatever zone the suite runs in.
  const UTC_NOON = Date.parse('2026-11-14T12:00:00Z')

  it('reads a naive date-time as a wall clock in the server’s zone', () => {
    // Tokyo is UTC+9 all year, New York UTC-5 in November.
    expect(parseLocal('2026-11-14 21:30:00', 'Asia/Tokyo')).toBe(Date.parse('2026-11-14T12:30:00Z'))
    expect(parseLocal('2026-11-14 07:30:00', 'America/New_York')).toBe(
      Date.parse('2026-11-14T12:30:00Z'),
    )
    expect(parseLocal('2026-11-15', 'Asia/Tokyo')).toBe(Date.parse('2026-11-14T15:00:00Z'))
    // An offset on the string wins over any zone.
    expect(parseLocal('2026-11-14T10:00:00Z', 'Asia/Tokyo')).toBe(
      Date.parse('2026-11-14T10:00:00Z'),
    )
  })

  it('crosses a DST change to the right side of it', () => {
    // New York falls back on 1 November 2026: 09:00 is EST (UTC-5) after, EDT (UTC-4) before.
    expect(parseLocal('2026-11-02 09:00:00', 'America/New_York')).toBe(
      Date.parse('2026-11-02T14:00:00Z'),
    )
    expect(parseLocal('2026-10-31 09:00:00', 'America/New_York')).toBe(
      Date.parse('2026-10-31T13:00:00Z'),
    )
  })

  it('falls back to the browser’s zone for a zone Intl does not know', () => {
    expect(parseLocal('2026-11-14 12:30:00', 'Mars/Olympus_Mons')).toBe(
      parseLocal('2026-11-14 12:30:00'),
    )
  })

  it('finds the next time of day on the server’s clock, today or tomorrow', () => {
    // 12:00 UTC is 21:00 in Tokyo: 22:00 is an hour away, 07:00 is tomorrow morning there.
    expect(nextTimeOfDay('22:00', UTC_NOON, 'Asia/Tokyo')).toBe(UTC_NOON + HOUR)
    expect(nextTimeOfDay('07:00', UTC_NOON, 'Asia/Tokyo')).toBe(UTC_NOON + 10 * HOUR)
    // An alarm across New York's fall-back is still at 07:00 on the wall: 25 hours, not 24.
    const sat = Date.parse('2026-10-31T11:30:00Z') // 07:30 EDT
    expect(nextTimeOfDay('07:00', sat, 'America/New_York')).toBe(Date.parse('2026-11-01T12:00:00Z'))
  })

  it('counts an input_datetime and a calendar down in the server’s zone', () => {
    const leave = state('input_datetime.leave', '2026-11-14 23:00:00', {
      has_date: true,
      has_time: true,
    })
    expect(countdownFor(leave, UTC_NOON, undefined, 'Asia/Tokyo')?.remaining).toBe(2 * HOUR)
    const alarm = state('input_datetime.alarm', '22:00:00', { has_date: false, has_time: true })
    expect(countdownFor(alarm, UTC_NOON, undefined, 'Asia/Tokyo')?.remaining).toBe(HOUR)
    const next = state('calendar.work', 'off', {
      start_time: '2026-11-14 21:30:00',
      end_time: '2026-11-14 22:30:00',
    })
    expect(countdownFor(next, UTC_NOON, undefined, 'Asia/Tokyo')?.remaining).toBe(30 * MINUTE)
  })

  it('prints the moment in the display zone, and "today" is today there', () => {
    expect(formatTarget(UTC_NOON + HOUR, UTC_NOON, 'en-GB', false, 'UTC')).toBe('at 13:00')
    expect(formatTarget(UTC_NOON + HOUR, UTC_NOON, 'en-GB', false, 'Asia/Tokyo')).toBe('at 22:00')
    // Past Tokyo's midnight: tomorrow there, though still today in UTC.
    expect(formatTarget(UTC_NOON + 3 * HOUR, UTC_NOON, 'en-GB', false, 'Asia/Tokyo')).toMatch(
      /^Sun /,
    )
    expect(formatTarget(UTC_NOON + 3 * HOUR, UTC_NOON, 'en-GB', false, 'UTC')).toBe('at 15:00')
    expect(formatTarget(UTC_NOON + 13 * HOUR, UTC_NOON, 'en-GB', false, 'Asia/Tokyo')).toBe(
      'Sun 10:00',
    )
    expect(formatTarget(UTC_NOON + 3 * HOUR, UTC_NOON, 'en-US', true, 'UTC')).toBe('at 3:00 PM')
  })

  it('reaches the countdown through readComplications', () => {
    const leave = state('input_datetime.leave', '2026-11-14 23:00:00', {
      has_date: true,
      has_time: true,
    })
    const [item] = readComplications(
      { states: { [leave.entity_id]: leave } } as unknown as HomeAssistant,
      [leave.entity_id],
      {},
      {
        now: UTC_NOON,
        countdown: {},
        locale: 'en-GB',
        hour12: false,
        serverZone: 'Asia/Tokyo',
        displayZone: 'Asia/Tokyo',
      },
    )
    expect(item?.value).toBe('2h 00m')
    expect(item?.supporting).toBe('at 23:00')
  })
})
