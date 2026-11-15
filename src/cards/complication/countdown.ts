/**
 * Time remaining, the Timer complication's way: a number that counts down and a ring that
 * drains with it.
 *
 * Pure, with `now` an argument, so every branch is a node test and the card owns the clock.
 * Four kinds of entity hold a moment worth counting down to:
 *
 *  - **`timer.*`** — `finishes_at` while active, `remaining` while paused, `duration` always.
 *    The one kind that knows its own length, so its ring drains over exactly that.
 *  - **a `timestamp` sensor** — the state is the moment (a dishwasher's end, the next alarm).
 *  - **`input_datetime`** — a date, a time, or both; a bare time means its next occurrence.
 *  - **`calendar.*`** — the next event's `start_time`, or while one is on, its `end_time`.
 *
 * ## What the ring drains over
 *
 * Only a timer knows its length. For the rest the ring drains over `countdown_hours` when the
 * card sets one, and otherwise over the time since the entity last changed — which for a
 * dishwasher's finish time or an alarm is the moment it was set, so the ring starts full when
 * the countdown starts, as a timer's does. A bare time of day has no such moment, so it drains
 * over the day before it.
 */

import {
  clamp01,
  dateFormat,
  DAY,
  HOUR,
  MINUTE,
  minutesSeconds,
  parseDuration as parseClockDuration,
  plural,
  SECOND,
  secondsLeft,
} from '../../core/duration'
import type { HassEntity } from '../../core/types/ha'

/** Where a countdown is. `now` is a calendar event already under way. */
export type CountdownPhase = 'running' | 'paused' | 'idle' | 'done' | 'now'

export interface Countdown {
  phase: CountdownPhase
  /** The moment it runs to, epoch ms; `null` for a paused or idle timer, which has none. */
  target: number | null
  /** Never negative. */
  remaining: number
  /** The span the ring drains over, or `null` when there is no honest one. */
  total: number | null
  /** `remaining / total`, 0–1; `null` with no total. */
  fraction: number | null
  /** A calendar event's title, the one countdown with something to say about itself. */
  title: string | null
}

/** Whether the countdown moves on its own, and so needs the clock. */
export const isTicking = (countdown: Countdown): boolean =>
  countdown.phase === 'running' || countdown.phase === 'now'

/**
 * `H:MM:SS` or `M:SS`, as a timer's `duration` and `remaining` attributes write it: two parts
 * are minutes and seconds here (see `ClockPair`).
 */
export const parseDuration = (value: unknown): number | null =>
  typeof value === 'string' ? (parseClockDuration(value, 'minutes-seconds') ?? null) : null

// ---- Time zones ------------------------------------------------------------------
//
// A naive date-time from Home Assistant — an `input_datetime`'s state, a calendar's
// `start_time` — is a wall clock in the SERVER's zone (`hass.config.time_zone`), not the
// browser's: a dashboard opened on a laptop abroad still means the alarm at 07:00 at home.
// `Intl` maps an instant to a wall clock in any zone but never back, so the inverse is found by
// guessing and correcting, the calendar card's `dayStart` technique. No zone means the browser's,
// which is what every caller that has none (the tests, an older core) always got.

/** A zone `Intl` accepts, or `undefined` (the browser's) for one it does not, or none. */
const ZONES = new Map<string, boolean>()
export const usableZone = (timeZone: string | null | undefined): string | undefined => {
  if (!timeZone) return undefined
  let ok = ZONES.get(timeZone)
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone })
      ok = true
    } catch {
      ok = false
    }
    ZONES.set(timeZone, ok)
  }
  return ok ? timeZone : undefined
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** What the clock on the wall reads at `instant` in `timeZone` (the browser's when absent). */
const wallClock = (instant: number, timeZone?: string): WallClock => {
  const out: WallClock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 }
  const parts = dateFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    // `h23`, not `hour12: false`, which prints midnight as 24 in some engines.
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(instant)
  for (const part of parts) {
    if (part.type in out) out[part.type as keyof WallClock] = Number(part.value)
  }
  return out
}

/** How far ahead of UTC `timeZone` is at `instant`, in ms. */
const zoneOffset = (instant: number, timeZone: string): number => {
  const whole = Math.floor(instant / SECOND) * SECOND
  const c = wallClock(whole, timeZone)
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - whole
}

/**
 * The instant a wall clock reads `y-mo-d h:mi:s` in `timeZone`, or in the browser's zone when
 * there is none. A guess and one correction: the guess can land across a DST change from the
 * answer, where the offset it assumed no longer holds, and the correction re-reads it there.
 */
export const zonedTime = (
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone?: string,
): number => {
  if (!timeZone) return new Date(y, mo - 1, d, h, mi, s).getTime()
  const wanted = Date.UTC(y, mo - 1, d, h, mi, s)
  const guess = wanted - zoneOffset(wanted, timeZone)
  return wanted - zoneOffset(guess, timeZone)
}

/**
 * A Home Assistant local date-time (`2026-07-25 09:30:00`, or a bare date), as a wall clock in
 * `timeZone` — the server's, which is what Home Assistant means by it — or in the browser's when
 * none is given. An ISO string with an offset is read as what it says.
 */
export const parseLocal = (value: unknown, timeZone?: string): number | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim())
  if (match) {
    const [, y, mo, d, h = '0', mi = '0', s = '0'] = match
    return zonedTime(
      +(y as string),
      +(mo as string),
      +(d as string),
      +h,
      +mi,
      +s,
      usableZone(timeZone),
    )
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * The next time the clock in `timeZone` (the server's; the browser's when absent) reads
 * `HH:MM[:SS]`: today, or tomorrow once today's has passed. Tomorrow is the next calendar day's
 * wall clock, not today's plus 24 hours, so an alarm across a DST change still rings at 07:00.
 */
export const nextTimeOfDay = (value: unknown, now: number, timeZone?: string): number | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const [, h, m, s = '0'] = match
  const zone = usableZone(timeZone)
  const today = wallClock(now, zone)
  const on = (offsetDays: number): number => {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offsetDays))
    return zonedTime(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      +(h as string),
      +(m as string),
      +s,
      zone,
    )
  }
  const at = on(0)
  return at > now ? at : on(1)
}

/** A countdown running to `target`, draining over `total`. */
const toward = (
  target: number,
  total: number | null,
  now: number,
  title: string | null = null,
): Countdown => {
  const remaining = Math.max(0, target - now)
  const span = total !== null && total > 0 ? total : null
  return {
    phase: remaining > 0 ? 'running' : 'done',
    target,
    remaining,
    total: span,
    fraction: span === null ? null : clamp01(remaining / span),
    title,
  }
}

/** The time since the entity last changed, when that is before `target`: when it was set. */
const sinceSet = (entity: HassEntity, target: number): number | null => {
  const changed = Date.parse(entity.last_changed)
  return Number.isFinite(changed) && changed < target ? target - changed : null
}

const timerCountdown = (entity: HassEntity, now: number, timeZone?: string): Countdown | null => {
  const duration = parseDuration(entity.attributes.duration)

  if (entity.state === 'active') {
    const finishes = parseLocal(entity.attributes.finishes_at, timeZone)
    const remaining = parseDuration(entity.attributes.remaining)
    const changed = Date.parse(entity.last_changed)
    const target =
      finishes ?? (remaining !== null && Number.isFinite(changed) ? changed + remaining : null)
    return target === null ? null : toward(target, duration, now)
  }

  if (entity.state === 'paused' || entity.state === 'idle') {
    const remaining =
      entity.state === 'paused'
        ? (parseDuration(entity.attributes.remaining) ?? duration)
        : duration
    if (remaining === null) return null
    return {
      phase: entity.state,
      target: null,
      remaining,
      total: duration,
      fraction: duration ? clamp01(remaining / duration) : null,
      title: null,
    }
  }

  return null
}

/**
 * The countdown an entity holds, or `null` when it holds none — which is most entities, and
 * which leaves the reading exactly as it was without the countdown switch.
 *
 * `windowHours`, when set, is the span every non-timer countdown drains over. `timeZone` is the
 * server's (`hass.config.time_zone`), the zone a naive date-time from Home Assistant is in.
 */
export const countdownFor = (
  entity: HassEntity,
  now: number,
  windowHours?: number,
  timeZone?: string,
): Countdown | null => {
  const domain = entity.entity_id.split('.')[0]
  const window = windowHours !== undefined && windowHours > 0 ? windowHours * HOUR : null

  if (domain === 'timer') return timerCountdown(entity, now, timeZone)

  if (domain === 'calendar') {
    const title = typeof entity.attributes.message === 'string' ? entity.attributes.message : null
    const start = parseLocal(entity.attributes.start_time, timeZone)
    const end = parseLocal(entity.attributes.end_time, timeZone)
    if (entity.state === 'on' && end !== null) {
      const running = toward(end, start !== null ? end - start : window, now, title)
      return { ...running, phase: running.phase === 'running' ? 'now' : 'done' }
    }
    if (start === null) return null
    return toward(start, window ?? sinceSet(entity, start), now, title)
  }

  if (domain === 'input_datetime') {
    const { has_date: hasDate, has_time: hasTime } = entity.attributes
    if (hasDate === false && hasTime !== false) {
      const target = nextTimeOfDay(entity.state, now, timeZone)
      return target === null ? null : toward(target, window ?? DAY, now)
    }
    const target = parseLocal(entity.state, timeZone)
    return target === null ? null : toward(target, window ?? sinceSet(entity, target), now)
  }

  if (entity.attributes.device_class === 'timestamp') {
    const target = parseLocal(entity.state, timeZone)
    return target === null ? null : toward(target, window ?? sinceSet(entity, target), now)
  }

  return null
}

/**
 * The time left as a watch face prints it. Rounded *up*, as a timer is — a minute's timer reads
 * 1:00 until a whole second has gone — and in three registers:
 *
 *  - under an hour, `12:34`, ticking by the second;
 *  - under a day, `4h 05m`;
 *  - beyond that, `2d 4h`.
 */
export const formatRemaining = (ms: number): string => {
  const seconds = secondsLeft(ms)
  if (seconds < 3600) {
    return minutesSeconds(seconds)
  }
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
  }
  const hours = Math.ceil(minutes / 60)
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** The same, as VoiceOver should say it: "4 hours 5 minutes". */
export const spokenRemaining = (ms: number): string => {
  const seconds = secondsLeft(ms)
  if (seconds < 60) return plural(seconds, 'second')
  if (seconds < 3600) {
    const s = seconds % 60
    return [plural(Math.floor(seconds / 60), 'minute'), ...(s ? [plural(s, 'second')] : [])].join(
      ' ',
    )
  }
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 24 * 60) {
    const m = minutes % 60
    return [plural(Math.floor(minutes / 60), 'hour'), ...(m ? [plural(m, 'minute')] : [])].join(' ')
  }
  const hours = Math.ceil(minutes / 60)
  const h = hours % 24
  return [plural(Math.floor(hours / 24), 'day'), ...(h ? [plural(h, 'hour')] : [])].join(' ')
}

/**
 * How long until the printed countdown next changes, so the card wakes exactly then rather than
 * on a blind interval: by the second under an hour, by the minute above it. `null` for one that
 * does not move. A few milliseconds late on purpose, so the wake lands after the change and not
 * a hair before it.
 */
export const nextTickIn = (countdown: Countdown): number | null => {
  if (!isTicking(countdown) || countdown.remaining <= 0) return null
  const unit = countdown.remaining <= HOUR ? SECOND : MINUTE
  return (countdown.remaining % unit || unit) + 5
}

/** The words a face prints under the countdown, and the reading it prints at all. */
export const countdownText = (
  countdown: Countdown,
): { value: string; spoken: string; phase: string | null } => {
  switch (countdown.phase) {
    case 'done':
      return { value: formatRemaining(0), spoken: 'finished', phase: 'Finished' }
    case 'paused':
      return {
        value: formatRemaining(countdown.remaining),
        spoken: `paused, ${spokenRemaining(countdown.remaining)} left`,
        phase: 'Paused',
      }
    case 'idle':
      return {
        value: formatRemaining(countdown.remaining),
        spoken: `not running, ${spokenRemaining(countdown.remaining)}`,
        phase: 'Not running',
      }
    case 'now':
      return {
        value: formatRemaining(countdown.remaining),
        spoken: `on now, ${spokenRemaining(countdown.remaining)} left`,
        phase: 'Now',
      }
    default:
      return {
        value: formatRemaining(countdown.remaining),
        spoken: `${spokenRemaining(countdown.remaining)} left`,
        phase: null,
      }
  }
}

/**
 * The moment, as the supporting line prints it: `at 14:30` today, `Fri 14:30` within the week,
 * `14 Nov` past that. In `timeZone` — the display zone, which is the server's only when the
 * user's profile pins the frontend to it (`hass.locale.time_zone: server`), and the browser's
 * otherwise — and "today" is today in that zone. The formatters are cached by locale, clock and
 * zone, since this runs for every countdown on every tick.
 */
export const formatTarget = (
  target: number,
  now: number,
  locale?: string,
  hour12?: boolean,
  timeZone?: string,
): string => {
  const zone = usableZone(timeZone)
  const inZone = zone ? { timeZone: zone } : {}
  const time = dateFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(hour12 !== undefined ? { hour12 } : {}),
    ...inZone,
  }).format(target)
  const a = wallClock(target, zone)
  const b = wallClock(now, zone)
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day
  if (sameDay) return `at ${time}`
  if (target - now < 6 * DAY) {
    const day = dateFormat(locale, { weekday: 'short', ...inZone }).format(target)
    return `${day} ${time}`
  }
  return dateFormat(locale, { day: 'numeric', month: 'short', ...inZone }).format(target)
}

/**
 * The countdown as a ring prints it: a short number with its unit on a small line underneath,
 * the way the Watch's countdown complications set `4:18` over `HR`. A ring has a circle's width
 * for one line, and `4h 18m` on that line crowds the track at the smallest sizes.
 *
 *  - under an hour, `12:34` and no unit, the Timer complication's own reading;
 *  - under a day, `4:18` over `HR` — hours and minutes, rounded up;
 *  - beyond that, `2` over `DAYS`, to the nearest day.
 */
export const shortRemaining = (ms: number): { main: string; unit: string | null } => {
  const seconds = secondsLeft(ms)
  if (seconds < 3600) return { main: formatRemaining(ms), unit: null }
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 24 * 60) {
    return {
      main: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`,
      unit: 'HR',
    }
  }
  const days = Math.max(1, Math.round(minutes / (24 * 60)))
  return { main: String(days), unit: days === 1 ? 'DAY' : 'DAYS' }
}
