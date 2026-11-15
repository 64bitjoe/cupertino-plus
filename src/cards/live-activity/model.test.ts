import { describe, expect, it } from 'vitest'

import {
  activityConfigs,
  activityTemplates,
  endedAtFor,
  hasTemplates,
  nextChangeIn,
  nextTickIn,
  remainingFromText,
  secondsFor,
  secondsThreshold,
  activityFromForm,
  activityIcon,
  activityKeys,
  activityName,
  activityRows,
  activityToForm,
  activityWatchedIds,
  DEFAULT_DONE_MINUTES,
  durationOf,
  formatClock,
  formatRemaining,
  formatState,
  isFailure,
  minutesFor,
  normalState,
  parseClock,
  progressOf,
  rawKind,
  readActivity,
  remainingOf,
  remainingParts,
  spokenLabel,
  spokenRemaining,
  stepText,
  styleFor,
  timeFor,
  trackActivity,
  whenIdleFor,
  WHEN_IDLE_INHERIT,
  type ActivityConfig,
} from './model'
import type { HassEntity, HomeAssistant } from '../../core/types/ha'

const NOW = Date.parse('2026-11-14T20:00:00Z')
const MIN = 60_000

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  changed = '2026-11-14T19:00:00Z',
): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: changed,
  last_updated: changed,
})

const hassWith = (...list: HassEntity[]): HomeAssistant =>
  ({
    states: Object.fromEntries(list.map(one => [one.entity_id, one])),
    entities: {},
    locale: { language: 'en' },
    localize: () => '',
  }) as unknown as HomeAssistant

// The real shapes, as read from the user's Home Assistant.
const WASHER = 'sensor.front_load_washer_current_status'
const WASHER_LEFT = 'sensor.front_load_washer_remaining_time_2'
const WASHER_TOTAL = 'sensor.front_load_washer_total_time'
const washer = (state: string, changed?: string) =>
  entity(
    WASHER,
    state,
    { friendly_name: 'Front Load Washer Current status', device_class: 'enum' },
    changed,
  )
const washerLeft = (iso: string) =>
  entity(WASHER_LEFT, iso, {
    device_class: 'timestamp',
    friendly_name: 'Front Load Washer Remaining time',
  })
const washerTotal = (minutes: string) =>
  entity(WASHER_TOTAL, minutes, { device_class: 'duration', unit_of_measurement: 'min' })

const PRINTER = 'sensor.p1s_01p00c5b1502493_print_status'
const printer = (state: string, changed?: string) =>
  entity(PRINTER, state, { friendly_name: 'Horatio Print status', device_class: 'enum' }, changed)
const printerLeft = (hours: string, reported = '2026-11-14T20:00:00Z') =>
  entity(
    'sensor.p1s_01p00c5b1502493_remaining_time',
    hours,
    { device_class: 'duration', unit_of_measurement: 'h' },
    reported,
  )

describe('normalState and isFailure', () => {
  it('folds case, spaces and hyphens', () => {
    expect(normalState(' Power Off ')).toBe('power_off')
    expect(normalState('night-dry')).toBe('night_dry')
  })

  it('reads a failure in any spelling', () => {
    expect(isFailure('failed')).toBe(true)
    expect(isFailure('Cancelled')).toBe(true)
    expect(isFailure('end')).toBe(false)
  })
})

describe('rawKind', () => {
  it('calls the usual idle states idle, whatever their spelling', () => {
    for (const state of ['off', 'idle', 'power_off', 'Power Off', 'standby', 'docked', 'initial']) {
      expect(rawKind(entity('sensor.x', state), {})).toBe('idle')
    }
  })

  it('calls not reporting idle, never news', () => {
    expect(rawKind(entity('sensor.x', 'unavailable'), {})).toBe('idle')
    expect(rawKind(entity('sensor.x', 'unknown'), {})).toBe('idle')
    expect(rawKind(undefined, {})).toBe('idle')
  })

  it('calls anything else running', () => {
    for (const state of ['running', 'rinsing', 'spinning', 'pause', 'prepare', 'cleaning']) {
      expect(rawKind(entity('sensor.x', state), {})).toBe('active')
    }
  })

  it('reads the done states as an ending', () => {
    for (const state of ['end', 'finish', 'Finished', 'failed', 'cancel']) {
      expect(rawKind(entity('sensor.x', state), {})).toBe('ended')
    }
  })

  it('adds the row’s idle and done states to the usual ones', () => {
    const row: ActivityConfig = { idle_states: ['Night dry'], done_states: ['ccc'] }
    expect(rawKind(entity('sensor.x', 'night_dry'), row)).toBe('idle')
    expect(rawKind(entity('sensor.x', 'off'), row)).toBe('idle')
    expect(rawKind(entity('sensor.x', 'ccc'), row)).toBe('ended')
  })

  it('treats active_states as a whitelist, as a Litter-Robot needs', () => {
    const row: ActivityConfig = { active_states: ['ccp', 'cst', 'cd', 'csi'] }
    expect(rawKind(entity('sensor.abbie_status_code', 'ccp'), row)).toBe('active')
    expect(rawKind(entity('sensor.abbie_status_code', 'rdy'), row)).toBe('idle')
    expect(rawKind(entity('sensor.abbie_status_code', 'dfs'), row)).toBe('idle')
  })

  it('matches numeric codes, and survives a list written as a bare string', () => {
    const [codes] = activityConfigs([{ entity: 'sensor.x', active_states: [1, 2] }])
    expect(rawKind(entity('sensor.x', '2'), codes as ActivityConfig)).toBe('active')
    expect(rawKind(entity('sensor.x', '3'), codes as ActivityConfig)).toBe('idle')
    const [bare] = activityConfigs([{ entity: 'sensor.x', active_states: 'running' }])
    expect(rawKind(entity('sensor.x', 'running'), bare as ActivityConfig)).toBe('active')
    expect(rawKind(entity('sensor.x', 'washing'), bare as ActivityConfig)).toBe('idle')
    // Unnormalised, straight from YAML, it still does not throw.
    const raw = { active_states: [1, null, 'run'], done_states: 'end' } as unknown as ActivityConfig
    expect(rawKind(entity('sensor.x', '1'), raw)).toBe('active')
  })

  it('lets a done state end a job even when it is whitelisted as active', () => {
    expect(rawKind(entity('sensor.x', 'end'), { active_states: ['end'] })).toBe('ended')
  })
})

describe('trackActivity', () => {
  it('remembers a running job', () => {
    expect(trackActivity(undefined, 'active', washer('running'))).toEqual({ wasActive: true })
  })

  it('dates an ending by the state that followed the run', () => {
    const off = washer('power_off', '2026-11-14T19:58:00Z')
    expect(trackActivity({ wasActive: true }, 'idle', off)).toEqual({
      wasActive: false,
      endedAt: Date.parse('2026-11-14T19:58:00Z'),
    })
  })

  it('never invents an ending for a job it did not see running (a restart)', () => {
    expect(trackActivity(undefined, 'idle', washer('power_off'))).toEqual({ wasActive: false })
  })

  it('keeps the ending through later idle renders, and the end → power off hand-over', () => {
    const ended = trackActivity({ wasActive: true }, 'ended', washer('end', '2026-11-14T19:58:00Z'))
    const later = trackActivity(ended, 'idle', washer('power_off', '2026-11-14T19:58:30Z'))
    expect(later.endedAt).toBe(Date.parse('2026-11-14T19:58:00Z'))
  })

  it('forgets the ending when the next job starts', () => {
    expect(trackActivity({ wasActive: false, endedAt: 1 }, 'active', washer('running'))).toEqual({
      wasActive: true,
    })
  })
  it('does not take a job going unavailable mid-run for an ending', () => {
    const gone = washer('unavailable', '2026-11-14T19:58:00Z')
    expect(trackActivity({ wasActive: true }, 'idle', gone)).toEqual({
      wasActive: true,
      lost: true,
    })
    expect(trackActivity({ wasActive: true }, 'idle', washer('unknown'))).toEqual({
      wasActive: true,
      lost: true,
    })
    expect(trackActivity({ wasActive: true }, 'idle', undefined)).toEqual({
      wasActive: true,
      lost: true,
    })
  })

  it('carries a run on when it comes back running', () => {
    const lost = trackActivity({ wasActive: true }, 'idle', washer('unavailable'))
    expect(trackActivity(lost, 'active', washer('rinsing'))).toEqual({ wasActive: true })
  })

  it('claims no ending when a lost run comes back idle or done; the recorder decides', () => {
    const lost = trackActivity({ wasActive: true }, 'idle', washer('unavailable'))
    const back = trackActivity(lost, 'ended', washer('end', '2026-11-14T19:59:00Z'))
    expect(back).toEqual({ wasActive: false, lost: true })
    expect(trackActivity(back, 'idle', washer('power_off'))).toEqual({
      wasActive: false,
      lost: true,
    })
    expect(trackActivity(lost, 'idle', washer('power_off')).endedAt).toBeUndefined()
  })

  it('keeps a Done it saw through a drop-out, and an idle job stays idle', () => {
    const done = { wasActive: false, endedAt: 5 }
    expect(trackActivity(done, 'idle', washer('unavailable'))).toBe(done)
    expect(trackActivity(undefined, 'idle', washer('unavailable'))).toEqual({ wasActive: false })
  })

  it('shows no Done for running → unavailable → end, unless the recorder says so', () => {
    let track = trackActivity(undefined, 'active', washer('rinsing'))
    track = trackActivity(track, 'idle', washer('unavailable', '2026-11-14T19:50:00Z'))
    const end = washer('end', '2026-11-14T19:55:00Z')
    track = trackActivity(track, 'ended', end)
    const read = (history?: { status: 'unknown' } | { status: 'ended'; at: number }) =>
      readActivity(hassWith(end), { entity: WASHER }, { now: NOW, track, history }).kind
    expect(read()).toBe('idle')
    expect(read({ status: 'unknown' })).toBe('idle')
    expect(read({ status: 'ended', at: NOW - MIN })).toBe('done')
  })
})

describe('parseClock and durationOf', () => {
  it('reads H:MM:SS, H:MM, a Python timedelta and ISO 8601', () => {
    expect(parseClock('1:05:30')).toBe(65 * MIN + 30_000)
    expect(parseClock('0:45')).toBe(45 * MIN)
    expect(parseClock('1 day, 2:00:00')).toBe(26 * 60 * MIN)
    expect(parseClock('PT1H5M')).toBe(65 * MIN)
    expect(parseClock('P1D')).toBe(24 * 60 * MIN)
  })

  it('refuses what is not a clock', () => {
    expect(parseClock('running')).toBeUndefined()
    expect(parseClock('PT')).toBeUndefined()
    expect(parseClock('P')).toBeUndefined()
  })

  it('converts each duration unit', () => {
    const d = (state: string, unit?: string) =>
      durationOf(entity('sensor.d', state, unit ? { unit_of_measurement: unit } : {}))
    expect(d('90', 's')).toBe(90_000)
    expect(d('42', 'min')).toBe(42 * MIN)
    expect(d('2.5', 'h')).toBe(150 * MIN)
    expect(d('1', 'd')).toBe(24 * 60 * MIN)
    expect(d('42')).toBe(42 * MIN)
    expect(d('1:30:00')).toBe(90 * MIN)
  })

  it('refuses an unknown unit and an unavailable sensor', () => {
    expect(durationOf(entity('sensor.d', '3', { unit_of_measurement: 'kWh' }))).toBeUndefined()
    expect(durationOf(entity('sensor.d', 'unavailable'))).toBeUndefined()
    expect(durationOf(undefined)).toBeUndefined()
  })
})

describe('remainingOf', () => {
  it('counts down to a timestamp, as LG ThinQ reports it', () => {
    expect(remainingOf(washerLeft('2026-11-14T20:23:00+00:00'), NOW)).toEqual({
      remainingMs: 23 * MIN,
      finishAt: Date.parse('2026-11-14T20:23:00Z'),
      ticking: true,
    })
  })

  it('reads a datetime even without the device class', () => {
    expect(remainingOf(entity('sensor.end', '2026-11-14T20:10:00Z'), NOW).remainingMs).toBe(
      10 * MIN,
    )
  })

  it('never counts a past end time below zero', () => {
    expect(remainingOf(washerLeft('2026-11-14T19:00:00Z'), NOW).remainingMs).toBe(0)
  })

  it('counts a duration from when it was reported, as Bambu reports it', () => {
    expect(remainingOf(printerLeft('2.4'), NOW)).toEqual({
      remainingMs: 144 * MIN,
      finishAt: NOW + 144 * MIN,
      ticking: true,
    })
    expect(remainingOf(printerLeft('2.4', '2026-11-14T19:30:00Z'), NOW)).toEqual({
      remainingMs: 114 * MIN,
      finishAt: NOW + 114 * MIN,
      ticking: true,
    })
  })

  it('does not count down a paused job, or a report older than its own duration', () => {
    const stale = printerLeft('0.5', '2026-11-14T19:00:00Z')
    expect(remainingOf(stale, NOW)).toEqual({
      remainingMs: 30 * MIN,
      finishAt: NOW + 30 * MIN,
      ticking: false,
    })
    expect(remainingOf(printerLeft('2.4', '2026-11-14T19:30:00Z'), NOW, true)).toEqual({
      remainingMs: 144 * MIN,
      finishAt: NOW + 144 * MIN,
      ticking: false,
    })
  })

  it('reads 0.0 h as no estimate rather than done', () => {
    expect(remainingOf(printerLeft('0.0'), NOW)).toEqual({})
  })

  it('reads unknown as nothing', () => {
    expect(remainingOf(washerLeft('unknown'), NOW)).toEqual({})
    expect(remainingOf(entity('sensor.end', 'soon', { device_class: 'timestamp' }), NOW)).toEqual(
      {},
    )
  })
})

describe('remainingParts and its spellings', () => {
  it('rounds up to the minute, and says so under one', () => {
    expect(formatRemaining(30_000)).toBe('<1 min')
    expect(formatRemaining(61_000)).toBe('2 min')
    expect(formatRemaining(23 * MIN)).toBe('23 min')
  })

  it('splits hours from minutes, and drops a zero', () => {
    expect(remainingParts(65 * MIN)).toEqual([
      { value: '1', unit: 'hr' },
      { value: '5', unit: 'min' },
    ])
    expect(formatRemaining(120 * MIN)).toBe('2 hr')
  })

  it('speaks in words', () => {
    expect(spokenRemaining(10_000)).toBe('less than a minute')
    expect(spokenRemaining(61 * MIN)).toBe('1 hour 1 minute')
    expect(spokenRemaining(150 * MIN)).toBe('2 hours 30 minutes')
  })
})

describe('formatClock', () => {
  it('follows the hour cycle it is given', () => {
    const at = Date.parse('2026-11-14T21:41:00Z')
    expect(formatClock(at, { locale: 'en-US', hour12: true, timeZone: 'UTC' })).toMatch(/9:41\sPM/)
    expect(formatClock(at, { locale: 'en-GB', hour12: false, timeZone: 'UTC' })).toBe('21:41')
  })
})

describe('progressOf', () => {
  it('reads a percentage first', () => {
    expect(progressOf(entity('sensor.p', '40', { unit_of_measurement: '%' }), 1, 2)).toBe(0.4)
  })

  it('clamps a percentage into range', () => {
    expect(progressOf(entity('sensor.p', '140'), undefined, undefined)).toBe(1)
    expect(progressOf(entity('sensor.p', '-3'), undefined, undefined)).toBe(0)
  })

  it('works it out from the time left and the whole job', () => {
    expect(progressOf(undefined, 15 * MIN, 60 * MIN)).toBe(0.75)
  })

  it('falls through an unavailable percentage to the times', () => {
    expect(progressOf(entity('sensor.p', 'unavailable'), 30 * MIN, 60 * MIN)).toBe(0.5)
  })

  it('answers nothing when nothing is known, which draws no bar', () => {
    expect(progressOf(undefined, 15 * MIN, undefined)).toBeUndefined()
    expect(progressOf(undefined, 15 * MIN, 0)).toBeUndefined()
  })
})

describe('activityName and activityIcon', () => {
  it('cuts the status sensor’s own word for itself off the name', () => {
    expect(activityName(washer('running'))).toBe('Front Load Washer')
    expect(activityName(printer('running'))).toBe('Horatio')
    expect(activityName(entity('sensor.vlad', 'off', { friendly_name: 'Vlad Status code' }))).toBe(
      'Vlad',
    )
  })

  it('keeps a name that is nothing but the suffix', () => {
    expect(activityName(entity('sensor.s', 'off', { friendly_name: 'Status' }))).toBe('Status')
  })

  it('guesses the appliance, a dishwasher before a washer', () => {
    expect(activityIcon(washer('running'))).toBe('mdi:washing-machine')
    expect(activityIcon(entity('sensor.dishwasher_current_status', 'running'))).toBe(
      'mdi:dishwasher',
    )
    expect(activityIcon(entity('sensor.dryer_current_status', 'running'))).toBe('mdi:tumble-dryer')
    expect(activityIcon(printer('running'))).toBe('mdi:printer-3d-nozzle')
    expect(activityIcon(entity('vacuum.abbie_litter_box', 'cleaning'))).toBe('mdi:cat')
  })

  it('prefers the entity’s own icon, and falls back to a timer rather than an eye', () => {
    expect(activityIcon(entity('sensor.x', 'on', { icon: 'mdi:fire' }))).toBe('mdi:fire')
    expect(activityIcon(entity('sensor.mystery', 'on'))).toBe('mdi:timer-outline')
    expect(activityIcon(entity('vacuum.hall', 'cleaning'))).toBe('mdi:robot-vacuum')
  })
})

describe('formatState', () => {
  it('prefers the frontend’s own formatter when there is one', () => {
    const hass = {
      ...hassWith(),
      formatEntityState: (e: HassEntity) => (e.state === 'ccp' ? 'Clean cycle in progress' : ''),
    } as unknown as HomeAssistant
    expect(formatState(hass, entity('sensor.vlad', 'ccp'))).toBe('Clean cycle in progress')
    // An empty answer falls through to the library's own.
    expect(formatState(hass, entity('sensor.vlad', 'power_off'))).toBe('Power off')
  })
})

describe('stepText', () => {
  it('says which layer of how many', () => {
    const layer = entity('sensor.layer', '120')
    expect(stepText(layer, entity('sensor.total', '300'), 'Layer')).toBe('Layer 120 of 300')
    expect(stepText(layer, undefined, undefined)).toBe('Step 120')
    expect(stepText(layer, entity('sensor.total', '0'), ' ')).toBe('Step 120')
  })

  it('says nothing without a number', () => {
    expect(stepText(entity('sensor.layer', 'unknown'), undefined, 'Layer')).toBeUndefined()
    expect(stepText(undefined, undefined, 'Layer')).toBeUndefined()
  })
})

describe('readActivity', () => {
  const RUNNING_WASHER: ActivityConfig = {
    entity: WASHER,
    remaining_entity: WASHER_LEFT,
    total_entity: WASHER_TOTAL,
  }

  it('reads a running LG washer: phase, countdown, finish time and a worked-out bar', () => {
    const hass = hassWith(
      washer('rinsing'),
      washerLeft('2026-11-14T20:15:00+00:00'),
      washerTotal('60'),
    )
    const view = readActivity(hass, RUNNING_WASHER, { now: NOW })
    expect(view).toMatchObject({
      entityId: WASHER,
      name: 'Front Load Washer',
      icon: 'mdi:washing-machine',
      kind: 'active',
      phase: 'Rinsing',
      remainingMs: 15 * MIN,
      finishAt: Date.parse('2026-11-14T20:15:00Z'),
      progress: 0.75,
      visible: true,
      color: 'var(--cw-accent)',
      action: { action: 'more-info' },
    })
  })

  it('reads a printing Bambu: the stage over the status, and the layer', () => {
    const hass = hassWith(
      printer('running'),
      entity('sensor.p1s_stage', 'printing'),
      entity('sensor.p1s_progress', '40', { unit_of_measurement: '%' }),
      printerLeft('2.4'),
      entity('sensor.p1s_layer', '120'),
      entity('sensor.p1s_layers', '300'),
    )
    const view = readActivity(
      hass,
      {
        entity: PRINTER,
        phase_entity: 'sensor.p1s_stage',
        progress_entity: 'sensor.p1s_progress',
        remaining_entity: 'sensor.p1s_01p00c5b1502493_remaining_time',
        step_entity: 'sensor.p1s_layer',
        step_total_entity: 'sensor.p1s_layers',
        step_label: 'Layer',
        color: 'orange',
      },
      { now: NOW },
    )
    expect(view).toMatchObject({
      phase: 'Printing',
      detail: 'Layer 120 of 300',
      progress: 0.4,
      remainingMs: 144 * MIN,
      color: 'var(--cw-orange)',
    })
  })

  it('falls back to the status when the phase entity reads idle', () => {
    const hass = hassWith(printer('prepare'), entity('sensor.p1s_stage', 'idle'))
    const view = readActivity(
      hass,
      { entity: PRINTER, phase_entity: 'sensor.p1s_stage' },
      { now: NOW },
    )
    expect(view.phase).toBe('Prepare')
  })

  it('hides an idle activity by default, and shows it dimmed when asked', () => {
    const hass = hassWith(washer('power_off'))
    expect(readActivity(hass, { entity: WASHER }, { now: NOW })).toMatchObject({
      kind: 'idle',
      visible: false,
      phase: 'Power off',
    })
    expect(
      readActivity(hass, { entity: WASHER }, { now: NOW, defaults: { when_idle: 'show' } }).visible,
    ).toBe(true)
    // The row's own word beats the card's, both ways.
    expect(
      readActivity(
        hass,
        { entity: WASHER, when_idle: 'hide' },
        {
          now: NOW,
          defaults: { when_idle: 'show' },
        },
      ).visible,
    ).toBe(false)
    expect(readActivity(hass, { entity: WASHER, when_idle: 'show' }, { now: NOW }).visible).toBe(
      true,
    )
  })

  it('says Done in green for a done state inside the linger, and not after', () => {
    const justNow = new Date(NOW - 3 * MIN).toISOString()
    const hass = hassWith(washer('end', justNow))
    const row: ActivityConfig = { entity: WASHER, progress_entity: 'sensor.whatever' }
    expect(readActivity(hass, row, { now: NOW })).toMatchObject({
      kind: 'done',
      phase: 'Done',
      color: 'var(--cw-green)',
      finishAt: NOW - 3 * MIN,
      progress: 1,
      visible: true,
      icon: 'mdi:washing-machine',
    })
    expect(readActivity(hass, row, { now: NOW + DEFAULT_DONE_MINUTES * MIN })).toMatchObject({
      kind: 'idle',
      visible: false,
    })
  })

  it('takes the linger from the row, then the card, and 0 never shows Done', () => {
    const hass = hassWith(washer('end', new Date(NOW - 20 * MIN).toISOString()))
    expect(readActivity(hass, { entity: WASHER }, { now: NOW }).kind).toBe('idle')
    expect(
      readActivity(hass, { entity: WASHER }, { now: NOW, defaults: { done_minutes: 30 } }).kind,
    ).toBe('done')
    expect(
      readActivity(
        hass,
        { entity: WASHER, done_minutes: 15 },
        {
          now: NOW,
          defaults: { done_minutes: 30 },
        },
      ).kind,
    ).toBe('idle')
    const fresh = hassWith(washer('end', new Date(NOW - 10_000).toISOString()))
    expect(readActivity(fresh, { entity: WASHER, done_minutes: 0 }, { now: NOW }).kind).toBe('idle')
  })

  it('draws a failure in red with its own word, and no bar', () => {
    const hass = hassWith(printer('failed', new Date(NOW - MIN).toISOString()))
    expect(
      readActivity(hass, { entity: PRINTER, progress_entity: 'sensor.p' }, { now: NOW }),
    ).toMatchObject({
      kind: 'failed',
      phase: 'Failed',
      color: 'var(--cw-red)',
      progress: undefined,
    })
  })

  it('shows Done for a job that went straight to idle, only when the card saw it running', () => {
    const off = washer('power_off', new Date(NOW - 2 * MIN).toISOString())
    const hass = hassWith(off)
    const seen = trackActivity({ wasActive: true }, 'idle', off)
    expect(readActivity(hass, { entity: WASHER }, { now: NOW, track: seen }).kind).toBe('done')
    expect(readActivity(hass, { entity: WASHER }, { now: NOW }).kind).toBe('idle')
  })

  it('is not reporting when the status entity is missing', () => {
    expect(readActivity(hassWith(), { entity: WASHER }, { now: NOW })).toMatchObject({
      kind: 'idle',
      unavailable: true,
      visible: false,
      name: WASHER,
      phase: 'Not reporting',
    })
  })

  it('carries the press, and presses nothing without an entity', () => {
    const hass = hassWith(washer('running'))
    const view = readActivity(
      hass,
      {
        entity: WASHER,
        tap_action: { action: 'navigate', navigation_path: '/laundry' },
        hold_action: { action: 'more-info' },
        double_tap_action: { action: 'none' },
      },
      { now: NOW },
    )
    expect(view.action).toEqual({ action: 'navigate', navigation_path: '/laundry' })
    expect(view.holdAction).toEqual({ action: 'more-info' })
    expect(view.doubleTapAction).toBeUndefined()
    expect(readActivity(hass, {}, { now: NOW }).action).toEqual({ action: 'none' })
  })

  it('takes the card colour when the row has none', () => {
    const hass = hassWith(washer('running'))
    expect(
      readActivity(hass, { entity: WASHER }, { now: NOW, defaults: { color: 'teal' } }).color,
    ).toBe('var(--cw-teal)')
  })
})

describe('spokenLabel', () => {
  const clock = () => '8:15 PM'
  const hass = hassWith(
    washer('rinsing'),
    washerLeft('2026-11-14T20:15:00+00:00'),
    washerTotal('60'),
  )
  const view = readActivity(
    hass,
    { entity: WASHER, remaining_entity: WASHER_LEFT, total_entity: WASHER_TOTAL },
    { now: NOW },
  )

  it('reads what the panel shows, in the order it shows it', () => {
    expect(spokenLabel(view, 'remaining', clock)).toBe(
      'Front Load Washer, Rinsing, 15 minutes left, 75 percent',
    )
    expect(spokenLabel(view, 'both', clock)).toBe(
      'Front Load Washer, Rinsing, 15 minutes left, done at 8:15 PM, 75 percent',
    )
    expect(spokenLabel(view, 'finish', clock)).toBe(
      'Front Load Washer, Rinsing, done at 8:15 PM, 75 percent',
    )
  })

  it('says when an ending happened', () => {
    const done = readActivity(
      hassWith(washer('end', new Date(NOW - MIN).toISOString())),
      {
        entity: WASHER,
      },
      { now: NOW },
    )
    expect(spokenLabel(done, 'remaining', clock)).toBe('Front Load Washer, Done, at 8:15 PM')
  })
})

describe('the card-level readers', () => {
  it('fall back to the defaults silently', () => {
    expect(styleFor('compact')).toBe('compact')
    expect(styleFor('Compact')).toBe('expanded')
    expect(timeFor('both')).toBe('both')
    expect(timeFor(3)).toBe('remaining')
    expect(whenIdleFor('message')).toBe('message')
    expect(whenIdleFor(undefined)).toBe('hide')
  })

  it('reads minutes as a whole number in range', () => {
    expect(minutesFor(5.4)).toBe(5)
    expect(minutesFor('12')).toBe(12)
    expect(minutesFor(-3)).toBe(0)
    expect(minutesFor(9999)).toBe(240)
    expect(minutesFor('')).toBeUndefined()
    expect(minutesFor(undefined)).toBeUndefined()
  })
})

describe('rows', () => {
  it('reads bare ids and objects, and drops the rest', () => {
    expect(
      activityConfigs([WASHER, { entity: PRINTER, name: 'P1S' }, 3, null, '', { entity: '' }]),
    ).toEqual([{ entity: WASHER }, { entity: PRINTER, name: 'P1S' }, {}])
    expect(activityConfigs('sensor.x')).toEqual([])
  })

  it('reads hand-written state lists as lists of strings', () => {
    expect(
      activityConfigs([
        {
          entity: WASHER,
          active_states: 'running, washing',
          idle_states: [0, ' off ', null, 'off'],
          done_states: [],
        },
      ]),
    ).toEqual([
      { entity: WASHER, active_states: ['running', 'washing'], idle_states: ['0', 'off'] },
    ])
    expect(activityConfigs([{ entity: '', done_states: [9] }])).toEqual([{ done_states: ['9'] }])
  })

  it('watches every entity a row names, once', () => {
    expect(
      activityWatchedIds([
        { entity: WASHER, remaining_entity: WASHER_LEFT, total_entity: WASHER_TOTAL },
        { entity: WASHER, progress_entity: 'sensor.p', phase_entity: 'sensor.s' },
        { step_entity: 'sensor.l', step_total_entity: 'sensor.t' },
      ]),
    ).toEqual([WASHER, WASHER_LEFT, WASHER_TOTAL, 'sensor.s', 'sensor.p', 'sensor.l', 'sensor.t'])
  })

  it('keys duplicates apart and writes a bare row back as its id', () => {
    expect(activityKeys([{ entity: WASHER }, { entity: WASHER }, {}])).toEqual([
      WASHER,
      `${WASHER}#1`,
      '#2',
    ])
    expect(activityRows([{ entity: WASHER }, { entity: PRINTER, name: 'P1S' }])).toEqual([
      WASHER,
      { entity: PRINTER, name: 'P1S' },
    ])
  })
})

describe('the form', () => {
  it('flattens a row, with the inherit sentinel and the implicit press shown', () => {
    expect(activityToForm({ entity: WASHER })).toMatchObject({
      entity: WASHER,
      active_states: [],
      idle_states: [],
      done_states: [],
      when_idle: WHEN_IDLE_INHERIT,
      action: 'more-info',
      on_hold_action: 'none',
      on_double_tap_action: 'none',
    })
  })

  it('round-trips a full row unchanged', () => {
    const row: ActivityConfig = {
      entity: PRINTER,
      name: 'Horatio',
      icon: 'mdi:printer-3d',
      color: 'orange',
      phase_entity: 'sensor.stage',
      progress_entity: 'sensor.progress',
      remaining_entity: 'sensor.left',
      total_entity: 'sensor.total',
      step_entity: 'sensor.layer',
      step_total_entity: 'sensor.layers',
      step_label: 'Layer',
      active_states: ['running', 'prepare'],
      idle_states: ['slicing'],
      done_states: ['ccc'],
      done_minutes: 5,
      when_idle: 'show',
      tap_action: { action: 'navigate', navigation_path: '/printers' },
      hold_action: { action: 'more-info' },
    }
    expect(activityFromForm(row, activityToForm(row))).toEqual(row)
  })

  it('writes nothing for an untouched row', () => {
    const row: ActivityConfig = { entity: WASHER }
    expect(activityFromForm(row, activityToForm(row))).toEqual(row)
  })

  it('cleans the state lists and drops an inherited choice', () => {
    const next = activityFromForm(
      { entity: WASHER },
      {
        ...activityToForm({ entity: WASHER }),
        idle_states: [' night_dry ', 'night_dry', ''],
        done_states: 'end, ccc',
        when_idle: 'inherit',
        done_minutes: '',
      },
    )
    expect(next).toEqual({
      entity: WASHER,
      idle_states: ['night_dry'],
      done_states: ['end', 'ccc'],
    })
  })

  it('does not strand the implicit more-info when the entity is cleared', () => {
    const prior: ActivityConfig = { entity: WASHER }
    expect(activityFromForm(prior, { ...activityToForm(prior), entity: '' })).toEqual({})
  })

  it('does not write the blank row’s none when an entity is chosen', () => {
    const prior: ActivityConfig = {}
    expect(activityFromForm(prior, { ...activityToForm(prior), entity: WASHER })).toEqual({
      entity: WASHER,
    })
  })
})

describe('seconds', () => {
  const HOUR = 60 * MIN

  it('reads the mode, falling back to the last hour', () => {
    expect(secondsFor('never')).toBe('never')
    expect(secondsFor('ten_minutes')).toBe('ten_minutes')
    expect(secondsFor('always')).toBe('hour')
    expect(secondsThreshold('hour')).toBe(HOUR)
    expect(secondsThreshold('ten_minutes')).toBe(10 * MIN)
    expect(secondsThreshold('never')).toBe(0)
  })

  it('prints m:ss under the threshold, rounding up like the Clock app', () => {
    expect(formatRemaining(23 * MIN + 4_200, HOUR)).toBe('23:05')
    expect(formatRemaining(400, HOUR)).toBe('0:01')
    expect(formatRemaining(0, HOUR)).toBe('0:00')
    expect(remainingParts(9 * MIN, HOUR)).toEqual([{ value: '9:00', unit: '' }])
  })

  it('starts the last hour at 59:59, never 60:00', () => {
    expect(formatRemaining(HOUR, HOUR)).toBe('1 hr')
    expect(formatRemaining(HOUR - 500, HOUR)).toBe('1 hr')
    expect(formatRemaining(HOUR - 1000, HOUR)).toBe('59:59')
  })

  it('keeps minutes above the threshold and with seconds off', () => {
    expect(formatRemaining(23 * MIN, 10 * MIN)).toBe('23 min')
    expect(formatRemaining(5 * MIN, 0)).toBe('5 min')
  })

  it('speaks seconds too', () => {
    expect(spokenRemaining(4 * MIN + 5_000, HOUR)).toBe('4 minutes 5 seconds')
    expect(spokenRemaining(1_000, HOUR)).toBe('1 second')
    expect(spokenRemaining(0, HOUR)).toBe('0 seconds')
  })
})

describe('nextChangeIn', () => {
  const HOUR = 60 * MIN

  it('waits for the next whole second under the threshold', () => {
    expect(nextChangeIn(23 * MIN + 4_200, HOUR)).toBe(200)
    expect(nextChangeIn(5_000, HOUR)).toBe(1000)
  })

  it('waits for the next whole minute above it', () => {
    expect(nextChangeIn(90 * MIN + 12_000, HOUR)).toBe(12_000)
    expect(nextChangeIn(2 * HOUR, HOUR)).toBe(MIN)
    expect(nextChangeIn(23 * MIN + 4_200, 0)).toBe(4_200)
  })

  it('wakes for the switch to seconds, one second short of the threshold', () => {
    // At 60:00.5 the display says "1 hr 1 min"; in 0.5s it says "1 hr", and a second after
    // that, at 59:59, the seconds begin.
    expect(nextChangeIn(HOUR + 500, HOUR)).toBe(500)
    expect(nextChangeIn(HOUR, HOUR)).toBe(1000)
    expect(nextChangeIn(10 * MIN + 30_000, 10 * MIN)).toBe(30_000)
  })

  it('agrees with what is printed: one tick later the text has changed, one ms before it has not', () => {
    for (const ms of [HOUR + 500, 23 * MIN + 4_200, 90 * MIN + 12_000, 61_000, 59_999]) {
      for (const threshold of [0, 10 * MIN, HOUR]) {
        const wait = nextChangeIn(ms, threshold)
        if (wait === undefined) continue
        expect(formatRemaining(ms - wait + 1, threshold)).toBe(formatRemaining(ms, threshold))
        expect(formatRemaining(ms - wait, threshold)).not.toBe(formatRemaining(ms, threshold))
      }
    }
  })

  it('stops once the countdown has run out, or says "<1 min" to the end', () => {
    expect(nextChangeIn(59_999, 0)).toBeUndefined()
    expect(nextChangeIn(MIN, 0)).toBe(1)
    expect(nextChangeIn(0, HOUR)).toBeUndefined()
    expect(nextChangeIn(-5, HOUR)).toBeUndefined()
  })
})

describe('nextTickIn', () => {
  const HOUR = 60 * MIN

  it('takes the soonest countdown or linger, ignoring what does not move', () => {
    const views = [
      { kind: 'active' as const, finishAt: NOW + 30 * MIN + 2_500, ticking: true },
      { kind: 'active' as const, finishAt: NOW + 5 * MIN, ticking: false },
      { kind: 'done' as const, lingerUntil: NOW + 1_000 * 90 },
      { kind: 'idle' as const },
    ]
    expect(nextTickIn(views, NOW, HOUR, 'remaining')).toBe(500)
    expect(nextTickIn(views, NOW, 0, 'remaining')).toBe(2_500)
    // A finish-time card prints clock times; only the linger is left to wait for.
    expect(nextTickIn(views, NOW, HOUR, 'finish')).toBe(90_000)
  })

  it('runs no timer for a card with nothing moving', () => {
    expect(nextTickIn([{ kind: 'idle' }], NOW, HOUR, 'remaining')).toBeUndefined()
  })
})

describe('remainingFromText', () => {
  it('reads a datetime as the finish time, ticking', () => {
    expect(remainingFromText('2026-11-14T20:05:00Z', NOW)).toEqual({
      remainingMs: 5 * MIN,
      finishAt: NOW + 5 * MIN,
      ticking: true,
    })
  })

  it('reads a clock or a number of minutes as a duration', () => {
    expect(remainingFromText('1:30:00', NOW)?.remainingMs).toBe(90 * MIN)
    expect(remainingFromText(' 42 ', NOW)?.remainingMs).toBe(42 * MIN)
  })

  it('refuses words, which are printed instead', () => {
    expect(remainingFromText('Almost there', NOW)).toBeUndefined()
    expect(remainingFromText('0', NOW)).toBeUndefined()
  })
})

describe('templates', () => {
  const resolverOf =
    (answers: Record<string, string>) =>
    (template: string): string | undefined =>
      answers[template]

  it('registers every templated field and action, with the row’s entity and the user', () => {
    const requests = activityTemplates(
      [
        {
          entity: WASHER,
          name: '{{ "W" }}',
          phase: "{{ states('sensor.x') }}",
          show: '{{ true }}',
          icon: 'mdi:fire',
          tap_action: { action: 'navigate', navigation_path: '{{ "/a" }}' },
        },
        { name: '{{ 1 }}' },
      ],
      'Joe',
    )
    expect(requests).toEqual([
      {
        template: '{{ "W" }}',
        variables: { config: { entity: WASHER }, entity: WASHER, user: 'Joe' },
      },
      {
        template: "{{ states('sensor.x') }}",
        variables: { config: { entity: WASHER }, entity: WASHER, user: 'Joe' },
      },
      {
        template: '{{ true }}',
        variables: { config: { entity: WASHER }, entity: WASHER, user: 'Joe' },
      },
      {
        template: '{{ "/a" }}',
        variables: { config: { entity: WASHER }, entity: WASHER, user: 'Joe' },
      },
      { template: '{{ 1 }}', variables: { user: 'Joe' } },
    ])
    expect(hasTemplates({ phase: '{{ x }}' })).toBe(true)
    expect(hasTemplates({ phase: 'Washing' })).toBe(false)
    expect(
      hasTemplates({ tap_action: { action: 'navigate', navigation_path: '{{ "/a" }}' } }),
    ).toBe(true)
    expect(hasTemplates({ hold_action: { action: 'navigate', navigation_path: '/a' } })).toBe(false)
  })

  it('draws the answers in place of name, icon, colour, phase, detail and time', () => {
    const hass = hassWith(washer('rinsing'), washerLeft('2026-11-14T20:15:00+00:00'))
    const row: ActivityConfig = {
      entity: WASHER,
      remaining_entity: WASHER_LEFT,
      name: '{{ n }}',
      icon: '{{ i }}',
      color: '{{ c }}',
      phase: '{{ p }}',
      detail: '{{ d }}',
      remaining: '{{ r }}',
    }
    const view = readActivity(hass, row, {
      now: NOW,
      resolve: resolverOf({
        '{{ n }}': 'Laundry',
        '{{ i }}': 'mdi:tshirt-crew',
        '{{ c }}': 'teal',
        '{{ p }}': 'Washing',
        '{{ d }}': 'Cottons 40°',
        '{{ r }}': '0:42:00',
      }),
    })
    expect(view).toMatchObject({
      name: 'Laundry',
      icon: 'mdi:tshirt-crew',
      color: 'var(--cw-teal)',
      phase: 'Washing',
      detail: 'Cottons 40°',
      remainingMs: 42 * MIN,
      ticking: false,
      timeText: undefined,
    })
  })

  it('prints a time template that is not a time as written', () => {
    const hass = hassWith(washer('rinsing'))
    const view = readActivity(
      hass,
      { entity: WASHER, remaining: '{{ r }}' },
      { now: NOW, resolve: resolverOf({ '{{ r }}': 'Nearly' }) },
    )
    expect(view).toMatchObject({ timeText: 'Nearly', remainingMs: undefined })
    expect(spokenLabel(view, 'remaining', () => '')).toBe('Front Load Washer, Rinsing, Nearly')
  })

  it('shows what it would anyway while a template has not answered', () => {
    const hass = hassWith(washer('rinsing'), washerLeft('2026-11-14T20:15:00+00:00'))
    const view = readActivity(
      hass,
      {
        entity: WASHER,
        remaining_entity: WASHER_LEFT,
        name: '{{ n }}',
        phase: '{{ p }}',
        remaining: '{{ r }}',
        show: '{{ s }}',
      },
      { now: NOW, resolve: () => undefined },
    )
    expect(view).toMatchObject({
      name: 'Front Load Washer',
      phase: 'Rinsing',
      remainingMs: 15 * MIN,
      visible: true,
    })
  })

  it('lets show force an idle activity in, and a running one out', () => {
    const idle = hassWith(washer('power_off'))
    const on = resolverOf({ '{{ s }}': 'True' })
    const off = resolverOf({ '{{ s }}': 'False' })
    expect(
      readActivity(idle, { entity: WASHER, show: '{{ s }}' }, { now: NOW, resolve: on }).visible,
    ).toBe(true)
    const running = hassWith(washer('rinsing'))
    expect(
      readActivity(running, { entity: WASHER, show: '{{ s }}' }, { now: NOW, resolve: off })
        .visible,
    ).toBe(false)
  })

  it('stops the countdown of a paused job', () => {
    const hass = hassWith(printer('pause'), printerLeft('1', '2026-11-14T19:30:00Z'))
    const view = readActivity(
      hass,
      { entity: PRINTER, remaining_entity: 'sensor.p1s_01p00c5b1502493_remaining_time' },
      { now: NOW },
    )
    expect(view).toMatchObject({ remainingMs: 60 * MIN, ticking: false })
  })

  it('round-trips the template fields through the form', () => {
    const row: ActivityConfig = {
      entity: WASHER,
      phase: '{{ p }}',
      detail: 'Cottons',
      remaining: '{{ r }}',
      show: '{{ s }}',
    }
    expect(activityFromForm(row, activityToForm(row))).toEqual(row)
  })
})

describe('endedAtFor', () => {
  const ended = washer('end', '2026-11-14T19:55:00Z')
  const off = washer('power_off', '2026-11-14T19:55:00Z')

  it('trusts what the card saw first', () => {
    expect(endedAtFor('idle', off, { wasActive: false, endedAt: 7 }, { status: 'none' })).toBe(7)
  })

  it('takes the recorder’s ending', () => {
    expect(endedAtFor('idle', off, undefined, { status: 'ended', at: 9 })).toBe(9)
  })

  it('shows nothing while the recorder is being asked, or after it says no', () => {
    expect(endedAtFor('ended', ended, undefined, { status: 'pending' })).toBeUndefined()
    expect(endedAtFor('ended', ended, undefined, { status: 'none' })).toBeUndefined()
    expect(endedAtFor('idle', off, undefined, { status: 'none' })).toBeUndefined()
  })

  it('falls back to a done state’s own change only when there is no recorder to ask', () => {
    expect(endedAtFor('ended', ended, undefined, { status: 'unknown' })).toBe(
      Date.parse('2026-11-14T19:55:00Z'),
    )
    expect(endedAtFor('ended', ended, undefined, undefined)).toBe(
      Date.parse('2026-11-14T19:55:00Z'),
    )
    expect(endedAtFor('idle', off, undefined, { status: 'unknown' })).toBeUndefined()
  })

  it('never ends a running job', () => {
    expect(
      endedAtFor('active', washer('running'), { wasActive: false, endedAt: 1 }, undefined),
    ).toBeUndefined()
  })

  it('reads Done from the recorder in readActivity, and keeps the end time', () => {
    const hass = hassWith(off)
    expect(
      readActivity(
        hass,
        { entity: WASHER },
        { now: NOW, history: { status: 'ended', at: NOW - 6 * MIN } },
      ),
    ).toMatchObject({ kind: 'done', finishAt: NOW - 6 * MIN, lingerUntil: NOW + 4 * MIN })
    expect(
      readActivity(
        hassWith(ended),
        { entity: WASHER },
        { now: NOW, history: { status: 'pending' } },
      ).kind,
    ).toBe('idle')
  })
})

describe('a delayed start, forced into view', () => {
  it('prints the time text on an idle activity, and reads it out', () => {
    const view = readActivity(
      hassWith(washer('power_off')),
      { entity: WASHER, show: '{{ s }}', remaining: '{{ r }}', phase: 'Delayed' },
      {
        now: NOW,
        resolve: t => ({ '{{ s }}': 'on', '{{ r }}': 'Starts 1:00' })[t],
      },
    )
    expect(view).toMatchObject({
      kind: 'idle',
      visible: true,
      phase: 'Delayed',
      timeText: 'Starts 1:00',
    })
    expect(spokenLabel(view, 'remaining', () => '')).toBe('Front Load Washer, Delayed, Starts 1:00')
  })
})
