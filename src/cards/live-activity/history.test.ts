import { describe, expect, it } from 'vitest'

import {
  historyEndedAt,
  historyKey,
  historyRequest,
  historyVerdict,
  needsHistory,
  settleVerdict,
  type HistoryRow,
} from './history'
import type { HassEntity } from '../../core/types/ha'

const NOW = Date.parse('2026-11-14T20:00:00Z')
const MIN = 60_000
const LINGER = 10 * MIN

const status = (state: string, changed: number): HassEntity => ({
  entity_id: 'sensor.washer_current_status',
  state,
  attributes: {},
  last_changed: new Date(changed).toISOString(),
  last_updated: new Date(changed).toISOString(),
})

/** A history row at `minutesAgo`, in the recorder's seconds. */
const at = (s: string, minutesAgo: number): HistoryRow => ({
  s,
  lu: (NOW - minutesAgo * MIN) / 1000,
})

describe('needsHistory', () => {
  it('asks about a recent change the card did not see', () => {
    expect(needsHistory('idle', status('power_off', NOW - 3 * MIN), NOW, LINGER, undefined)).toBe(
      true,
    )
    expect(needsHistory('ended', status('finish', NOW - 3 * MIN), NOW, LINGER, undefined)).toBe(
      true,
    )
  })

  it('does not ask about a running job, an old change, or one the card saw end', () => {
    expect(needsHistory('active', status('running', NOW - MIN), NOW, LINGER, undefined)).toBe(false)
    expect(needsHistory('idle', status('power_off', NOW - 30 * MIN), NOW, LINGER, undefined)).toBe(
      false,
    )
    expect(
      needsHistory('idle', status('power_off', NOW - MIN), NOW, LINGER, {
        wasActive: false,
        endedAt: NOW - MIN,
      }),
    ).toBe(false)
    expect(needsHistory('idle', status('power_off', NOW - MIN), NOW, 0, undefined)).toBe(false)
    expect(needsHistory('idle', undefined, NOW, LINGER, undefined)).toBe(false)
  })
})

describe('historyRequest', () => {
  it('asks for this entity’s states, from before the linger to now', () => {
    expect(historyRequest(status('power_off', NOW - 3 * MIN), NOW, LINGER)).toEqual({
      type: 'history/history_during_period',
      start_time: new Date(NOW - 11 * MIN).toISOString(),
      end_time: new Date(NOW + MIN).toISOString(),
      entity_ids: ['sensor.washer_current_status'],
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    })
  })

  it('keys by entity and the change it is about', () => {
    const one = status('power_off', NOW - 3 * MIN)
    expect(historyKey(one)).toBe(`sensor.washer_current_status|${one.last_changed}`)
  })
})

describe('historyEndedAt', () => {
  it('finds the run before an LG washer’s end and power off, dated by the end', () => {
    const rows = [at('spinning', 15), at('end', 6), at('power_off', 5.5)]
    expect(historyEndedAt(rows, {})).toBe(NOW - 6 * MIN)
  })

  it('finds a run that began before the window, from the row the window opens on', () => {
    expect(historyEndedAt([at('running', 11), at('finish', 3)], {})).toBe(NOW - 3 * MIN)
  })

  it('reads lc over lu, and sorts what it is given', () => {
    const rows: HistoryRow[] = [
      { s: 'end', lc: (NOW - 4 * MIN) / 1000, lu: (NOW - 1 * MIN) / 1000 },
      at('rinsing', 9),
    ]
    expect(historyEndedAt(rows, {})).toBe(NOW - 4 * MIN)
  })

  it('says no run for a restart: unavailable, then the same state again', () => {
    expect(historyEndedAt([at('finish', 11), at('unavailable', 2), at('finish', 1.9)], {})).toBe(
      undefined,
    )
    expect(historyEndedAt([at('power_off', 11), at('unknown', 2), at('power_off', 1.9)], {})).toBe(
      undefined,
    )
  })

  it('says no run for a restart that wrote no unavailable: the same done state twice', () => {
    expect(historyEndedAt([at('finish', 11), at('finish', 2)], {})).toBeUndefined()
  })

  it('says no run when the job never started', () => {
    expect(historyEndedAt([at('initial', 8), at('power_off', 2)], {})).toBeUndefined()
  })

  it('says no run with only the current state, or nothing', () => {
    expect(historyEndedAt([at('power_off', 2)], {})).toBeUndefined()
    expect(historyEndedAt([], {})).toBeUndefined()
  })

  it('reads states with the row’s own lists', () => {
    const litter = { active_states: ['ccp'] }
    expect(historyEndedAt([at('ccp', 6), at('rdy', 2)], litter)).toBe(NOW - 2 * MIN)
    expect(historyEndedAt([at('dfs', 6), at('rdy', 2)], litter)).toBeUndefined()
  })
})

describe('historyVerdict', () => {
  const id = 'sensor.washer_current_status'

  it('reads an ending, or none', () => {
    expect(historyVerdict({ [id]: [at('running', 9), at('end', 2)] }, id, {})).toEqual({
      status: 'ended',
      at: NOW - 2 * MIN,
    })
    expect(historyVerdict({ [id]: [at('idle', 9), at('finish', 2)] }, id, {})).toEqual({
      status: 'none',
    })
  })

  it('reads an answer that has not caught up with the current state as pending', () => {
    // The browser's clock is behind: the query ended before the change to `end`.
    expect(historyVerdict({ [id]: [at('running', 9)] }, id, {}, 'end')).toEqual({
      status: 'pending',
    })
    expect(historyVerdict({ [id]: [at('running', 9), at('End', 2)] }, id, {}, 'end')).toEqual({
      status: 'ended',
      at: NOW - 2 * MIN,
    })
    expect(historyVerdict({}, id, {}, 'end')).toEqual({ status: 'unknown' })
  })

  it('says no run for running → unavailable → end, as the card’s memory does', () => {
    expect(
      historyVerdict(
        { [id]: [at('running', 9), at('unavailable', 5), at('end', 2)] },
        id,
        {},
        'end',
      ),
    ).toEqual({ status: 'none' })
  })

  it('calls an empty or unreadable answer unknown: the entity is not recorded', () => {
    expect(historyVerdict({}, id, {})).toEqual({ status: 'unknown' })
    expect(historyVerdict({ [id]: [] }, id, {})).toEqual({ status: 'unknown' })
    expect(historyVerdict(undefined, id, {})).toEqual({ status: 'unknown' })
  })
})

describe('settleVerdict', () => {
  it('keeps a real answer, retries one that had not caught up once, then gives up', () => {
    expect(settleVerdict({ status: 'none' }, false)).toEqual({ status: 'none' })
    expect(settleVerdict({ status: 'ended', at: 1 }, true)).toEqual({ status: 'ended', at: 1 })
    expect(settleVerdict({ status: 'pending' }, false)).toBe('retry')
    expect(settleVerdict({ status: 'pending' }, true)).toEqual({ status: 'unknown' })
  })
})
