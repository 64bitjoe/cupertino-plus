/**
 * TEMPORARY — goes away with the websocket subscription.
 *
 * Hand-built days that exercise every branch of the layout: an empty today, a skipped
 * empty tomorrow, locations that fit and locations that do not, reminders mixed into
 * the same stream as events, an all-day entry, and a tail that runs out of column.
 *
 * Times for *today* are anchored to the current clock rather than written out, so the
 * card still has something to show at four in the afternoon. Later days use plain
 * clock times — nothing filters them out.
 */

import type { CalendarItem } from './model'

const WORK = 'var(--cw-orange)'
const HOME = 'var(--cw-blue)'
const SPORT = 'var(--cw-green)'
const LIST = 'var(--cw-purple)'

const HOUR = 3_600_000

/** Local midnight `offset` days from now. */
const midnight = (now: Date, offset: number): Date => {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

/** A clock time on a later day. */
const on = (now: Date, offset: number, hours: number, minutes = 0): Date => {
  const date = midnight(now, offset)
  date.setHours(hours, minutes, 0, 0)
  return date
}

/** `now` rounded up to the next half hour — the anchor for everything happening today. */
const soon = (now: Date): Date => {
  const date = new Date(now)
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() > 30 ? 60 : 30)
  return date
}

const after = (base: Date, hours: number): Date => new Date(base.getTime() + hours * HOUR)

type Draft = Omit<CalendarItem, 'id'>

const withIds = (scenario: string, drafts: Draft[]): CalendarItem[] =>
  drafts.map((draft, index) => ({ id: `${scenario}-${index}`, ...draft }))

/**
 * The days after today, shared by most scenarios. `offset` is which day they land on:
 * 1 gives the `TOMORROW` heading, 2 leaves tomorrow empty so it gets skipped and the
 * heading falls back to a date.
 */
const laterDays = (now: Date, offset = 1): Draft[] => [
  {
    kind: 'event',
    title: 'Market run',
    location: 'Hala Targowa, Piaskowa 17',
    start: on(now, offset, 10),
    end: on(now, offset, 12),
    color: HOME,
  },
  {
    kind: 'event',
    title: 'Coffee with Marta',
    start: on(now, offset, 13),
    end: on(now, offset, 14),
    color: HOME,
  },
  {
    kind: 'event',
    title: 'Training',
    start: on(now, offset, 18, 15),
    end: on(now, offset, 19, 15),
    color: SPORT,
  },
  { kind: 'reminder', title: 'Renew passport', start: on(now, offset + 2, 9), color: LIST },
]

const scenarios: Record<string, (now: Date) => Draft[]> = {
  /** Three today, the third of them pushed into the right column. */
  default: now => {
    const base = soon(now)
    return [
      { kind: 'event', title: 'Design review', start: base, end: after(base, 1), color: WORK },
      {
        kind: 'event',
        title: 'Lunch with Anna',
        location: 'City Fit, Kruszwicka 1',
        start: after(base, 2),
        end: after(base, 3),
        color: HOME,
      },
      { kind: 'event', title: 'Dentist', start: after(base, 4), end: after(base, 5), color: HOME },
      ...laterDays(now),
    ]
  },

  /** `No Events Today` on the left, the flow starting on the right. */
  'today-empty': now => laterDays(now),

  /** One event, so its location fits even in the small size. */
  'one-event': now => {
    const base = soon(now)
    return [
      {
        kind: 'event',
        title: 'Test',
        location: 'Długa 36, Poznań',
        start: base,
        end: after(base, 1),
        color: WORK,
      },
      ...laterDays(now),
    ]
  },

  /** Two events: the small size shows neither location, the medium shows the first. */
  'two-events': now => {
    const base = soon(now)
    return [
      {
        kind: 'event',
        title: 'Test',
        location: 'Długa 36, Poznań',
        start: base,
        end: after(base, 1),
        color: WORK,
      },
      { kind: 'event', title: 'Test 1', start: after(base, 2), end: after(base, 3), color: WORK },
      ...laterDays(now),
    ]
  },

  /** Three plain events: the left column takes two, the third flows right. */
  'three-events': now => {
    const base = soon(now)
    return [
      { kind: 'event', title: 'Test', start: base, end: after(base, 1), color: WORK },
      { kind: 'event', title: 'Test 1', start: after(base, 2), end: after(base, 3), color: WORK },
      { kind: 'event', title: 'Test 2', start: after(base, 4), end: after(base, 5), color: WORK },
      ...laterDays(now),
    ]
  },

  /**
   * `2 more events`, laid out exactly as the reference screenshot has it: two greedy
   * locations today spend the left column and most of the right one, so tomorrow gets a
   * heading, its reminder, and one row left over to admit what is missing.
   */
  'more-events': now => {
    const base = soon(now)
    return [
      {
        kind: 'event',
        title: 'Test',
        location: 'Długa 36, Poznań',
        start: base,
        end: after(base, 1),
        color: WORK,
      },
      {
        kind: 'event',
        title: 'Test 1',
        location: 'Dworzec PKP',
        start: after(base, 2),
        end: after(base, 3),
        color: WORK,
      },
      { kind: 'reminder', title: 'Weigh in', start: on(now, 1, 10, 30), color: LIST },
      { kind: 'event', title: 'Lessons', start: on(now, 1, 12), end: on(now, 1, 13), color: WORK },
      {
        kind: 'event',
        title: 'Training',
        start: on(now, 1, 18, 15),
        end: on(now, 1, 19, 15),
        color: SPORT,
      },
    ]
  },

  /** Reminders and events in one stream, ordered by time rather than by kind. */
  reminders: now => {
    const base = soon(now)
    return [
      { kind: 'reminder', title: 'Weigh in', start: base, color: LIST },
      { kind: 'event', title: 'Lessons', start: after(base, 2), end: after(base, 3), color: WORK },
      { kind: 'reminder', title: 'Water the plants', start: after(base, 5), color: LIST },
      ...laterDays(now),
    ]
  },

  /**
   * All-day entries: first in the day, one row, no time — and the reference screenshot
   * for what that one row buys. Medium fits the whole flow, `1 + 3` beside `1 + 2+2+2`.
   * Small gets `1 + 2` with a row left over, which goes on the location: two items and a
   * location, which two timed events could never have managed.
   */
  'all-day': now => {
    const base = soon(now)
    return [
      { kind: 'event', title: 'All day test', allDay: true, start: midnight(now, 0), color: WORK },
      {
        kind: 'event',
        title: 'Test',
        location: 'Bydgoszcz Główna',
        start: base,
        end: after(base, 1),
        color: WORK,
      },
      { kind: 'reminder', title: 'Weigh in', start: on(now, 1, 10, 30), color: LIST },
      { kind: 'event', title: 'Lessons', start: on(now, 1, 12), end: on(now, 1, 13), color: WORK },
      {
        kind: 'event',
        title: 'Training',
        start: on(now, 1, 18, 15),
        end: on(now, 1, 19, 15),
        color: SPORT,
      },
    ]
  },

  /** An all-day entry sharing a busy day, so the tail indicator has to work around it. */
  'all-day-busy': now => {
    const base = soon(now)
    return [
      { kind: 'event', title: 'Kraków trip', allDay: true, start: midnight(now, 0), color: HOME },
      { kind: 'event', title: 'Standup', start: base, end: after(base, 1), color: WORK },
      { kind: 'event', title: 'Retro', start: after(base, 3), end: after(base, 4), color: WORK },
      ...laterDays(now),
    ]
  },

  /** Tomorrow is empty, so it is skipped and the next heading is a date, not `TOMORROW`. */
  'skip-empty-day': now => {
    const base = soon(now)
    return [
      { kind: 'event', title: 'Design review', start: base, end: after(base, 1), color: WORK },
      ...laterDays(now, 2),
    ]
  },

  /** Nothing at all, anywhere. */
  empty: () => [],
}

export const DEMO_SCENARIOS = Object.keys(scenarios)
export const DEFAULT_DEMO_SCENARIO = 'default'

export const demoItems = (scenario: string, now: Date): CalendarItem[] => {
  const build = scenarios[scenario] ?? scenarios[DEFAULT_DEMO_SCENARIO]
  return withIds(scenario, build ? build(now) : [])
}
