import {
  clamp01,
  dateFormat,
  DAY,
  HOUR,
  MINUTE,
  minutesSeconds,
  parseDuration,
  plural,
  secondsLeft,
} from '../../core/duration'
import { readAction, readGestures } from '../../core/action-config'
import { configRows, rowKeys, text } from '../../core/rows'
import { DEFAULT_ACTION, type ActionConfig, type ActionName } from '../../core/actions'
import { formatValue, iconFor, isUnavailable, nameFor, numberOf } from '../../core/entity-view'
import {
  isTemplate,
  type TemplateRequest,
  ACTION_KEYS,
  actionTemplates,
  hasRowTemplates,
  templateRequest,
  truthy,
  type TemplateResolver,
} from '../../core/templates'
import { colorValue, tintVar } from '../../core/tint'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'
import {
  actionFromForm,
  actionToForm,
  gesturesFromForm,
  gesturesToForm,
} from '../../core/action-form'
import type { HistoryVerdict } from './history'
import { isOneOf, oneOf } from '../../core/one-of'

/**
 * What a Live Activity is, and how a status entity becomes one.
 *
 * Apple's Live Activity is a job with a beginning and an end: a delivery, a timer, a ride. On a
 * Lock Screen it is a glass panel with the app's glyph, what is happening now ("Rinsing"), a
 * progress bar and the time left; in the Dynamic Island the same facts squeezed into a pill.
 * When the job ends the activity says so for a while, and then goes away by itself. Nothing is
 * shown for a job that is not running, which is the whole difference from a tile: a tile is
 * always there, an activity is there only while it has something to say.
 *
 * Everything that decides what an activity says lives here, without a DOM, so the arithmetic a
 * washing machine's sensors need (a finish time where a duration was expected, `0.0 h` for "not
 * printing", a state called `power_off`) is pinned by tests rather than by screenshots.
 */

// ---- Config ------------------------------------------------------------------

/** One activity: a status entity, and the sensors that say how far along it is. */
export interface ActivityConfig {
  /** The status entity: what decides whether the job is running at all. */
  entity?: string
  /** These three, and the four below, may each be a template (`TEMPLATED_FIELDS`). */
  name?: string
  icon?: string
  color?: string
  /** Replaces the phase line: "Washing", or a template that builds one. */
  phase?: string
  /** Replaces the supporting text after the phase (the step, "Layer 120 of 300"). */
  detail?: string
  /**
   * Replaces the time left. An answer that reads as a time (a datetime, `1:05:00`, a number of
   * minutes) is counted down like a sensor's; anything else is printed as written.
   */
  remaining?: string
  /** Forces the activity shown (truthy) or hidden (falsy); until it answers, neither. */
  show?: string
  /**
   * A second entity whose state is the phase line, over the status's own: a Bambu printer's
   * `current_stage` ("Printing", "Auto bed levelling") says more than its `print_status`
   * ("Running"). Ignored while it reads idle or not reporting.
   */
  phase_entity?: string
  /** A percentage. The bar's first source. */
  progress_entity?: string
  /**
   * The time left, in any of the shapes integrations report it: a duration with a unit (`s`,
   * `min`, `h`, `d`), a clock string (`1:05:00`), or a timestamp, which is the moment the job
   * ends rather than how long is left (LG ThinQ's `remaining_time` is one).
   */
  remaining_entity?: string
  /** The whole job's length, which with the time left gives the bar when nothing else does. */
  total_entity?: string
  /** A count of steps done: a printer's current layer. */
  step_entity?: string
  /** And how many there are. */
  step_total_entity?: string
  /** What a step is called: "Layer". */
  step_label?: string
  /** When set, the ONLY states that mean running; everything else is idle (or finished). */
  active_states?: string[]
  /** States that mean idle on top of the usual ones (`DEFAULT_IDLE_STATES`). */
  idle_states?: string[]
  /** States that mean the job just finished, on top of `DEFAULT_DONE_STATES`. */
  done_states?: string[]
  /** How long "Done" stays up, in minutes, over the card's own. 0 never shows it. */
  done_minutes?: number
  /** What this activity does while idle, over the card's `when_idle`. */
  when_idle?: RowWhenIdle
  tap_action?: ActionConfig
  hold_action?: ActionConfig
  double_tap_action?: ActionConfig
}

/**
 * How an activity is drawn: the Lock Screen's panel, with the time large and a bar the width of
 * the card (`expanded`), or the Dynamic Island's pill, one line with the progress as a ring
 * round the glyph (`compact`).
 *
 * `style` rather than `layout`, for the tiles card's reason: Home Assistant's editor has a
 * Layout tab, and a second "layout" meaning something else would be read as that one. The
 * complication card already says `style` for "which drawing of the same facts".
 */
export const ACTIVITY_STYLES = ['expanded', 'compact'] as const
export type ActivityStyle = (typeof ACTIVITY_STYLES)[number]
export const DEFAULT_STYLE: ActivityStyle = 'expanded'

/**
 * Which time the trailing edge shows: how long is left (`remaining`, what a Live Activity leads
 * with), the clock time it will be done (`finish`), or both, the clock under the countdown.
 */
export const ACTIVITY_TIMES = ['remaining', 'finish', 'both'] as const
export type ActivityTime = (typeof ACTIVITY_TIMES)[number]
export const DEFAULT_TIME: ActivityTime = 'remaining'

/**
 * What an idle activity does, card-wide: disappears, and the card with it once nothing is left
 * (`hide`); disappears, leaving a quiet line saying so (`message`); or stays, dimmed, with its
 * state (`show`).
 *
 * `hide` is the default because it is the Live Activity: nobody's Lock Screen carries a panel
 * for the dishwasher that is not running. A dashboard is read at a glance, and a card that is
 * only there when something is happening is a card whose presence is itself the news.
 */
export const WHEN_IDLE = ['hide', 'message', 'show'] as const
export type WhenIdle = (typeof WHEN_IDLE)[number]
export const DEFAULT_WHEN_IDLE: WhenIdle = 'hide'

/** One activity's override: hidden or shown while idle. `message` is about the card, not a row. */
export const ROW_WHEN_IDLE = ['hide', 'show'] as const
export type RowWhenIdle = (typeof ROW_WHEN_IDLE)[number]

/** The editor's "whatever the card says"; never written to a config. */
export const WHEN_IDLE_INHERIT = 'inherit'

export const DEFAULT_IDLE_MESSAGE = 'Nothing running'

/**
 * Ten minutes of "Done". Apple keeps an ended activity up to four hours on a Lock Screen that is
 * looked at every few minutes; a dashboard is looked at less often, and the job that most wants
 * the reminder (a wash to move to the dryer) wants it for about as long as it takes to notice.
 * Long enough to be seen on a wall tablet walked past, short enough that it is gone by the time
 * it is old news.
 */
export const DEFAULT_DONE_MINUTES = 10
/** Apple's own ceiling for an ended activity. */
export const MAX_DONE_MINUTES = 240

/**
 * The states that mean "not running", whatever the integration. Compared after
 * `normalState`, so `Power Off`, `power off` and `power_off` are one.
 *
 * Chosen from the real devices this card was built against: LG ThinQ (`power_off`, `initial` —
 * switched on, nothing started), Bambu (`idle`, `offline`), a Litter-Robot's vacuum entity
 * (`docked`), and the generic ones every switch and sensor has. `initial` is the one worth a
 * word: an LG washer reads it from the moment its door is opened until a cycle starts, and a
 * panel saying "Initial" for the minute somebody is loading it is noise.
 */
export const DEFAULT_IDLE_STATES: readonly string[] = [
  'off',
  'idle',
  'standby',
  'power_off',
  'initial',
  'ready',
  'docked',
  'sleep',
  'sleeping',
  'stopped',
  'inactive',
  'offline',
  'none',
]

/**
 * The states that mean the job just ended. A failure is an ending too (`failed`, `cancel`): a
 * print that failed is exactly the news a Live Activity should end on, drawn in red rather than
 * green (`isFailure`), and then go away like any other ending rather than sit there forever.
 */
export const DEFAULT_DONE_STATES: readonly string[] = [
  'end',
  'finish',
  'finished',
  'complete',
  'completed',
  'done',
  'failed',
  'cancel',
  'cancelled',
  'canceled',
  'aborted',
]

/** States read as "not reporting": always idle, never news. */
const NOT_REPORTING = new Set(['unavailable', 'unknown', ''])

/** Case, spaces and hyphens folded, so a hand-typed `Power Off` matches `power_off`. */
export const normalState = (state: string): string =>
  state
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

const stateSet = (...lists: (readonly unknown[] | undefined)[]): Set<string> =>
  new Set(
    lists.flatMap(list =>
      (Array.isArray(list) ? list : []).flatMap(item =>
        typeof item === 'string' || typeof item === 'number' ? [normalState(String(item))] : [],
      ),
    ),
  )

/** Whether an ending was a failure, so it is drawn in red with a cross rather than a tick. */
export const isFailure = (state: string): boolean =>
  /fail|cancel|abort|error/.test(normalState(state))

// ---- Classification ------------------------------------------------------------

/**
 * What the status entity says, before time is taken into account: running (`active`), just
 * reached one of the done states (`ended`), or neither (`idle`). Whether an `ended` activity is
 * still worth showing is `readActivity`'s question, because it needs the clock.
 *
 * The done states are tested first, so a row whose `active_states` happen to include `end`
 * still ends. `active_states`, when given, is a whitelist: the Litter-Robot reports a dozen
 * status codes, and naming the four that mean "cycling" is easier than naming the eight that
 * do not.
 */
export type RawKind = 'active' | 'ended' | 'idle'

export const rawKind = (entity: HassEntity | undefined, row: ActivityConfig): RawKind =>
  entity ? kindOfState(entity.state, row) : 'idle'

/** The same question of a bare state string, which is what a history row carries. */
export const kindOfState = (raw: string, row: ActivityConfig): RawKind => {
  const state = normalState(raw)
  if (NOT_REPORTING.has(state)) return 'idle'
  if (stateSet(DEFAULT_DONE_STATES, row.done_states).has(state)) return 'ended'
  if (row.active_states && row.active_states.length > 0) {
    return stateSet(row.active_states).has(state) ? 'active' : 'idle'
  }
  return stateSet(DEFAULT_IDLE_STATES, row.idle_states).has(state) ? 'idle' : 'active'
}

/**
 * What the card remembers about one activity between renders, so it can tell a job that has
 * just ended from one that was never running.
 *
 * Needed because most appliances do not stop in a done state: an LG washer says `end` for
 * thirty seconds and then `power_off`, and `power_off` is idle. Reading `last_changed` of an
 * idle state as "when it finished" would be wrong in the other direction, because every entity
 * changes at a Home Assistant restart, and the morning after a restart every appliance on the
 * card would claim to have just finished. So an idle state counts as an ending only when this
 * card saw the job running first, and the ending is dated by the state that followed it.
 */
export interface ActivityTrack {
  wasActive: boolean
  /** Epoch ms the job stopped running, when this card saw it stop. */
  endedAt?: number
  /**
   * The entity stopped reporting (`unavailable`, `unknown`, gone) while the job was running, so
   * the card did not see how the run ended. If it comes back running, the run carries on; if it
   * comes back idle or done, the card cannot say it finished (it may have been switched off at
   * the wall) and leaves the question to the recorder, whose history walk calls a run broken by
   * `unavailable` no run.
   */
  lost?: boolean
}

/** Whether an entity is not reporting at all: missing, `unavailable` or `unknown`. */
export const notReporting = (entity: HassEntity | undefined): boolean =>
  !entity || NOT_REPORTING.has(normalState(String(entity.state ?? '')))

/** The memory, one render on. Pure: the card keeps the map, this decides what goes in it. */
export const trackActivity = (
  previous: ActivityTrack | undefined,
  kind: RawKind,
  entity: HassEntity | undefined,
): ActivityTrack => {
  if (kind === 'active') return { wasActive: true }
  // A Wi-Fi drop or a restart mid-run is not an ending: hold the memory as it was, marking a
  // run in progress as lost so its return to idle is not taken for a finish.
  if (notReporting(entity)) {
    if (!previous) return { wasActive: false }
    return previous.wasActive ? { wasActive: true, lost: true } : previous
  }
  if (previous?.wasActive && previous.lost) return { wasActive: false, lost: true }
  if (previous?.wasActive) {
    const at = entity ? Date.parse(entity.last_changed) : Number.NaN
    return Number.isFinite(at) ? { wasActive: false, endedAt: at } : { wasActive: false }
  }
  return previous ?? { wasActive: false }
}

// ---- Time --------------------------------------------------------------------

/**
 * A duration sensor's unit, as a multiplier to ms. HA's own duration units are `d`, `h`, `min`,
 * `s` and `ms`; the long spellings are what template sensors are written with.
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  m: MINUTE,
  min: MINUTE,
  mins: MINUTE,
  minute: MINUTE,
  minutes: MINUTE,
  h: HOUR,
  hr: HOUR,
  hrs: HOUR,
  hour: HOUR,
  hours: HOUR,
  d: DAY,
  day: DAY,
  days: DAY,
}

/**
 * A clock-shaped duration, or undefined: `1:05:00` (H:MM:SS), `1:05` (H:MM), Python's
 * `1 day, 2:03:04`, and ISO 8601's `PT1H5M`.
 *
 * Two parts are hours and minutes, not minutes and seconds. A job that runs for hours reports in
 * hours; the only things that report `MM:SS` are kitchen timers, and those always carry the
 * hours too (`0:04:30`).
 */
export const parseClock = (raw: string): number | undefined => parseDuration(raw, 'hours-minutes')

/** A wire datetime: an ISO date with a time on it. A bare date is not an end time. */
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/**
 * A duration sensor's value in ms, or undefined for anything that is not one. A number without a
 * unit is minutes, which is what appliance integrations mean by one.
 */
export const durationOf = (entity: HassEntity | undefined): number | undefined => {
  if (!entity || isUnavailable(entity)) return undefined
  const numeric = numberOf(entity.state)
  if (numeric !== null) {
    const unit = entity.attributes.unit_of_measurement
    const factor =
      typeof unit === 'string' && unit !== '' ? UNIT_MS[unit.trim().toLowerCase()] : MINUTE
    return factor === undefined ? undefined : numeric * factor
  }
  return parseClock(entity.state)
}

/**
 * What a time-left source came to: how long is left, when it will be done, and whether the two
 * can be counted down against the clock between updates (`ticking`), which is what the seconds
 * display and its timer need to know.
 */
export interface Remaining {
  remainingMs?: number
  finishAt?: number
  ticking?: boolean
}

/**
 * How long is left, and when it will be done, from whichever shape the sensor reports.
 *
 * A timestamp IS the finish time, so the countdown is worked out from it and ticks down with the
 * clock between updates.
 *
 * A duration is counted from when the sensor last reported it (`last_updated`), so it ticks too:
 * Bambu reports its hours once a minute, and a countdown frozen between reports could not show
 * seconds. Two cases are not anchored, and fall back to now plus the duration, unticking. A
 * paused job (`paused`), whose duration does not change, so its `last_updated` is from before the
 * pause and anchoring would count it down to nothing. And a report older than the duration it
 * gave, which is the same pause seen from the other side, or a sensor that has stopped.
 *
 * A duration of zero is no time at all rather than "done now": Bambu's printers report `0.0 h`
 * from the moment they start preparing until the slicer's estimate arrives.
 */
export const remainingOf = (
  entity: HassEntity | undefined,
  now: number,
  paused = false,
): Remaining => {
  if (!entity || isUnavailable(entity)) return {}
  const state = entity.state.trim()
  if (entity.attributes.device_class === 'timestamp' || DATETIME.test(state)) {
    return endTime(state, now)
  }
  const ms = durationOf(entity)
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return {}
  const reported = Date.parse(entity.last_updated)
  const elapsed = now - reported
  if (!paused && Number.isFinite(reported) && elapsed >= 0 && elapsed < ms) {
    return { remainingMs: ms - elapsed, finishAt: reported + ms, ticking: true }
  }
  return { remainingMs: ms, finishAt: now + ms, ticking: false }
}

const endTime = (state: string, now: number): Remaining => {
  const end = Date.parse(state)
  if (!Number.isFinite(end)) return {}
  return { remainingMs: Math.max(0, end - now), finishAt: end, ticking: true }
}

/**
 * A template's answer for the time left: a datetime is the finish time, a clock string or a
 * bare number (minutes) is a duration. Anything else is not a time, and the card prints it as
 * written instead of a countdown. A template's duration is not anchored: it has no
 * `last_updated` of its own, and it re-renders whenever its inputs change anyway.
 */
export const remainingFromText = (text: string, now: number): Remaining | undefined => {
  const value = text.trim()
  if (DATETIME.test(value)) {
    const out = endTime(value, now)
    return out.finishAt === undefined ? undefined : out
  }
  const numeric = numberOf(value)
  const ms = numeric !== null ? numeric * MINUTE : parseClock(value)
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return undefined
  return { remainingMs: ms, finishAt: now + ms, ticking: false }
}

/** A time left as numerals and units, so a card can set the numerals large: `1 hr 5 min`. */
export interface TimePart {
  value: string
  unit: string
}

/**
 * When the countdown shows seconds, as the Timer's Live Activity does: never, in the last hour
 * (the default, and the Timer's own reading: under an hour it is `23:05`), or in the last ten
 * minutes, for a dashboard that wants its minutes to stay calm until the end is close.
 */
export const SECONDS_MODES = ['never', 'hour', 'ten_minutes'] as const
export type SecondsMode = (typeof SECONDS_MODES)[number]
export const DEFAULT_SECONDS: SecondsMode = 'hour'

export const secondsFor = (value: unknown): SecondsMode =>
  oneOf(SECONDS_MODES, value, DEFAULT_SECONDS)

/** Below this much time left, the countdown is `m:ss`. 0 is never. */
export const secondsThreshold = (mode: SecondsMode): number =>
  mode === 'hour' ? HOUR : mode === 'ten_minutes' ? 10 * MINUTE : 0

/**
 * Whether `ms` prints as `m:ss`. Decided on the rounded-up seconds rather than on `ms`, so the
 * last hour starts at `59:59` and never prints `60:00`: from 59:59.001 up it is still "1 hr".
 */
const inSeconds = (ms: number, thresholdMs: number): boolean =>
  thresholdMs > 0 && secondsLeft(ms) * 1000 < thresholdMs

/**
 * Minutes, rounded up: a job with 30 seconds to go says "1 min", never "0 min", and under a
 * minute it says so. Hours and minutes past an hour, the way the Clock app's timers do, and
 * just the hours on the hour. Below `thresholdMs`, `m:ss` instead, in one part with no unit.
 */
export const remainingParts = (ms: number, thresholdMs = 0): TimePart[] => {
  if (inSeconds(ms, thresholdMs)) {
    const secs = secondsLeft(ms)
    return [{ value: minutesSeconds(secs), unit: '' }]
  }
  if (ms < MINUTE) return [{ value: '<1', unit: 'min' }]
  const minutes = Math.ceil(ms / MINUTE)
  if (minutes < 60) return [{ value: String(minutes), unit: 'min' }]
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? [{ value: String(hours), unit: 'hr' }]
    : [
        { value: String(hours), unit: 'hr' },
        { value: String(rest), unit: 'min' },
      ]
}

export const formatRemaining = (ms: number, thresholdMs = 0): string =>
  remainingParts(ms, thresholdMs)
    .map(part => (part.unit ? `${part.value} ${part.unit}` : part.value))
    .join(' ')

/** The same, as words for VoiceOver: "1 hour 5 minutes", "4 minutes 5 seconds". */
export const spokenRemaining = (ms: number, thresholdMs = 0): string => {
  if (inSeconds(ms, thresholdMs)) {
    const secs = secondsLeft(ms)
    const minutes = Math.floor(secs / 60)
    const rest = secs % 60
    const words = [
      minutes > 0 ? plural(minutes, 'minute') : '',
      rest > 0 ? plural(rest, 'second') : '',
    ]
    return words.filter(Boolean).join(' ') || '0 seconds'
  }
  if (ms < MINUTE) return 'less than a minute'
  const minutes = Math.ceil(ms / MINUTE)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const words = [hours > 0 ? plural(hours, 'hour') : '', rest > 0 ? plural(rest, 'minute') : '']
  return words.filter(Boolean).join(' ')
}

/**
 * How long until a countdown at `ms` prints something different. Both displays round up
 * (`secondsLeft`, `Math.ceil` in `remainingParts`), so the printed value drops exactly when `ms`
 * crosses a multiple of its unit, and the wait is the remainder, or a whole unit when `ms` sits
 * on a boundary. Above the threshold there is one more moment: the switch to `m:ss`, one second
 * short of the threshold (`inSeconds`). Undefined for a countdown that has run out, or that
 * is under a minute without seconds: nothing it prints will change again.
 */
export const nextChangeIn = (ms: number, thresholdMs = 0): number | undefined => {
  if (!(ms > 0)) return undefined
  if (inSeconds(ms, thresholdMs)) return ms % 1000 || 1000
  // Minutes: under one it says "<1 min" to the end, and exactly one is its own reading.
  if (ms < MINUTE) return undefined
  const minute = ms === MINUTE ? 1 : ms % MINUTE || MINUTE
  const switchAt = thresholdMs - 1000
  return thresholdMs > 0 && ms > switchAt ? Math.min(minute, ms - switchAt) : minute
}

/** What the timer needs to know of one activity. */
export interface TickSource {
  kind: ActivityKind
  finishAt?: number | undefined
  ticking?: boolean | undefined
  lingerUntil?: number | undefined
}

/**
 * When the card next has to repaint: the soonest moment any countdown it prints changes, or
 * any "Done" runs out. Undefined when nothing on the card moves with the clock, so an idle card
 * runs no timer at all. A `finish` card prints clock times, which do not change, so only its
 * lingers count.
 */
export const nextTickIn = (
  views: readonly TickSource[],
  now: number,
  thresholdMs: number,
  time: ActivityTime,
): number | undefined => {
  let soonest: number | undefined
  const consider = (delay: number | undefined): void => {
    if (delay !== undefined && delay > 0 && (soonest === undefined || delay < soonest)) {
      soonest = delay
    }
  }
  for (const view of views) {
    if (
      view.kind === 'active' &&
      view.ticking &&
      view.finishAt !== undefined &&
      time !== 'finish'
    ) {
      consider(nextChangeIn(view.finishAt - now, thresholdMs))
    }
    if ((view.kind === 'done' || view.kind === 'failed') && view.lingerUntil !== undefined) {
      consider(view.lingerUntil - now)
    }
  }
  return soonest
}

/** How the card wants a clock time printed: the calendar's `timePreferences`, and a zone. */
export interface ClockFormat {
  locale: string | undefined
  hour12: boolean
  timeZone?: string | undefined
}

/** A wall-clock time, `9:41 PM` or `21:41`, as the user's profile wants it. */
export const formatClock = (at: number, format: ClockFormat): string =>
  dateFormat(format.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: format.hour12 ? 'h12' : 'h23',
    ...(format.timeZone ? { timeZone: format.timeZone } : {}),
  }).format(new Date(at))

// ---- Progress ------------------------------------------------------------------

/**
 * How far along, 0 to 1, or undefined for "nobody knows", which draws no bar at all.
 *
 * A percentage sensor first, because it is the integration's own answer. Failing that, the time
 * left against the whole job's length, which an LG appliance can give (`total_time` beside its
 * finish time) though it has no progress sensor. No bar rather than an indeterminate one when
 * neither is there: a Live Activity without a measure of progress simply has no bar, and an
 * animated stripe that never arrives anywhere is the web's idiom, not Apple's.
 */
export const progressOf = (
  progress: HassEntity | undefined,
  remainingMs: number | undefined,
  totalMs: number | undefined,
): number | undefined => {
  if (progress && !isUnavailable(progress)) {
    const value = numberOf(progress.state)
    if (value !== null) return clamp01(value / 100)
  }
  if (remainingMs !== undefined && totalMs !== undefined && totalMs > 0) {
    return clamp01(1 - remainingMs / totalMs)
  }
  return undefined
}

// ---- Naming ------------------------------------------------------------------

/**
 * What the integrations call the status sensor, cut off the name: "Front Load Washer Current
 * status" is the washer, and the sensor's own word for itself is noise on a card about it.
 */
const STATUS_SUFFIX =
  /[\s_]+(current[\s_]+status|print[\s_]+status|run[\s_]+state|operation[\s_]+state|machine[\s_]+state|status[\s_]+code|current[\s_]+stage|status|state)$/i

export const activityName = (entity: HassEntity): string => {
  const name = nameFor(entity)
  const trimmed = name.replace(STATUS_SUFFIX, '').trim()
  return trimmed === '' ? name : trimmed
}

/**
 * A glyph for the appliance, guessed from its id and name.
 *
 * Needed because a status sensor is an `enum` sensor, and to `iconFor` that is any sensor: it
 * would draw an eye beside every washing machine. The guesses are ordered so the specific beats
 * the general: a dishwasher is not a washer.
 */
const ICON_GUESSES: readonly (readonly [RegExp, string])[] = [
  [/dish/, 'mdi:dishwasher'],
  [/dryer|tumble/, 'mdi:tumble-dryer'],
  [/wash/, 'mdi:washing-machine'],
  [/litter/, 'mdi:cat'],
  [/print|bambu|prusa|octoprint|3d/, 'mdi:printer-3d-nozzle'],
  [/vacuum|roborock|roomba|mop/, 'mdi:robot-vacuum'],
  [/microwave/, 'mdi:microwave'],
  [/oven|stove|cook/, 'mdi:stove'],
  [/coffee|espresso/, 'mdi:coffee-maker'],
  [/kettle/, 'mdi:kettle'],
  [/charg|\bev\b|wallbox/, 'mdi:ev-station'],
  [/sprinkler|irrigation/, 'mdi:sprinkler'],
]

/** What a job is drawn with when nothing better can be said: a timer, which is what it is. */
export const ACTIVITY_FALLBACK_ICON = 'mdi:timer-outline'

export const activityIcon = (entity: HassEntity): string => {
  const own = entity.attributes.icon
  if (typeof own === 'string' && own !== '') return own
  const haystack = `${entity.entity_id} ${nameFor(entity)}`.toLowerCase()
  for (const [pattern, icon] of ICON_GUESSES) if (pattern.test(haystack)) return icon
  const generic = iconFor(entity)
  return generic === 'mdi:eye' ? ACTIVITY_FALLBACK_ICON : generic
}

/**
 * A state as the frontend would print it.
 *
 * `hass.formatEntityState` first: it knows each integration's own translations, so an LG
 * washer's `detecting` comes out as the app's own word for it and a Litter-Robot's `ccp` as
 * "Clean cycle in progress". It is missing from `HomeAssistant` in `core/types/ha.ts` and from
 * the showcase's stand-in, so it is read defensively, and `formatValue` (which turns `power_off`
 * into "Power off") stands in where it is absent.
 */
export const formatState = (hass: HomeAssistant, entity: HassEntity): string => {
  const format = (hass as { formatEntityState?: unknown }).formatEntityState
  if (typeof format === 'function') {
    const out: unknown = format.call(hass, entity)
    if (typeof out === 'string' && out !== '') return out
  }
  return formatValue(hass, entity)
}

// ---- The view ------------------------------------------------------------------

/**
 * What an activity is right now. `done` and `failed` are an ending still inside its linger;
 * an ending past it is `idle`, like any other job that is not running.
 */
export type ActivityKind = 'active' | 'done' | 'failed' | 'idle'

/** One activity, resolved and ready to draw. */
export interface ActivityView {
  entityId: string | undefined
  name: string
  icon: string
  /** A CSS colour: the configured one, or the system green or red for an ending. */
  color: string
  kind: ActivityKind
  /** "Rinsing", "Printing", "Done", "Power off". */
  phase: string
  /** "Layer 120 of 300", when a step entity says so. */
  detail: string | undefined
  remainingMs: number | undefined
  /** Epoch ms the job will finish (active) or did (an ending). */
  finishAt: number | undefined
  /** Whether the countdown moves with the clock between updates (`Remaining.ticking`). */
  ticking: boolean
  /** A `remaining` template's answer that is not a time, printed in the countdown's place. */
  timeText: string | undefined
  /** When an ending stops showing Done. */
  lingerUntil: number | undefined
  /** 0 to 1, or undefined for no bar. */
  progress: number | undefined
  /** Whether the card draws it at all. */
  visible: boolean
  unavailable: boolean
  action: ActionConfig
  holdAction?: ActionConfig
  doubleTapAction?: ActionConfig
}

/** What every row inherits from the card. */
export interface ActivityDefaults {
  color?: string | undefined
  done_minutes?: number | undefined
  when_idle?: WhenIdle | undefined
}

/** A minutes value from YAML or the form, as a whole number in range, or undefined. */
export const minutesFor = (value: unknown): number | undefined => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Math.min(MAX_DONE_MINUTES, Math.max(0, Math.round(n)))
}

export const styleFor = (value: unknown): ActivityStyle =>
  oneOf(ACTIVITY_STYLES, value, DEFAULT_STYLE)

export const timeFor = (value: unknown): ActivityTime => oneOf(ACTIVITY_TIMES, value, DEFAULT_TIME)

export const whenIdleFor = (value: unknown): WhenIdle => oneOf(WHEN_IDLE, value, DEFAULT_WHEN_IDLE)

// ---- Templates ---------------------------------------------------------------

/**
 * The fields that may be templates, in the order the editor shows them. The chips card's rule,
 * kept here the same way: what `activityTemplates` registers and what `readActivity` resolves
 * is one list, so a field cannot be asked for and never read.
 */
export const TEMPLATED_FIELDS = [
  'name',
  'icon',
  'color',
  'phase',
  'detail',
  'remaining',
  'show',
] as const

/**
 * Every template a config asks for, ready for `TemplatePool.sync`. Each carries the row's
 * status entity as `entity` and `config.entity`, and the viewer as `user`, through the chips
 * card's `templateRequest`, which the card's resolver also builds its keys with: the two cannot
 * disagree about a key.
 */
export const activityTemplates = (raw: unknown, user?: string): TemplateRequest[] =>
  activityConfigs(raw).flatMap(row => {
    const templates = [
      ...TEMPLATED_FIELDS.map(field => row[field]).filter(isTemplate),
      ...ACTION_KEYS.flatMap(key => actionTemplates(row[key])),
    ]
    return templates.map(template => templateRequest(template, row.entity, user))
  })

/** Whether a row holds a template anywhere the editor's switch would have to show. */
export const hasTemplates = (row: ActivityConfig): boolean => hasRowTemplates(row, TEMPLATED_FIELDS)

export interface ReadContext {
  now: number
  defaults?: ActivityDefaults
  /** This card's memory of the activity; see `ActivityTrack`. */
  track?: ActivityTrack | undefined
  /**
   * What the recorder said about the moment it stopped (`history.ts`). Absent is "not asked",
   * which reads as `unknown`: a done state is trusted on its own, an idle one is not.
   */
  history?: HistoryVerdict | undefined
  /** Template results, by template and entity. Absent: no template has answered. */
  resolve?: TemplateResolver | undefined
}

/**
 * Whether a paused job's countdown should stand still: its status, or its phase, says paused.
 * Bambu's `pause`, LG's `pause`, and every `paused_*` stage.
 */
const isPaused = (...entities: (HassEntity | undefined)[]): boolean =>
  entities.some(entity => entity !== undefined && /paus/.test(normalState(entity.state)))

/**
 * When the run ended, of the evidence there is: what this card saw, then what the recorder
 * says, then (with no recorder to ask) a done state's own `last_changed`. A pending answer is no
 * ending yet, so a restart never flashes a Done the recorder would take back.
 */
export const endedAtFor = (
  raw: RawKind,
  entity: HassEntity,
  track: ActivityTrack | undefined,
  history: HistoryVerdict | undefined,
): number | undefined => {
  if (raw === 'active') return undefined
  if (track?.endedAt !== undefined) return track.endedAt
  if (history?.status === 'ended') return history.at
  // A run the card lost sight of: only the recorder can say it finished.
  if (track?.lost) return undefined
  if (raw === 'ended' && (history === undefined || history.status === 'unknown')) {
    const changed = Date.parse(entity.last_changed)
    return Number.isFinite(changed) ? changed : undefined
  }
  return undefined
}

/** How long a row's Done stays up, in ms: its own minutes, the card's, or the default. */
export const lingerMsFor = (row: ActivityConfig, defaults: ActivityDefaults = {}): number =>
  (minutesFor(row.done_minutes) ?? minutesFor(defaults.done_minutes) ?? DEFAULT_DONE_MINUTES) *
  MINUTE

export const readActivity = (
  hass: HomeAssistant | undefined,
  row: ActivityConfig,
  { now, defaults = {}, track, history, resolve }: ReadContext,
): ActivityView => {
  const entity = row.entity !== undefined ? hass?.states[row.entity] : undefined
  const state = (id: string | undefined): HassEntity | undefined =>
    id !== undefined ? hass?.states[id] : undefined

  // A template that has not answered, or answered nothing, is no override: what the card would
  // otherwise draw stands until it does.
  const field = (raw: string | undefined, rowEntity: string | undefined): string | undefined => {
    if (!isTemplate(raw)) return raw === '' ? undefined : raw
    const result = resolve?.(raw, rowEntity)
    return result === undefined || result.trim() === '' ? undefined : result
  }
  const own = (raw: string | undefined): string | undefined => field(raw, row.entity)

  const action = readAction(
    row.tap_action,
    field,
    row.entity,
    row.entity !== undefined ? DEFAULT_ACTION : { action: 'none' },
  )
  const gestures = readGestures(row, field)
  const color = colorValue(own(row.color)) ?? colorValue(defaults.color) ?? tintVar('accent')
  const showIdle = (row.when_idle ?? whenIdleFor(defaults.when_idle)) === 'show'
  const forced = own(row.show)
  const visibleWhen = (normally: boolean): boolean =>
    forced === undefined ? normally : truthy(forced)
  const lingerMs = lingerMsFor(row, defaults)
  const name = own(row.name)
  const icon = own(row.icon)
  const quiet = {
    remainingMs: undefined,
    finishAt: undefined,
    ticking: false,
    timeText: undefined,
    lingerUntil: undefined,
    progress: undefined,
  }

  if (!hass || !entity) {
    return {
      ...quiet,
      entityId: row.entity,
      name: name ?? row.entity ?? '',
      icon: icon ?? ACTIVITY_FALLBACK_ICON,
      color,
      kind: 'idle',
      phase: 'Not reporting',
      detail: undefined,
      visible: visibleWhen(showIdle),
      unavailable: true,
      action,
      ...gestures,
    }
  }

  const raw = rawKind(entity, row)
  const endedAt = endedAtFor(raw, entity, track, history)
  // Past the linger, an ending is just idle. The minute of grace the other way is clock skew
  // between Home Assistant and the browser, not a feature.
  const lingering = endedAt !== undefined && now - endedAt < lingerMs && now >= endedAt - MINUTE
  const kind: ActivityKind =
    raw === 'active'
      ? 'active'
      : lingering
        ? raw === 'ended' && isFailure(entity.state)
          ? 'failed'
          : 'done'
        : 'idle'

  const base = {
    entityId: row.entity,
    name: name ?? activityName(entity),
    icon: icon ?? activityIcon(entity),
    unavailable: isUnavailable(entity),
    action,
    ...gestures,
  }

  if (kind === 'done' || kind === 'failed') {
    const hasBar = row.progress_entity !== undefined || row.total_entity !== undefined
    return {
      ...base,
      ...quiet,
      color: tintVar(kind === 'done' ? 'green' : 'red'),
      kind,
      phase: kind === 'done' ? 'Done' : formatState(hass, entity),
      detail: undefined,
      finishAt: endedAt,
      lingerUntil: endedAt === undefined ? undefined : endedAt + lingerMs,
      progress: kind === 'done' && hasBar ? 1 : undefined,
      visible: visibleWhen(true),
    }
  }

  if (kind === 'idle') {
    return {
      ...base,
      ...quiet,
      color,
      kind,
      phase: own(row.phase) ?? formatState(hass, entity),
      detail: own(row.detail),
      // Words only: an idle job has no countdown, but "Starts 1:00" is exactly what a delayed
      // start shown by `show` has to say.
      timeText: own(row.remaining),
      visible: visibleWhen(showIdle),
    }
  }

  const phaseEntity = state(row.phase_entity)
  const phaseSays =
    phaseEntity !== undefined && rawKind(phaseEntity, {}) === 'active' ? phaseEntity : entity
  const paused = isPaused(entity, phaseEntity)
  const template = own(row.remaining)
  const fromTemplate = template !== undefined ? remainingFromText(template, now) : undefined
  const time: Remaining =
    template !== undefined
      ? (fromTemplate ?? {})
      : remainingOf(state(row.remaining_entity), now, paused)
  const totalMs = durationOf(state(row.total_entity))

  return {
    ...base,
    color,
    kind,
    phase: own(row.phase) ?? formatState(hass, phaseSays),
    detail:
      own(row.detail) ??
      stepText(state(row.step_entity), state(row.step_total_entity), row.step_label),
    remainingMs: time.remainingMs,
    finishAt: time.finishAt,
    ticking: time.ticking === true && !paused,
    timeText: template !== undefined && fromTemplate === undefined ? template : undefined,
    lingerUntil: undefined,
    progress: progressOf(state(row.progress_entity), time.remainingMs, totalMs),
    visible: visibleWhen(true),
  }
}

/** "Layer 120 of 300", "Layer 120", or nothing. Steps are whole numbers; anything else is not one. */
export const stepText = (
  step: HassEntity | undefined,
  total: HassEntity | undefined,
  label: string | undefined,
): string | undefined => {
  const value = step && !isUnavailable(step) ? numberOf(step.state) : null
  if (value === null) return undefined
  const of = total && !isUnavailable(total) ? numberOf(total.state) : null
  const word = label?.trim() || 'Step'
  const count = Math.round(value)
  return of !== null && of > 0 ? `${word} ${count} of ${Math.round(of)}` : `${word} ${count}`
}

/**
 * What VoiceOver reads for one activity: everything the eye gets from the panel, in the order
 * the eye gets it. "Washer, Rinsing, 23 minutes left, done at 9:41 PM, 60 percent."
 */
export const spokenLabel = (
  view: ActivityView,
  time: ActivityTime,
  clock: (at: number) => string,
  thresholdMs = 0,
): string => {
  const parts: string[] = [view.name, view.phase]
  if (view.detail) parts.push(view.detail)
  if (view.timeText !== undefined) parts.push(view.timeText)
  if (view.kind === 'active') {
    if (view.timeText === undefined && view.remainingMs !== undefined && time !== 'finish') {
      parts.push(`${spokenRemaining(view.remainingMs, thresholdMs)} left`)
    }
    if (view.finishAt !== undefined && time !== 'remaining') {
      parts.push(`done at ${clock(view.finishAt)}`)
    }
    if (view.progress !== undefined) parts.push(`${Math.round(view.progress * 100)} percent`)
  } else if (view.finishAt !== undefined && view.kind !== 'idle') {
    parts.push(`at ${clock(view.finishAt)}`)
  }
  return parts.filter(part => part !== '').join(', ')
}

// ---- Rows ----------------------------------------------------------------------

/**
 * The config's list, however it was written: a bare id is a row with just a status entity, an
 * object is a row, and anything else is dropped rather than thrown on, because a card that
 * refuses its config takes the whole dashboard view's editing with it.
 */
export const activityConfigs = (raw: unknown): ActivityConfig[] => {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): ActivityConfig[] => {
    if (typeof item === 'string') return item.trim() === '' ? [] : [{ entity: item.trim() }]
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = { ...(item as ActivityConfig) }
    if (typeof row.entity !== 'string' || row.entity === '') delete row.entity
    // Hand-written YAML: `active_states: running`, or the numeric codes some devices report
    // (`[1, 2]`). Read as the list of strings the classifier expects, never thrown on.
    for (const key of LIST_KEYS) {
      if (!(key in row)) continue
      const list = listOf(row[key])
      if (list) row[key] = list
      else delete row[key]
    }
    return [row]
  })
}

const ENTITY_KEYS = [
  'entity',
  'phase_entity',
  'progress_entity',
  'remaining_entity',
  'total_entity',
  'step_entity',
  'step_total_entity',
] as const

/** Every entity the card reads; a change to any of them repaints it. */
export const activityWatchedIds = (raw: unknown): string[] => [
  ...new Set(
    activityConfigs(raw).flatMap(row =>
      ENTITY_KEYS.flatMap(key => {
        const id = row[key]
        return typeof id === 'string' && id !== '' ? [id] : []
      }),
    ),
  ),
]

/** The chips card's keys and write-back, which are about rows with an `entity`, nothing more. */
export const activityKeys = (rows: readonly ActivityConfig[]): string[] => rowKeys(rows)

export const activityRows = (rows: readonly ActivityConfig[]): (string | ActivityConfig)[] =>
  configRows(rows) as (string | ActivityConfig)[]

// ---- The editor's form ---------------------------------------------------------

const TEXT_KEYS = [...TEMPLATED_FIELDS, 'step_label', ...ENTITY_KEYS.slice(1)] as const
const LIST_KEYS = ['active_states', 'idle_states', 'done_states'] as const

/** A list field's answer, trimmed and de-duplicated; empty is absent. */
const listOf = (value: unknown): string[] | undefined => {
  const items = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
    .filter(
      (item): item is string | number =>
        typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)),
    )
    .map(item => String(item).trim())
    .filter(item => item !== '')
  const unique = [...new Set(items)]
  return unique.length > 0 ? unique : undefined
}

/** One activity flat, as its panel's `ha-form` wants it. See `chipToForm` on why flat. */
export const activityToForm = (config: ActivityConfig): Record<string, unknown> => ({
  entity: config.entity,
  name: config.name,
  icon: config.icon,
  color: config.color,
  phase_entity: config.phase_entity,
  progress_entity: config.progress_entity,
  remaining_entity: config.remaining_entity,
  total_entity: config.total_entity,
  step_entity: config.step_entity,
  step_total_entity: config.step_total_entity,
  step_label: config.step_label,
  phase: config.phase,
  detail: config.detail,
  remaining: config.remaining,
  show: config.show,
  active_states: config.active_states ?? [],
  idle_states: config.idle_states ?? [],
  done_states: config.done_states ?? [],
  done_minutes: config.done_minutes,
  when_idle: config.when_idle ?? WHEN_IDLE_INHERIT,
  ...actionToForm(config.tap_action, config.entity),
  ...gesturesToForm(config),
})

/** The inverse, writing nothing for an empty field, an inherited choice or a bare default press. */
export const activityFromForm = (
  prior: ActivityConfig,
  data: Record<string, unknown>,
): ActivityConfig => {
  const next: ActivityConfig = {}

  const entity = text(data.entity)
  if (entity !== undefined) next.entity = entity

  for (const key of TEXT_KEYS) {
    const value = text(data[key])
    if (value !== undefined) next[key] = value
  }

  for (const key of LIST_KEYS) {
    const value = listOf(data[key])
    if (value !== undefined) next[key] = value
  }

  const minutes = minutesFor(data.done_minutes)
  if (minutes !== undefined) next.done_minutes = minutes

  if (isOneOf(ROW_WHEN_IDLE, data.when_idle)) {
    next.when_idle = data.when_idle as RowWhenIdle
  }

  const bareDefault: ActionName = entity === undefined ? 'none' : DEFAULT_ACTION.action
  // The tiles model's two stale defaults, for the same reasons: a cleared entity must not strand
  // its implicit more-info as an explicit action, and a first entity must not write the blank
  // row's implicit none.
  const stale =
    prior.tap_action === undefined &&
    ((entity === undefined && prior.entity !== undefined) ||
      (entity !== undefined && prior.entity === undefined && data.action === 'none'))
  const tap = stale ? undefined : actionFromForm(prior.tap_action, data, bareDefault)
  if (tap !== undefined) next.tap_action = tap

  return { ...next, ...gesturesFromForm(prior, data) }
}
